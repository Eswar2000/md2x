import { readFile } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import {
  AlignmentType,
  Bookmark,
  BorderStyle,
  Document,
  ExternalHyperlink,
  HeadingLevel,
  ImageRun,
  InternalHyperlink,
  LevelFormat,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableOfContents,
  TableRow,
  TextRun,
  WidthType,
  type ISectionOptions,
} from "docx";
import type {
  Blockquote,
  Code,
  FootnoteDefinition,
  FootnoteReference,
  Heading,
  Image,
  List,
  ListItem,
  PhrasingContent,
  Root,
  RootContent,
  Table as MdTable,
  TableCell as MdTableCell,
} from "mdast";
import { visit } from "unist-util-visit";
import { common, createLowlight } from "lowlight";
import type { DocMeta, Theme } from "../types.js";

const lowlight = createLowlight(common);

/** Inline formatting flags threaded through phrasing content. */
interface InlineStyle {
  bold?: boolean;
  italics?: boolean;
  strike?: boolean;
  underline?: boolean;
  subscript?: boolean;
  superscript?: boolean;
  highlight?: boolean;
  code?: boolean;
  link?: boolean;
}

/** A run-level element that can live inside a paragraph. */
type InlineChild = TextRun | ExternalHyperlink | InternalHyperlink | ImageRun;

/** Decoded raster image ready to embed, sized to fit the page. */
interface LoadedImage {
  data: Buffer;
  type: "png" | "jpg" | "gif" | "bmp";
  width: number;
  height: number;
}

/** A block-level element that can live directly in the document body. */
type Block = Paragraph | Table | TableOfContents;

/** A single entry in the generated table of contents. */
interface TocEntry {
  depth: number;
  text: string;
  id: string;
}

type NumberingConfig = NonNullable<
  ConstructorParameters<typeof Document>[0]["numbering"]
>["config"][number];

const HEADING_LEVELS = [
  HeadingLevel.HEADING_1,
  HeadingLevel.HEADING_2,
  HeadingLevel.HEADING_3,
  HeadingLevel.HEADING_4,
  HeadingLevel.HEADING_5,
  HeadingLevel.HEADING_6,
] as const;

/**
 * Renders an mdast tree into a .docx binary buffer using the given theme.
 * Stateful because ordered lists require numbering definitions collected
 * up-front and passed to the Document constructor.
 */
class DocxRenderer {
  private numbering: NumberingConfig[] = [];
  private orderedCounter = 0;
  private bulletRef?: string;
  private tocEntries: TocEntry[] = [];
  private images = new Map<string, LoadedImage>();
  private footnoteDefs = new Map<string, FootnoteDefinition>();
  private footnoteNumbers = new Map<string, number>();
  private footnoteOrder: string[] = [];
  private notesRendered = false;
  private notesRef?: string;

  constructor(
    private readonly theme: Theme,
    private readonly meta: DocMeta,
    private readonly basePath: string,
  ) {}

  async render(tree: Root): Promise<Buffer> {
    this.tocEntries = collectTocEntries(tree);
    await this.preloadImages(tree);
    this.collectFootnotes(tree);
    const children = this.renderBlocks(tree.children);
    // If the source had references but no definition block appeared in the body
    // flow, still emit the Notes section at the very end.
    if (!this.notesRendered) children.push(...this.renderNotes());

    const section: ISectionOptions = {
      properties: {},
      children,
    };

    const doc = new Document({
      title: this.meta.title,
      creator: this.meta.author,
      subject: this.meta.subject,
      keywords: this.meta.keywords?.join(", "),
      numbering: { config: this.numbering },
      styles: {
        default: {
          document: {
            run: { font: this.theme.bodyFont, size: this.theme.bodySize },
            paragraph: { spacing: { after: 160, line: 276 } },
          },
        },
      },
      sections: [section],
    });

    return Packer.toBuffer(doc);
  }

  // ---- Block-level rendering -------------------------------------------------

