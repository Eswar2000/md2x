# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.2] - 2026-07-18

### Added

- Inline HTML styling for `<kbd>`, `<abbr>`, `<small>`, and `<cite>`, including
  attributes on opening tags such as `<abbr title="…">`.
- Restored the `md2x-mcp` binary (MCP server exposing `create_docx` and
  `list_themes`), which was unintentionally dropped from the published package.
- Developer tooling: ESLint (flat config) + Prettier, with `lint`, `lint:fix`,
  `format`, and `format:check` scripts.
- GitHub Actions CI (lint, format check, typecheck, build, and tests) and a
  tag-triggered release workflow that publishes to npm with provenance.

### Fixed

- `md2x --list-themes` and `md2x --version` no longer require an input argument.
- The CLI now reports the real package version instead of a hard-coded `0.1.0`.
- Default output is written next to the input file, matching the documented
  behavior, instead of the current working directory.
- README install and import instructions now use the scoped package name
  `@eswar2000/md2x`.

### Changed

- CI now runs on Node 20/22/24 (ESLint 10 requires Node 20.19+), and the release
  workflow runs the full verification suite before publishing.
- Removed the inaccurate `zero-dependencies` keyword and the unused
  `mdast-util-to-string` dependency.


## [0.1.1] - 2026-07-18

### Changed

- Clarified the "no native dependencies" wording in the README (every dependency
  is pure JavaScript).
- Switched repository and example links in the README to absolute GitHub URLs so
  they resolve on the npm package page.

## [0.1.0] - 2026-07-11

### Added

- Initial release: **Markdown → `.docx`** as a library and CLI, covering
  headings, paragraphs, lists (ordered/unordered/nested/mixed/task), tables with
  alignment, fenced code with syntax highlighting, blockquotes and GitHub-style
  callouts, images (local/remote/data URI), LaTeX math, footnotes, a native
  Table of Contents, emoji shortcodes, and YAML frontmatter → document
  properties.
- **MCP server** (`md2x-mcp`) exposing `create_docx` and `list_themes` so
  MCP-capable AI clients can generate documents from a chat.
- Themes: `clean`, `compact`, `serif`.
