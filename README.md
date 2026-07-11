# md2x

**Markdown to everything.** Convert the Markdown your AI assistant produces into
polished documents — starting with `.docx` — with **zero native dependencies**
(no pandoc, no LaTeX, no headless browser).

> See [PROJECT.md](PROJECT.md) for the vision, architecture, and roadmap.

## Install

```bash
npm install md2x        # library
npm install -g md2x     # global CLI
```

## CLI

```bash
# Convert a file (writes report.docx next to it)
md2x report.md

# Choose an output name and theme
md2x report.md -o final.docx --theme serif

# Pipe from stdin (great for AI pipelines)
cat notes.md | md2x - -o notes.docx

# List available themes
md2x --list-themes
```

### Options

| Flag                | Description                              | Default  |
| ------------------- | ---------------------------------------- | -------- |
| `-o, --output`      | Output file path                         | `<input>.docx` |
| `-f, --format`      | Output format (`docx`)                   | `docx`   |
| `-t, --theme`       | Theme name (`clean`, `compact`, `serif`) | `clean`  |
| `--list-themes`     | Print available themes and exit          | —        |

## Library

```ts
import { convert } from "md2x";
import { writeFile } from "node:fs/promises";

const markdown = "# Hello\n\nThis is **md2x**.";
const { buffer, extension } = await convert(markdown, {
  format: "docx",
  theme: "clean",
});

await writeFile(`hello.${extension}`, buffer);
```

Frontmatter is mapped to document metadata automatically:

```md
---
title: Quarterly Report
author: Ada Lovelace
keywords: finance, q3
---
```

For the full list of supported Markdown features and the roadmap, see
[PROJECT.md](PROJECT.md).

## Markdown → Word mapping

md2x maps Markdown (plus a few inline HTML tags) onto native Word constructs, so
the result behaves like a real document — headings show up in the **Navigation
pane**, the table of contents is clickable, and lists carry proper numbering.

