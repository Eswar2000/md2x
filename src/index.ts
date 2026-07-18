import { parseMarkdown } from "./parse.js";
import { renderDocx } from "./renderers/docx.js";
import { resolveTheme } from "./themes.js";
import type { ConvertOptions, ConvertResult, OutputFormat } from "./types.js";

export type { ConvertOptions, ConvertResult, DocMeta, OutputFormat, Theme } from "./types.js";
export { themes, DEFAULT_THEME } from "./themes.js";

const EXTENSIONS: Record<OutputFormat, string> = {
  docx: "docx",
};

/**
 * Convert a Markdown string into a document buffer.
 *
 * @example
 * ```ts
 * const { buffer } = await convert("# Hello", { format: "docx", theme: "clean" });
 * await fs.writeFile("hello.docx", buffer);
 * ```
 */
export async function convert(
  markdown: string,
  options: ConvertOptions = {},
): Promise<ConvertResult> {
  const format = options.format ?? "docx";
  const theme = resolveTheme(options.theme);
  const { tree, meta: frontmatterMeta } = parseMarkdown(markdown);
  const meta = { ...frontmatterMeta, ...options.meta };

  let buffer: Buffer;
  switch (format) {
    case "docx":
      buffer = await renderDocx(tree, theme, meta, options.basePath);
      break;
    default:
      throw new Error(`Unsupported format: ${format satisfies never}`);
  }

  return { buffer, format, extension: EXTENSIONS[format], meta };
}
