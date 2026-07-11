# md2x — Project scope

## Vision

**Markdown to everything.** AI tools generate great Markdown effortlessly, but
the *last mile* — handing someone a real `.docx`, `.pdf`, or `.pptx` — is still
painful. `md2x` bridges that gap.

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

- Headings (1–6) mapped to native Word heading styles (collapsible, in the
  Navigation pane)
- Paragraphs, soft/hard line breaks (`<br>`, trailing `\`), horizontal rules
- **Bold**, *italic*, ~~strikethrough~~, `inline code`, and links (external +
  in-document `#anchor` links)
- Underline, subscript, superscript, and highlight via inline HTML
  (`<u>`, `<sub>`, `<sup>`, `<mark>`)
- Ordered / unordered / nested / mixed lists, task lists, and multi-paragraph
  list items
- GFM tables with per-column alignment
- Fenced code blocks with **syntax highlighting** (37 languages via highlight.js)
- LaTeX math (`$…$`, `$$…$$`) → native Word equations (OMML)
- Rich blockquotes (lists, code, nested quotes) and GitHub-style callouts
  (`> [!NOTE|TIP|IMPORTANT|WARNING|CAUTION]`)
- Image embedding — local paths, `http(s)` URLs, and `data:` URIs, auto-scaled
- Footnotes collected into an in-body **Notes** section with clickable markers
- Native, pre-populated **Table of Contents** field
- Emoji shortcodes (`:rocket:` → 🚀)
- YAML frontmatter → standard *and* custom Word document properties
- Output format: `docx`
- Themes: `clean`, `compact`, `serif`

## Roadmap

1. ✅ md → docx library + CLI
2. [ ] PDF renderer
3. [ ] PPTX renderer (`---` → slides)
4. [ ] Mermaid diagram rendering
5. ✅ LaTeX math
6. ✅ Image embedding (local + remote)
7. [ ] Custom template / branding support
8. [ ] Web demo (drag-drop + live preview)
9. [ ] Packaged agent **SKILL** so any AI can export on demand
