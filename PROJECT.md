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

- Headings (1–6), paragraphs, horizontal rules
- **Bold**, *italic*, ~~strikethrough~~, `inline code`, links
- Ordered / unordered / nested lists and task lists
- GFM tables with column alignment
- Fenced code blocks
- Blockquotes
- YAML frontmatter → document metadata
- Output format: `docx`
- Themes: `clean`, `compact`, `serif`

## Roadmap

1. ✅ md → docx library + CLI
2. [ ] PDF renderer
3. [ ] PPTX renderer (`---` → slides)
4. [ ] Mermaid diagram rendering
5. [ ] LaTeX math
6. [ ] Image embedding (local + remote)
7. [ ] Custom template / branding support
8. [ ] Web demo (drag-drop + live preview)
9. [ ] Packaged agent **SKILL** so any AI can export on demand