  private renderBlocks(nodes: RootContent[]): Block[] {
    const out: Block[] = [];
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i]!;
      // A heading titled "Table of Contents" is replaced by a genuine, native
      // Word TOC field. We seed it with cached entries (built from the Heading
      // 1-3 bookmarks) so it renders populated and clickable immediately — no
      // empty box — and Word refreshes real page numbers on update. We do not
      // set the document-wide `updateFields` flag, so there is no "this file
      // refers to other files" prompt on open.
      if (node.type === "heading" && isTocHeading(node)) {
        out.push(this.renderHeading(node));
        out.push(
          new TableOfContents("Table of Contents", {
            hyperlink: true,
            headingStyleRange: "1-3",
            beginDirty: true,
            cachedEntries: this.tocEntries.map((entry) => ({
              title: entry.text,
              level: entry.depth,
              href: entry.id,
            })),
          }),
        );
        if (nodes[i + 1]?.type === "list") i++;
        continue;
      }
      switch (node.type) {
        case "heading":
          out.push(this.renderHeading(node));
          break;
        case "paragraph":
          out.push(new Paragraph({ children: this.renderInline(node.children, {}) }));
          break;
        case "list":
          out.push(...this.renderList(node, 0));
          break;
        case "blockquote":
          out.push(...this.renderBlockquote(node));
          break;
        case "code":
          out.push(...this.renderCode(node));
          break;
        case "table":
          out.push(this.renderTable(node));
          break;
        case "thematicBreak":
          out.push(this.renderThematicBreak());
          break;
        case "footnoteDefinition":
          // Definitions carry no inline output; the first one triggers the
          // in-body "Notes" section (rendered once, in document order).
          if (!this.notesRendered) {
            out.push(...this.renderNotes());
            this.notesRendered = true;
          }
          break;
        case "yaml":
        case "html":
          // Frontmatter is consumed separately; raw HTML is skipped for docx.
          break;
        default:
          break;
      }
    }
    return out;
  }

  private renderHeading(node: Heading): Paragraph {
    const size = this.theme.headingSizes[node.depth - 1] ?? this.theme.bodySize;
    const text = node.children.map(textOf).join("");
    const runs = node.children.map(
      (child) =>
        new TextRun({
          text: textOf(child),
          bold: node.depth <= 2,
          size,
          font: this.theme.headingFont,
          color: this.theme.headingColor,
        }),
    );
    return new Paragraph({
      heading: HEADING_LEVELS[node.depth - 1],
      spacing: { before: 240, after: 120 },
      // Wrap the heading text in a bookmark so a Table of Contents (or any
      // in-document `#anchor` link) can jump straight to this section.
      children: [new Bookmark({ id: anchorId(text), children: runs })],
    });
  }

  private renderList(
    node: List,
    depth: number,
    inheritedOrderedRef?: string,
  ): Paragraph[] {
    const ordered = Boolean(node.ordered);
    let orderedRef = inheritedOrderedRef;
    if (ordered && !orderedRef) {
      orderedRef = `md2x-ordered-${this.orderedCounter++}`;
      this.numbering.push(makeOrderedNumbering(orderedRef));
    }

    const out: Paragraph[] = [];
    for (const item of node.children) {
      out.push(...this.renderListItem(item, depth, ordered, orderedRef));
    }
    return out;
  }

  private renderListItem(
    item: ListItem,
    depth: number,
    ordered: boolean,
    orderedRef?: string,
  ): Paragraph[] {
    const out: Paragraph[] = [];
    let firstParagraphDone = false;
    // Indent continuation content to line up under the item's first line.
    const contentIndent = 360 * (depth + 1);

    for (const child of item.children) {
      if (child.type === "list") {
        out.push(...this.renderList(child, depth + 1, ordered ? orderedRef : undefined));
        continue;
      }
      if (child.type === "paragraph") {
        const runs = this.renderInline(child.children, {});
        if (!firstParagraphDone) {
          const prefixed =
            typeof item.checked === "boolean"
              ? [new TextRun({ text: item.checked ? "\u2611 " : "\u2610 " }), ...runs]
              : runs;
          out.push(
            new Paragraph({
              children: prefixed,
              numbering: {
                reference:
                  ordered && orderedRef ? orderedRef : this.ensureBulletNumbering(),
                level: depth,
              },
            }),
          );
          firstParagraphDone = true;
        } else {
          // Later paragraphs in the same item are continuation text: keep the
          // indent but no second bullet/number.
          out.push(
            new Paragraph({ children: runs, indent: { left: contentIndent }, spacing: { after: 80 } }),
          );
        }
        continue;
      }
      // Fallback: render other block children (e.g. nested code) inline-ish.
      out.push(...(this.renderBlocks([child]).filter((n) => n instanceof Paragraph) as Paragraph[]));
    }
    return out;
  }

  /** Lazily create a single shared bullet numbering with tight indentation. */
  private ensureBulletNumbering(): string {
    if (!this.bulletRef) {
      this.bulletRef = "md2x-bullet";
      this.numbering.push(makeBulletNumbering(this.bulletRef));
    }
    return this.bulletRef;
  }

  /** Embed a preloaded image, or fall back to `[alt]` text if it failed to load. */
  private renderImage(node: Image, style: InlineStyle): InlineChild {
    const img = node.url ? this.images.get(node.url) : undefined;
    if (!img) {
      return this.makeRun(node.alt ? `[${node.alt}]` : "[image]", {
        ...style,
        italics: true,
      });
    }
    return new ImageRun({
      type: img.type,
      data: img.data,
      transformation: { width: img.width, height: img.height },
      altText: node.alt
        ? { name: node.alt, title: node.alt, description: node.alt }
        : undefined,
    });
  }

  /** Fetch/read and decode every image in the tree once, before rendering. */
  private async preloadImages(tree: Root): Promise<void> {
    const urls = new Set<string>();
    visit(tree, "image", (node: Image) => {
      if (node.url) urls.add(node.url);
    });
    await Promise.all(
      [...urls].map(async (url) => {
        const img = await this.loadImage(url);
        if (img) this.images.set(url, img);
      }),
    );
  }

  /** Load image bytes from a data URI, http(s) URL, or local path relative to the source. */
  private async loadImage(url: string): Promise<LoadedImage | null> {
    try {
      let data: Buffer;
      if (url.startsWith("data:")) {
        const comma = url.indexOf(",");
        if (comma < 0) return null;
        const header = url.slice(5, comma);
        const payload = url.slice(comma + 1);
        data = header.includes("base64")
          ? Buffer.from(payload, "base64")
          : Buffer.from(decodeURIComponent(payload), "utf8");
      } else if (/^https?:\/\//i.test(url)) {
        const res = await fetch(url);
        if (!res.ok) return null;
        data = Buffer.from(await res.arrayBuffer());
      } else {
        const filePath = isAbsolute(url) ? url : resolve(this.basePath, url);
        data = await readFile(filePath);
      }
      const meta = imageMeta(data);
      if (!meta) return null;
      const { width, height } = scaleToFit(meta.width, meta.height, MAX_IMAGE_WIDTH);
      return { data, type: meta.type, width, height };
    } catch {
      // Unreadable/unsupported images degrade to the `[alt]` text fallback.
      return null;
    }
  }

  /**
   * Register footnote definitions and number them in order of first reference,
   * so the in-body "Notes" section matches the superscript markers in the text.
   */
  private collectFootnotes(tree: Root): void {
    for (const node of tree.children) {
      if (node.type === "footnoteDefinition") this.footnoteDefs.set(node.identifier, node);
    }
    visit(tree, "footnoteReference", (node: FootnoteReference) => {
      const id = node.identifier;
      if (!this.footnoteDefs.has(id) || this.footnoteNumbers.has(id)) return;
      this.footnoteOrder.push(id);
      this.footnoteNumbers.set(id, this.footnoteOrder.length);
    });
  }

  /**
   * Render the collected footnotes as an in-body "Notes" section: a heading
   * followed by a numbered list, each item bookmarked so the superscript
   * markers in the text can link to it.
   */
  private renderNotes(): Block[] {
    if (!this.footnoteOrder.length) return [];
    if (!this.notesRef) {
      this.notesRef = "md2x-notes";
      this.numbering.push(makeOrderedNumbering(this.notesRef));
    }

    const blocks: Block[] = [];
    blocks.push(
      new Paragraph({
        heading: HEADING_LEVELS[1],
        spacing: { before: 240, after: 120 },
        children: [
          new TextRun({
            text: "Notes",
            bold: true,
            size: this.theme.headingSizes[1] ?? this.theme.bodySize,
            font: this.theme.headingFont,
            color: this.theme.headingColor,
          }),
        ],
      }),
    );

    this.footnoteOrder.forEach((id, index) => {
      const def = this.footnoteDefs.get(id);
      if (!def) return;
      const paras = def.children.filter(
        (c): c is { type: "paragraph"; children: PhrasingContent[] } => c.type === "paragraph",
      );
      const firstRuns = paras.length ? this.renderInline(paras[0]!.children, {}) : [];
      blocks.push(
        new Paragraph({
          numbering: { reference: this.notesRef!, level: 0 },
          children: [
            new Bookmark({
              id: noteAnchor(index + 1),
              children: firstRuns.length ? firstRuns : [new TextRun({ text: "" })],
            }),
          ],
        }),
      );
      for (let i = 1; i < paras.length; i++) {
        blocks.push(
          new Paragraph({ indent: { left: 360 }, children: this.renderInline(paras[i]!.children, {}) }),
        );
      }
    });
    return blocks;
  }

  /**
   * Blockquotes render as a single-cell table with a colored left bar so they
   * can hold rich content (lists, code, nested quotes), not just paragraphs.
   * A leading `[!NOTE|TIP|IMPORTANT|WARNING|CAUTION]` line turns the quote into
   * a GitHub-style callout: tinted background plus a colored, labeled title.
   */
  private renderBlockquote(node: Blockquote): Block[] {
    const callout = detectCallout(node);
    const bodyNodes = callout ? callout.bodyChildren : node.children;
    const inner = this.renderBlocks(bodyNodes).filter(
      (n): n is Paragraph | Table => n instanceof Paragraph || n instanceof Table,
    );
    const meta = callout ? CALLOUTS[callout.type]! : undefined;
    const barColor = meta ? meta.color : this.theme.quoteColor;

    const cellChildren: (Paragraph | Table)[] = [];
    if (meta) {
      cellChildren.push(
        new Paragraph({
          spacing: { after: 80 },
          children: [new TextRun({ text: `${meta.icon} ${meta.label}`, bold: true, color: meta.color })],
        }),
      );
    }
    cellChildren.push(...(inner.length ? inner : [new Paragraph({ children: [] })]));

    const noBorder = { style: BorderStyle.NONE, size: 0, color: "auto" } as const;
    const cell = new TableCell({
      children: cellChildren,
      shading: meta ? { type: ShadingType.CLEAR, color: "auto", fill: meta.fill } : undefined,
      margins: { left: 220, right: 160, top: 80, bottom: 80 },
      borders: {
        top: noBorder,
        bottom: noBorder,
        right: noBorder,
        left: { style: BorderStyle.SINGLE, size: 24, color: barColor },
      },
    });

    return [
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: {
          top: noBorder,
          bottom: noBorder,
          left: noBorder,
          right: noBorder,
          insideHorizontal: noBorder,
          insideVertical: noBorder,
        },
        rows: [new TableRow({ children: [cell] })],
      }),
      // A table carries no "space after", so add a small spacer paragraph to
      // separate the box from following content (and to keep two adjacent
      // callouts from merging into a single table).
      new Paragraph({ children: [new TextRun({ text: "", size: 8 })], spacing: { before: 0, after: 0 } }),
    ];
  }

  private renderCode(node: Code): Paragraph[] {
    // Tokenize into colored segments, then lay out one shaded paragraph per line.
    const lines = highlightCodeLines(node.value, node.lang);
    return lines.map(
      (tokens, i) =>
        new Paragraph({
          shading: { type: ShadingType.CLEAR, fill: this.theme.codeBackground, color: "auto" },
          spacing: { after: i === lines.length - 1 ? 160 : 0, before: i === 0 ? 80 : 0 },
          children: tokens.length
            ? tokens.map(
                (token) =>
                  new TextRun({
                    text: token.text,
                    font: this.theme.monoFont,
                    size: this.theme.bodySize - 2,
                    color: token.color,
                  }),
              )
            : [
                new TextRun({
                  text: " ",
                  font: this.theme.monoFont,
                  size: this.theme.bodySize - 2,
                }),
              ],
        }),
    );
  }

  private renderTable(node: MdTable): Table {
    const rows = node.children.map((row, rowIndex) => {
      const isHeader = rowIndex === 0;
      return new TableRow({
        tableHeader: isHeader,
        children: row.children.map((cell, colIndex) =>
          this.renderTableCell(cell, isHeader, node.align?.[colIndex] ?? null),
        ),
      });
    });

    return new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows,
    });
  }

  private renderTableCell(
    cell: MdTableCell,
    isHeader: boolean,
    align: "left" | "right" | "center" | null,
  ): TableCell {
    const alignment =
      align === "center"
        ? AlignmentType.CENTER
        : align === "right"
          ? AlignmentType.RIGHT
          : AlignmentType.LEFT;
    return new TableCell({
      shading: isHeader
        ? { type: ShadingType.CLEAR, fill: this.theme.codeBackground, color: "auto" }
        : undefined,
      children: [
        new Paragraph({
          alignment,
          spacing: { after: 40, before: 40 },
          children: this.renderInline(cell.children, { bold: isHeader }),
        }),
      ],
    });
  }

  private renderThematicBreak(): Paragraph {
    return new Paragraph({
      border: {
        bottom: { color: this.theme.quoteColor, space: 1, style: BorderStyle.SINGLE, size: 6 },
      },
    });
  }

  // ---- Inline rendering ------------------------------------------------------

  private renderInline(nodes: PhrasingContent[], baseStyle: InlineStyle): InlineChild[] {
    const out: InlineChild[] = [];
    // Inline HTML tags (<u>, <sub>, <sup>, <b>, ...) span sibling nodes, so we
    // track an explicit style stack rather than relying on tree nesting.
    const stack: InlineStyle[] = [baseStyle];
    const current = () => stack[stack.length - 1]!;

    for (const node of nodes) {
      switch (node.type) {
        case "text":
          out.push(...this.textRuns(node.value, current()));
          break;
        case "strong":
          out.push(...this.renderInline(node.children, { ...current(), bold: true }));
          break;
        case "emphasis":
          out.push(...this.renderInline(node.children, { ...current(), italics: true }));
          break;
        case "delete":
          out.push(...this.renderInline(node.children, { ...current(), strike: true }));
          break;
        case "inlineCode":
          out.push(this.makeRun(node.value, { ...current(), code: true }));
          break;
        case "break":
          out.push(new TextRun({ break: 1 }));
          break;
        case "link":
          out.push(this.renderLink(node.url, node.children, current()));
          break;
        case "image":
          out.push(this.renderImage(node, current()));
          break;
        case "footnoteReference": {
          const n = this.footnoteNumbers.get(node.identifier);
          if (n !== undefined) {
            out.push(
              new InternalHyperlink({
                anchor: noteAnchor(n),
                children: [
                  new TextRun({
                    text: String(n),
                    superScript: true,
                    color: this.theme.accentColor,
                  }),
                ],
              }),
            );
          }
          break;
        }
        case "html": {
          const tag = parseInlineTag(node.value);
          if (!tag) break;
          if (tag.name === "br") {
            out.push(new TextRun({ break: 1 }));
            break;
          }
          if (tag.closing) {
            if (stack.length > 1) stack.pop();
          } else if (!tag.selfClosing) {
            stack.push(applyTag(current(), tag.name));
          }
          break;
        }
        default:
          break;
      }
    }
    return out;
  }

  /** Internal `#anchor` links become in-document jumps; everything else opens externally. */
  private renderLink(
    url: string,
    children: PhrasingContent[],
    style: InlineStyle,
  ): ExternalHyperlink | InternalHyperlink {
    const runs = this.renderInline(children, { ...style, link: true }) as TextRun[];
    if (url.startsWith("#")) {
      return new InternalHyperlink({ anchor: anchorId(url.slice(1)), children: runs });
    }
    return new ExternalHyperlink({ link: url, children: runs });
  }

  private textRuns(value: string, style: InlineStyle): TextRun[] {
    // Soft line breaks (single newline in the source) collapse to a space;
    // hard breaks arrive as separate `break` nodes and are handled elsewhere.
    const normalized = value.replace(/[ \t]*\r?\n[ \t]*/g, " ");
    return [this.makeRun(normalized, style)];
  }

  private makeRun(text: string, style: InlineStyle, lineBreakBefore = false): TextRun {
    return new TextRun({
      text,
      break: lineBreakBefore ? 1 : undefined,
      bold: style.bold,
      italics: style.italics,
      strike: style.strike,
      subScript: style.subscript,
      superScript: style.superscript,
      highlight: style.highlight ? "yellow" : undefined,
      font: style.code ? this.theme.monoFont : undefined,
      size: style.code ? this.theme.bodySize - 2 : undefined,
      color: style.link ? this.theme.accentColor : undefined,
      underline: style.link || style.underline ? {} : undefined,
      shading: style.code
        ? { type: ShadingType.CLEAR, fill: this.theme.codeBackground, color: "auto" }
        : undefined,
    });
  }
}