| Markdown you write | Word / `.docx` result |
| ------------------ | --------------------- |
| `#`, `##`, `###` … `######` | Built-in **Heading 1–6** styles (appear as sections in the Navigation pane) |
| Paragraph text | Body paragraph. A single line break is a soft wrap (a space); a blank line starts a new paragraph |
| `**bold**` | **Bold** run |
| `*italic*` / `_italic_` | *Italic* run |
| `~~strikethrough~~` | Strikethrough run |
| `` `inline code` `` | Monospace run with light shading |
| ```` ``` fenced blocks ```` | Shaded, monospaced code block with **syntax highlighting** for 37 languages (tabs and indentation preserved) |
| `- item` / `* item` | Bulleted list (nesting → tighter indented sub-bullets: •, ◦, ▪) |
| `1. item` | Numbered list with real Word numbering (nesting supported) |
| Ordered list containing bullets (or vice-versa) | Mixed list — numbering and bullets nest together |
| `- [x]` / `- [ ]` | Task list with ☑ / ☐ checkboxes |
| `\| a \| b \|` tables | Native Word table with a shaded, bold header row and per-column alignment |
| `[text](https://…)` | External hyperlink |
| `[text](#heading-title)` | **Internal link** that jumps to the matching heading |
| A `## Table of Contents` heading | A **native Word Table of Contents** field, pre-populated so it shows immediately (Heading 1–3, dot leaders, clickable, updatable) |
| `> quote` | Blockquote with a colored left bar that can hold **rich content** (lists, code, nested quotes), not just text |
| `> [!NOTE]` / `[!TIP]` / `[!IMPORTANT]` / `[!WARNING]` / `[!CAUTION]` | **GitHub-style callout** — tinted box with a colored left bar and a labeled, icon-prefixed title |
| `---` | Horizontal rule |
| `![alt](path/or/url.png)` | **Embedded image** (PNG/JPG/GIF/BMP), auto-scaled to fit the page |
| `text[^1]` + `[^1]: note` | **Clickable superscript marker** in the text, plus a numbered **Notes** section collected at the end of the document |
| `<u>underline</u>` | <u>Underlined</u> run |
| `<sub>x</sub>` | Subscript (e.g. CO₂) |
| `<sup>x</sup>` | Superscript (e.g. 2³) |
| `<mark>text</mark>` | Highlighted (yellow) run |
| `<br>` | Hard line break within a paragraph |
| `:emoji:` shortcodes | Converted to Unicode emoji (`:rocket:` → 🚀) |
| YAML frontmatter | Standard keys (`title`, `author`, `subject`, `keywords`, `description`, `revision`, `lastModifiedBy`) become Word document properties; any other keys become **custom** document properties |

### Notes on a few of these

- **Table of contents.** Add a heading titled `Table of Contents` (or
  `Contents`) and md2x inserts a genuine Word Table of Contents field in its
  place — the same object you get from *References → Table of Contents*, with
  Heading 1–3 entries, dot leaders and the built-in `TOC 1/2/3` styles. It is
  seeded with cached entries, so it appears **populated and clickable the moment
  you open the file** (no empty box). Because md2x does not set the document-wide
  “update fields” flag, Word does **not** show the “this document refers to other
  files” prompt; select the TOC and press <kbd>F9</kbd> (or right-click → *Update
  Field*) whenever you want Word to recompute page numbers. Any Markdown link
  list you place under that heading — handy for GitHub — is replaced by the field.
  You can also link to a section manually anywhere with `[text](#heading-title)`
  (GitHub-style anchors: lowercase, spaces → hyphens).
- **Headings.** Each `#`–`######` maps to a built-in Word Heading style, so
  headings are collapsible, appear in the Navigation pane, feed the Table of
  Contents, and take a themed color (a Word-like blue in the default theme).
- **Images.** `![alt](src)` is embedded as a real picture. `src` may be a path
  relative to the Markdown file, an absolute path, an `http(s)` URL (fetched at
  convert time), or a `data:` URI. Images wider than the page are scaled down
  proportionally, and the `alt` text becomes the picture's accessibility title.
  If a source can't be read, md2x falls back to `[alt]` text instead of failing.
- **Footnotes.** `text[^id]` with a matching `[^id]: …` definition becomes a
  clickable superscript number in the text; all the notes are gathered into a
  numbered **Notes** section at the point where the definitions appear (typically
  the end of the document). This keeps note text out of the middle of the page
  and works in every viewer. Click a marker to jump to its note.
- **Underline, subscript, superscript, highlight.** Markdown has no native
  syntax for these, so md2x understands the inline HTML tags `<u>`, `<sub>`,
  `<sup>`, and `<mark>` (they nest and combine with `**bold**`/`*italic*`).
- **Blockquotes & callouts.** A `>` quote renders as a boxed region with a
  colored left bar and may contain lists, code, or nested quotes. If its first
  line is a GitHub alert marker (`> [!NOTE]`, `[!TIP]`, `[!IMPORTANT]`,
  `[!WARNING]`, `[!CAUTION]`), it becomes a tinted callout with a colored,
  icon-prefixed title.
- **Indentation.** Inside code blocks, tabs and spaces are preserved verbatim.
  In lists, indentation controls nesting depth.
- **Code highlighting.** Fenced blocks are syntax-highlighted from their language
  tag (```` ```ts ````, ```` ```python ````, ```` ```sql ````, …) using
  highlight.js's common set of **37 languages**: arduino, bash, c, cpp, csharp,
  css, diff, go, graphql, ini, java, javascript, json, kotlin, less, lua,
  makefile, markdown, objectivec, perl, php, php-template, plaintext, python,
  python-repl, r, ruby, rust, scss, shell, sql, swift, typescript, vbnet, wasm,
  xml, and yaml. Common aliases work too (`ts`, `js`, `py`, `sh`, `yml`).
  Unknown or unlabeled blocks fall back to plain monospaced text.

A complete, self-contained document that exercises every row above lives in
[examples/example-1/sample.md](examples/example-1/sample.md), and a
code-heavy document that shows off syntax highlighting across several languages
lives in [examples/example-2/rate-limiting.md](examples/example-2/rate-limiting.md).
Convert either to see the full picture:

```bash
md2x examples/example-1/sample.md -o examples/example-1/sample.docx
md2x examples/example-2/rate-limiting.md -o examples/example-2/rate-limiting.docx
```

## Development

```bash
npm install
npm run build      # bundle with tsup
npm test           # run the vitest suite
npm run typecheck  # type-only check
```

## License

MIT
