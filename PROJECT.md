# md2x — Project scope

## Vision

**Markdown to everything.** AI tools generate great Markdown effortlessly, but
the *last mile* — handing someone a real `.docx` or `.pdf` — is still painful.
`md2x` bridges that gap.

The differentiator is not "convert Markdown" (pandoc already does that). It is
converting the **messy, AI-flavored Markdown that LLMs actually produce** into
**polished, styled documents** with **zero native dependencies** (no pandoc, no
LaTeX, no headless browser), so it runs anywhere Node runs: a laptop, a
Cloudflare Worker, a GitHub Action, or an AI agent skill.

## Architecture

One core engine, many surfaces:

- **Core** — `md → mdast (unified/remark) → format renderers`
- **Surfaces** — npm library, CLI, web app, VS Code extension, agent SKILL,
  GitHub Action. Each surface is a thin wrapper over the core.

## Currently supported

**Markdown → `.docx`** is fully implemented, as both a library and a CLI. The
renderer turns the messy, AI-flavored Markdown that LLMs produce into native
Word constructs across:

- **Text & inline formatting** — bold, italic, strikethrough, inline code,
  underline, subscript, superscript, highlight, and `:emoji:` shortcodes
- **Document structure** — headings 1–6 (real Word styles), paragraphs, line
  breaks, and horizontal rules
- **Lists** — ordered, unordered, nested, mixed, and task lists
- **Tables** — GFM tables with per-column alignment
- **Code** — fenced blocks with syntax highlighting (37 languages)
- **Blockquotes & callouts** — rich quotes plus GitHub-style alerts
- **Images** — local, remote (`http(s)`), and `data:` URI, auto-scaled
- **Math** — inline and display LaTeX as editable Word equations
- **Footnotes** — collected into a linked **Notes** section
- **Table of contents** — a native, pre-populated Word TOC field
- **Links** — external and in-document (`#anchor`) links
- **Metadata** — YAML frontmatter → standard and custom document properties
- **Themes** — `clean`, `compact`, `serif`

For the exact, element-by-element mapping, see
[README → Supported Markdown](README.md#supported-markdown).

## Roadmap

### Shipped

- **Markdown → `.docx`** — library + CLI, with the full feature set above.
- **LaTeX math** — inline and display equations as native Word math.
- **Image embedding** — local, remote, and `data:` URI images.
- **MCP server** — `md2x-mcp` exposes md2x as Model Context Protocol tools, so any
  MCP-capable AI can generate `.docx` files straight from a chat.

### Planned

- **PDF renderer** — the same core engine, a second output format.
- **Mermaid diagrams** — render fenced ` ```mermaid ` blocks to images.
- **Custom templates / branding** — fonts, colors, headers/footers, cover pages.
- **Web demo** — drag-and-drop with live preview.
- **Bundled agent Skill** — a self-contained Skill package (e.g. Claude Skills)
  that vendors md2x for code-execution agents, no install required.