function makeOrderedNumbering(reference: string): NumberingConfig {
  return {
    reference,
    levels: [0, 1, 2, 3].map((level) => ({
      level,
      format: LevelFormat.DECIMAL,
      text: `%${level + 1}.`,
      alignment: AlignmentType.START,
      style: { paragraph: { indent: { left: 360 * (level + 1), hanging: 260 } } },
    })),
  };
}

const BULLET_GLYPHS = ["\u2022", "\u25E6", "\u25AA", "\u2022"] as const;

function makeBulletNumbering(reference: string): NumberingConfig {
  return {
    reference,
    levels: [0, 1, 2, 3].map((level) => ({
      level,
      format: LevelFormat.BULLET,
      text: BULLET_GLYPHS[level],
      alignment: AlignmentType.START,
      style: { paragraph: { indent: { left: 360 * (level + 1), hanging: 260 } } },
    })),
  };
}

function textOf(node: PhrasingContent): string {
  if ("value" in node && typeof node.value === "string") return node.value;
  if ("children" in node && Array.isArray(node.children)) {
    return node.children.map((c) => textOf(c as PhrasingContent)).join("");
  }
  return "";
}

/** True when a heading is a "Table of Contents" (or "Contents") marker. */
function isTocHeading(node: Heading): boolean {
  const text = node.children.map(textOf).join("").trim().toLowerCase();
  return text === "table of contents" || text === "contents";
}

