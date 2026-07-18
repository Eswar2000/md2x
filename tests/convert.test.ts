import { describe, expect, it } from "vitest";
import { convert, themes, DEFAULT_THEME } from "../src/index.js";
import { parseMarkdown } from "../src/parse.js";

/** The docx zip signature: bytes "PK\x03\x04". */
const ZIP_MAGIC = Buffer.from([0x50, 0x4b, 0x03, 0x04]);

/** Assert a value is a non-empty buffer that starts with the zip magic. */
function expectValidDocx(buffer: Buffer): void {
  expect(Buffer.isBuffer(buffer)).toBe(true);
  expect(buffer.length).toBeGreaterThan(0);
  expect(buffer.subarray(0, 4).equals(ZIP_MAGIC)).toBe(true);
}

/** A minimal but valid 1×1 PNG, as a data URI. */
const TINY_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

// ---- Tree / metadata parsing (no docx generation needed) --------------------

/** Collect every node `type` present in an mdast tree. */
function nodeTypes(node: unknown, set: Set<string> = new Set()): Set<string> {
  const n = node as { type?: string; children?: unknown[] };
  if (n.type) set.add(n.type);
  if (Array.isArray(n.children)) for (const child of n.children) nodeTypes(child, set);
  return set;
}

/** Concatenate all text values in a tree. */
function textContent(node: unknown): string {
  const n = node as { value?: string; children?: unknown[] };
  if (typeof n.value === "string") return n.value;
  if (Array.isArray(n.children)) return n.children.map(textContent).join("");
  return "";
}

describe("parseMarkdown - metadata", () => {
  it("extracts standard frontmatter fields", () => {
    const md = ["---", "title: My Report", "author: Ada", "subject: Q3", "---", "", "Body."].join(
      "\n",
    );
    const { meta } = parseMarkdown(md);

    expect(meta.title).toBe("My Report");
    expect(meta.author).toBe("Ada");
    expect(meta.subject).toBe("Q3");
  });

  it("splits a comma-separated keywords string into an array", () => {
    const md = ["---", "keywords: finance, q3 , growth", "---", "", "x"].join("\n");
    const { meta } = parseMarkdown(md);

    expect(meta.keywords).toEqual(["finance", "q3", "growth"]);
  });

  it("keeps a YAML list of keywords as an array", () => {
    const md = ["---", "keywords:", "  - one", "  - two", "---", "", "x"].join("\n");
    const { meta } = parseMarkdown(md);

    expect(meta.keywords).toEqual(["one", "two"]);
  });

  it("preserves custom frontmatter keys", () => {
    const md = ["---", "title: T", "category: Baking", "difficulty: Hard", "---", "", "x"].join(
      "\n",
    );
    const { meta } = parseMarkdown(md);

    expect(meta.category).toBe("Baking");
    expect(meta.difficulty).toBe("Hard");
  });

  it("returns empty metadata when there is no frontmatter", () => {
    const { meta } = parseMarkdown("# Just a heading\n\nText.");
    expect(meta).toEqual({});
  });

  it("does not throw on malformed frontmatter", () => {
    const md = ["---", "title: : : broken", "  bad indent", "---", "", "Body."].join("\n");
    expect(() => parseMarkdown(md)).not.toThrow();
  });
});

describe("parseMarkdown - tree", () => {
  it("converts :emoji: shortcodes to Unicode in the tree", () => {
    const { tree } = parseMarkdown("Ship it :rocket: now.");
    expect(textContent(tree)).toContain("🚀");
    expect(textContent(tree)).not.toContain(":rocket:");
  });

  it("produces inline and block math nodes", () => {
    const md = ["Inline $a^2$ here.", "", "$$", "\\int_0^1 x\\, dx", "$$"].join("\n");
    const types = nodeTypes(parseMarkdown(md).tree);

    expect(types.has("inlineMath")).toBe(true);
    expect(types.has("math")).toBe(true);
  });

  it("recognizes GFM tables, task lists and strikethrough", () => {
    const md = [
      "| a | b |",
      "| - | - |",
      "| 1 | 2 |",
      "",
      "- [x] done",
      "- [ ] todo",
      "",
      "~~gone~~",
    ].join("\n");
    const types = nodeTypes(parseMarkdown(md).tree);

    expect(types.has("table")).toBe(true);
    expect(types.has("delete")).toBe(true);
  });

  it("parses footnote references and definitions", () => {
    const md = ["A claim.[^1]", "", "[^1]: The evidence."].join("\n");
    const types = nodeTypes(parseMarkdown(md).tree);

    expect(types.has("footnoteReference")).toBe(true);
    expect(types.has("footnoteDefinition")).toBe(true);
  });

  it("keeps a GitHub alert marker as blockquote text", () => {
    const { tree } = parseMarkdown("> [!NOTE]\n> Heads up.");
    const types = nodeTypes(tree);

    expect(types.has("blockquote")).toBe(true);
    expect(textContent(tree)).toContain("[!NOTE]");
  });
});

// ---- convert() output -------------------------------------------------------

