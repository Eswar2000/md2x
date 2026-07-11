/**
 * Public types for md2x.
 */

/** Output formats supported by md2x. Only `docx` is implemented today. */
export type OutputFormat = "docx";

/** Metadata parsed from YAML frontmatter and applied to the document. */
export interface DocMeta {
  title?: string;
  author?: string;
  subject?: string;
  keywords?: string[];
  date?: string;
  [key: string]: unknown;
}

/** A visual theme controlling fonts, sizes and colors of the output. */
export interface Theme {
  name: string;
  /** Base body font family. */
  bodyFont: string;
  /** Font family used for headings. */
  headingFont: string;
  /** Monospace font for code. */
  monoFont: string;
  /** Body font size in half-points (docx unit). 22 = 11pt. */
  bodySize: number;
  /** Heading sizes in half-points, indexed by depth 1-6. */
  headingSizes: [number, number, number, number, number, number];
  /** Primary color for headings, as a hex string without the leading '#'. */
  headingColor: string;
  /** Accent color used for links, as hex without '#'. */
  accentColor: string;
  /** Background shading for code blocks, as hex without '#'. */
  codeBackground: string;
  /** Color for blockquote text/bar, as hex without '#'. */
  quoteColor: string;
}

/** Options accepted by {@link convert}. */
export interface ConvertOptions {
  /** Target format. Defaults to `docx`. */
  format?: OutputFormat;
  /** Theme name (see built-in themes) or a full Theme object. Defaults to `clean`. */
  theme?: string | Theme;
  /** Override or supply document metadata (merged over frontmatter). */
  meta?: DocMeta;
  /** Base directory used to resolve relative image paths. Defaults to `process.cwd()`. */
  basePath?: string;
}

/** Result returned by {@link convert}. */
export interface ConvertResult {
  /** The rendered document as a binary buffer. */
  buffer: Buffer;
  /** The format that was produced. */
  format: OutputFormat;
  /** File extension (without dot) suitable for the produced buffer. */
  extension: string;
  /** Metadata that was applied to the document. */
  meta: DocMeta;
}