/** Word-safe bookmark name for the nth note in the generated Notes section. */
function noteAnchor(n: number): string {
  return `_md2x_note_${n}`;
}

/** GitHub-style callout styles keyed by alert type. Colors follow GitHub's palette. */
const CALLOUTS: Record<string, { label: string; icon: string; color: string; fill: string }> = {
  note: { label: "Note", icon: "\u2139\uFE0F", color: "0969DA", fill: "DDF4FF" },
  tip: { label: "Tip", icon: "\uD83D\uDCA1", color: "1A7F37", fill: "DAFBE1" },
  important: { label: "Important", icon: "\u2757", color: "8250DF", fill: "FBEFFF" },
  warning: { label: "Warning", icon: "\u26A0\uFE0F", color: "9A6700", fill: "FFF8C5" },
  caution: { label: "Caution", icon: "\uD83D\uDED1", color: "CF222E", fill: "FFEBE9" },
};

/**
 * Detect a GitHub alert marker (`[!NOTE]` etc.) at the start of a blockquote and
 * return the callout type plus the body with the marker stripped out.
 */
function detectCallout(
  node: Blockquote,
): { type: string; bodyChildren: RootContent[] } | null {
  const first = node.children[0];
  if (!first || first.type !== "paragraph") return null;
  const lead = first.children[0];
  if (!lead || lead.type !== "text") return null;
  const match = /^\[!(\w+)\]\s*/.exec(lead.value);
  if (!match) return null;
  const type = match[1]!.toLowerCase();
  if (!CALLOUTS[type]) return null;

  const remainder = lead.value.slice(match[0].length);
  const leadInline: PhrasingContent[] = remainder
    ? [{ ...lead, value: remainder }, ...first.children.slice(1)]
    : first.children.slice(1);
  const rebuiltFirst = leadInline.length ? [{ ...first, children: leadInline }] : [];
  return {
    type,
    bodyChildren: [...rebuiltFirst, ...node.children.slice(1)] as RootContent[],
  };
}

