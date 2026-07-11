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

## Supported Markdown

md2x maps Markdown — plus a handful of inline HTML tags — onto **native Word
constructs**, not screenshots or approximations. Headings become real heading
styles (and appear in the Navigation pane), the table of contents is a live
field, lists carry proper numbering, and equations are editable Word math.

### Text & inline formatting

| Markdown | Word result |
| --- | --- |
| `**bold**` | **Bold** run |
| `*italic*` / `_italic_` | *Italic* run |
| `~~strikethrough~~` | Strikethrough run |
| `` `inline code` `` | Monospaced run with light shading |
| `<u>underline</u>` | Underlined run |
| `<sub>x</sub>` / `<sup>x</sup>` | Subscript / superscript (e.g. CO₂, 2³) |
| `<mark>text</mark>` | Yellow highlight |
| `<br>` | Hard line break within a paragraph |
| `:emoji:` | Unicode emoji (`:rocket:` → 🚀) |
| `$inline math$` | Inline, editable Word equation (LaTeX) |

### Headings, paragraphs & rules

| Markdown | Word result |
| --- | --- |
| `#` … `######` | Built-in **Heading 1–6** styles (collapsible, in the Navigation pane) |
| Paragraph text | Body paragraph (a single newline is a soft wrap; a blank line starts a new paragraph) |
| Two trailing spaces or a trailing `\` | Hard line break |
| `---` | Horizontal rule |

### Lists

| Markdown | Word result |
| --- | --- |
| `- item` / `* item` | Bulleted list; nesting uses •, ◦, ▪ |
| `1. item` | Numbered list with real Word numbering |
| Ordered + nested unordered (or vice-versa) | Mixed list — numbers and bullets nest together |
| `- [x]` / `- [ ]` | Task list with ☑ / ☐ checkboxes |
| Multi-paragraph list item | Continuation paragraphs indented under the marker |

### Tables

| Markdown | Word result |
| --- | --- |
| `\| a \| b \|` with `---` / `:--:` / `--:` separators | Native Word table with a shaded, bold header row and per-column alignment |

### Code blocks

| Markdown | Word result |
| --- | --- |
| ```` ```lang … ``` ```` fenced block | Shaded, monospaced block with **syntax highlighting** for 37 languages |

Blocks are highlighted from their language tag using highlight.js's common set
(`ts`, `python`, `go`, `sql`, `bash`, `json`, `yaml`, … 37 languages, with
aliases such as `js` / `py` / `sh` / `yml`). Tabs and indentation are preserved;
unknown or unlabeled blocks render as plain monospace.

### Blockquotes & callouts

| Markdown | Word result |
| --- | --- |
| `> quote` | Boxed quote with a colored left bar; can hold lists, code, and nested quotes |
| `> [!NOTE\|TIP\|IMPORTANT\|WARNING\|CAUTION]` | GitHub-style callout — tinted box, colored bar, icon + label |

### Links & table of contents

| Markdown | Word result |
| --- | --- |
| `[text](https://…)` | External hyperlink |
| `[text](#heading-title)` | Internal link that jumps to the matching heading |
| A `## Table of Contents` heading | Native, pre-populated Word TOC field (Heading 1–3, dot leaders, clickable, updatable) |

### Images, math & footnotes

| Markdown | Word result |
| --- | --- |
| `![alt](src)` | Embedded image (PNG/JPG/GIF/BMP) from a path, URL, or `data:` URI; auto-scaled |
| `$$ block math $$` | Display Word equation, centered (LaTeX) |
| `text[^id]` + `[^id]: …` | Superscript marker plus a numbered **Notes** section |

### Frontmatter & metadata

| Markdown | Word result |
| --- | --- |
| YAML frontmatter — standard keys | `title`, `author`, `subject`, `keywords`, `description`, `revision`, `lastModifiedBy` → Word document properties |
| YAML frontmatter — any other keys | Custom Word document properties |

### Good to know

- **Table of contents** — name a heading `Table of Contents` (or `Contents`) and
  md2x drops in a real, pre-filled Word TOC field (the same object as *References
  → Table of Contents*). It's populated the moment you open the file, with no
  "update fields" prompt; press <kbd>F9</kbd> to recompute page numbers. Any link
  list placed under that heading (handy for GitHub) is replaced by the field.
- **Images** — `src` can be a path relative to the Markdown file, an absolute
  path, an `http(s)` URL (fetched at convert time), or a `data:` URI. Oversized
  images are scaled to fit; unreadable sources fall back to `[alt]` text.
- **Footnotes** — gathered into a numbered Notes section where the definitions
  appear (usually the end), so note text never interrupts the page. Markers are
  clickable and work in every viewer.
- **Math** — LaTeX is converted through MathML to OMML, producing real, editable
  Word equations. Unsupported LaTeX degrades to monospaced text instead of
  failing.
- **Inline HTML** — Markdown has no syntax for underline, sub/superscript or
  highlight, so md2x recognizes `<u>`, `<sub>`, `<sup>` and `<mark>`; they nest
  and combine with `**bold**` / `*italic*`.

## Examples

Three self-contained documents live under [`examples/`](examples), each focused
on a different slice of the feature set. Each folder holds the source `.md` and a
converted `.docx`.

- [**example-1** — the main sample](examples/example-1/sample.md): exercises the
  majority of components (headings, lists, tables, callouts, images, footnotes,
  the table of contents, and inline formatting).
- [**example-2** — code-oriented](examples/example-2/rate-limiting.md): a
  code-heavy guide that shows off syntax highlighting across many languages.
- [**example-3** — math-oriented](examples/example-3/special-relativity.md): a
  science write-up centered on inline and display equations.

Convert any of them:

```bash
md2x examples/example-1/sample.md -o examples/example-1/sample.docx
md2x examples/example-2/rate-limiting.md -o examples/example-2/rate-limiting.docx
md2x examples/example-3/special-relativity.md -o examples/example-3/special-relativity.docx
```

## Development

```bash
npm install
npm run build      # bundle with tsup
npm test           # run the vitest suite
npm run typecheck  # type-only check
```

## License

MIT © Eswar V — see [LICENSE](LICENSE).