describe("convert -> docx output", () => {
  it("produces a valid docx buffer with the right result shape", async () => {
    const { buffer, format, extension, meta } = await convert("# Title\n\nHello **world**.", {
      format: "docx",
    });

    expect(format).toBe("docx");
    expect(extension).toBe("docx");
    expect(meta).toBeTypeOf("object");
    expectValidDocx(buffer);
  });

  it("defaults to the docx format when none is given", async () => {
    const { format, buffer } = await convert("# Hi");
    expect(format).toBe("docx");
    expectValidDocx(buffer);
  });

  it("converts with every built-in theme", async () => {
    for (const name of Object.keys(themes)) {
      const { buffer } = await convert("# Heading\n\nBody with `code`.", { theme: name });
      expectValidDocx(buffer);
    }
    expect(DEFAULT_THEME).toBe("clean");
  });

  it("accepts a full theme object", async () => {
    const { buffer } = await convert("# Hi", { theme: themes.serif });
    expectValidDocx(buffer);
  });

  it("merges options.meta over frontmatter", async () => {
    const md = ["---", "title: From Frontmatter", "author: Ada", "---", "", "Body."].join("\n");
    const { meta } = await convert(md, { meta: { title: "Overridden" } });

    expect(meta.title).toBe("Overridden");
    expect(meta.author).toBe("Ada");
  });

  it("handles an empty document", async () => {
    const { buffer } = await convert("");
    expectValidDocx(buffer);
  });
});

// ---- Feature smoke tests (must not throw, must stay a valid docx) -----------

describe("convert -> docx features", () => {
  const cases: Record<string, string> = {
    "all heading levels": ["# h1", "## h2", "### h3", "#### h4", "##### h5", "###### h6"].join(
      "\n",
    ),
    "inline formatting": "**b** *i* ~~s~~ `c` <u>u</u> <sub>2</sub> <sup>3</sup> <mark>m</mark>",
    "hard breaks": "line one\\\nline two<br>line three",
    "external and internal links": "[out](https://example.com) and [in](#h2)\n\n## h2",
    "nested and mixed lists": [
      "- a",
      "  - b",
      "    - c",
      "1. one",
      "   - bullet under number",
      "2. two",
    ].join("\n"),
    "multi-paragraph list item": ["- first para", "", "  second para", "- next"].join("\n"),
    "task list": ["- [x] done", "- [ ] todo"].join("\n"),
    "aligned table": ["| L | C | R |", "| :- | :-: | -: |", "| 1 | 2 | 3 |"].join("\n"),
    "highlighted python": ["```python", "def f(x):", "    return x + 1", "```"].join("\n"),
    "unknown language code": ["```made-up-lang", "some code", "```"].join("\n"),
    "code without a language": ["```", "plain code", "```"].join("\n"),
    "every callout type": [
      "> [!NOTE]",
      "> n",
      "",
      "> [!TIP]",
      "> t",
      "",
      "> [!IMPORTANT]",
      "> i",
      "",
      "> [!WARNING]",
      "> w",
      "",
      "> [!CAUTION]",
      "> c",
    ].join("\n"),
    "rich blockquote": ["> intro", ">", "> - a", "> - b", ">", "> outro"].join("\n"),
    "data-uri image": `![tiny](${TINY_PNG})`,
    "unreadable image falls back": "![missing](./nope-does-not-exist.png)",
    footnotes: ["Claim.[^a] Another.[^b]", "", "[^a]: first", "[^b]: second"].join("\n"),
    "table of contents": [
      "## Table of Contents",
      "",
      "- [Alpha](#alpha)",
      "",
      "## Alpha",
      "",
      "text",
    ].join("\n"),
    "inline and display math": ["Inline $E=mc^2$.", "", "$$", "\\frac{1}{2}", "$$"].join("\n"),
    "invalid latex falls back": "Broken $\\frobnicate{x}$ math.",
    "emoji shortcodes": "Done :tada: and :rocket:",
    "horizontal rule": "before\n\n---\n\nafter",
  };

  for (const [name, md] of Object.entries(cases)) {
    it(`renders ${name}`, async () => {
      const { buffer } = await convert(md, { format: "docx" });
      expectValidDocx(buffer);
    });
  }

  it("renders a large document combining many features", async () => {
    const md = [
      "---",
      "title: Everything",
      "keywords: a, b",
      "custom: value",
      "---",
      "",
      "# Title :sparkles:",
      "",
      "## Table of Contents",
      "",
      "- [Section](#section)",
      "",
      "## Section",
      "",
      "A paragraph with **bold**, *italic*, `code`, and a footnote.[^n]",
      "",
      "> [!WARNING]",
      "> Careful now.",
      "",
      "1. first",
      "2. second",
      "   - nested",
      "",
      "| a | b |",
      "| :- | -: |",
      "| 1 | 2 |",
      "",
      "```ts",
      "const x: number = 1;",
      "```",
      "",
      "Inline $x^2$ and display:",
      "",
      "$$",
      "\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}",
      "$$",
      "",
      `![tiny](${TINY_PNG})`,
      "",
      "[^n]: the note.",
    ].join("\n");

    const { buffer, meta } = await convert(md);
    expect(meta.title).toBe("Everything");
    expect(meta.keywords).toEqual(["a", "b"]);
    expect(meta.custom).toBe("value");
    expectValidDocx(buffer);
  });
});

// ---- Errors -----------------------------------------------------------------

describe("convert -> errors", () => {
  it("throws on an unknown theme name", async () => {
    await expect(convert("# hi", { theme: "does-not-exist" })).rejects.toThrow(/Unknown theme/);
  });

  it("lists available themes in the error message", async () => {
    await expect(convert("# hi", { theme: "nope" })).rejects.toThrow(/clean/);
  });
});