/** A colored run of code text produced by the syntax highlighter. */
interface CodeToken {
  text: string;
  color?: string;
}

/** hast node shapes we care about when walking highlight.js output. */
interface HastNode {
  type: string;
  value?: string;
  properties?: { className?: unknown };
  children?: HastNode[];
}

/**
 * highlight.js scope → hex color (GitHub-light-ish palette that reads well on
 * the light code background used by every theme).
 */
const CODE_COLORS: Record<string, string> = {
  keyword: "CF222E",
  built_in: "0550AE",
  type: "953800",
  literal: "0550AE",
  number: "0550AE",
  string: "0A3069",
  regexp: "0A3069",
  symbol: "0550AE",
  comment: "6E7781",
  doctag: "6E7781",
  meta: "0550AE",
  title: "8250DF",
  section: "0550AE",
  function: "8250DF",
  attr: "0550AE",
  attribute: "0550AE",
  property: "0550AE",
  variable: "953800",
  tag: "116329",
  name: "116329",
  "selector-tag": "116329",
  "selector-class": "953800",
  "selector-id": "0550AE",
  bullet: "0550AE",
  link: "0550AE",
  operator: "0550AE",
  params: "24292F",
};

/** Map a highlight.js className list to a color, if any scope is recognized. */
function colorForScope(className: unknown): string | undefined {
  if (!Array.isArray(className)) return undefined;
  for (const cls of className) {
    if (typeof cls !== "string") continue;
    const key = cls.startsWith("hljs-") ? cls.slice(5) : cls;
    if (CODE_COLORS[key]) return CODE_COLORS[key];
  }
  return undefined;
}

/** Flatten a highlight.js hast tree into colored tokens (in source order). */
function flattenHast(node: HastNode, color: string | undefined, out: CodeToken[]): void {
  if (node.type === "text") {
    if (node.value) out.push({ text: node.value, color });
    return;
  }
  const scopeColor =
    node.type === "element" ? (colorForScope(node.properties?.className) ?? color) : color;
  if (node.children) for (const child of node.children) flattenHast(child, scopeColor, out);
}

/**
 * Syntax-highlight a fenced code block and split it into lines of colored
 * tokens. Falls back to a single uncolored token per line for unknown or
 * missing languages.
 */
function highlightCodeLines(value: string, lang?: string | null): CodeToken[][] {
  let tokens: CodeToken[];
  try {
    if (lang && lowlight.registered(lang)) {
      const tree = lowlight.highlight(lang, value) as unknown as { children: HastNode[] };
      tokens = [];
      for (const child of tree.children) flattenHast(child, undefined, tokens);
    } else {
      tokens = [{ text: value }];
    }
  } catch {
    tokens = [{ text: value }];
  }

  const lines: CodeToken[][] = [[]];
  for (const token of tokens) {
    const parts = token.text.split("\n");
    parts.forEach((part, i) => {
      if (i > 0) lines.push([]);
      if (part) lines[lines.length - 1]!.push({ text: part, color: token.color });
    });
  }
  return lines;
}

/** Collect Heading 1-3 entries (excluding the TOC heading itself) for the contents list. */
function collectTocEntries(tree: Root): TocEntry[] {
  const entries: TocEntry[] = [];
  for (const node of tree.children) {
    if (node.type !== "heading" || node.depth > 3 || isTocHeading(node)) continue;
    const text = node.children.map(textOf).join("");
    entries.push({ depth: node.depth, text, id: anchorId(text) });
  }
  return entries;
}

/**
 * Turn heading text (or a link's `#fragment`) into a stable, Word-safe bookmark
 * name. Word bookmark names allow only letters, digits and underscores, so we
 * collapse everything else. Applying the same function to both heading text and
 * link fragments guarantees a TOC entry lands on its section.
 */
function anchorId(text: string): string {
  const slug = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return `_${slug || "section"}`;
}

interface InlineTag {
  name: string;
  closing: boolean;
  selfClosing: boolean;
}

/** Parse a lone inline HTML tag like `<sup>`, `</u>` or `<br/>`. */
function parseInlineTag(value: string): InlineTag | null {
  const match = /^<\s*(\/?)\s*([a-zA-Z][a-zA-Z0-9]*)\s*(\/?)\s*>$/.exec(value.trim());
  if (!match) return null;
  return {
    closing: match[1] === "/",
    name: match[2]!.toLowerCase(),
    selfClosing: match[3] === "/",
  };
}

/** Merge the effect of an inline HTML tag onto the current style. */
function applyTag(style: InlineStyle, name: string): InlineStyle {
  switch (name) {
    case "u":
    case "ins":
      return { ...style, underline: true };
    case "sub":
      return { ...style, subscript: true };
    case "sup":
      return { ...style, superscript: true };
    case "b":
    case "strong":
      return { ...style, bold: true };
    case "i":
    case "em":
      return { ...style, italics: true };
    case "s":
    case "del":
    case "strike":
      return { ...style, strike: true };
    case "mark":
      return { ...style, highlight: true };
    default:
      return { ...style };
  }
}

/** Render an mdast tree to a .docx buffer. */
export async function renderDocx(
  tree: Root,
  theme: Theme,
  meta: DocMeta,
  basePath: string = process.cwd(),
): Promise<Buffer> {
  return new DocxRenderer(theme, meta, basePath).render(tree);
}

/** Largest image width, in pixels, before we scale down to fit the page. */
const MAX_IMAGE_WIDTH = 600;

/** Scale a width/height pair down proportionally so width fits `maxWidth`. */
function scaleToFit(
  width: number,
  height: number,
  maxWidth: number,
): { width: number; height: number } {
  if (!width || !height || width <= maxWidth) return { width: width || 1, height: height || 1 };
  const ratio = maxWidth / width;
  return { width: maxWidth, height: Math.max(1, Math.round(height * ratio)) };
}

/** Read intrinsic dimensions and format from PNG/GIF/BMP/JPEG header bytes. */
function imageMeta(
  data: Buffer,
): { type: "png" | "jpg" | "gif" | "bmp"; width: number; height: number } | null {
  if (
    data.length >= 24 &&
    data[0] === 0x89 &&
    data[1] === 0x50 &&
    data[2] === 0x4e &&
    data[3] === 0x47
  ) {
    return { type: "png", width: data.readUInt32BE(16), height: data.readUInt32BE(20) };
  }
  if (data.length >= 10 && data[0] === 0x47 && data[1] === 0x49 && data[2] === 0x46) {
    return { type: "gif", width: data.readUInt16LE(6), height: data.readUInt16LE(8) };
  }
  if (data.length >= 26 && data[0] === 0x42 && data[1] === 0x4d) {
    return {
      type: "bmp",
      width: Math.abs(data.readInt32LE(18)),
      height: Math.abs(data.readInt32LE(22)),
    };
  }
  if (data.length >= 4 && data[0] === 0xff && data[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < data.length) {
      if (data[offset] !== 0xff) {
        offset++;
        continue;
      }
      const marker = data[offset + 1]!;
      // Start-of-frame markers carry the dimensions; skip standalone markers.
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return {
          type: "jpg",
          height: data.readUInt16BE(offset + 5),
          width: data.readUInt16BE(offset + 7),
        };
      }
      if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) {
        offset += 2;
        continue;
      }
      const len = data.readUInt16BE(offset + 2);
      if (len < 2) break;
      offset += 2 + len;
    }
  }
  return null;
}
