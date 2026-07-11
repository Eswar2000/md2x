import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkFrontmatter from "remark-frontmatter";
import remarkGemoji from "remark-gemoji";
import { parse as parseYaml } from "yaml";
import type { Root, Yaml } from "mdast";
import type { DocMeta } from "./types.js";

/** Parsed markdown: the mdast tree plus any frontmatter metadata. */
export interface ParsedMarkdown {
  tree: Root;
  meta: DocMeta;
}

const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkMath)
  .use(remarkGemoji)
  .use(remarkFrontmatter, ["yaml"]);

/**
 * Parse a markdown string into an mdast tree and extract YAML frontmatter.
 * Frontmatter is left in the tree as a `yaml` node; we read it out into meta.
 */
export function parseMarkdown(markdown: string): ParsedMarkdown {
  // `parse` only runs tokenizer-level extensions (gfm, frontmatter); `runSync`
  // applies transformer plugins such as remark-gemoji to the parsed tree.
  const tree = processor.runSync(processor.parse(markdown)) as Root;

  let meta: DocMeta = {};
  const yamlNode = tree.children.find((n): n is Yaml => n.type === "yaml");
  if (yamlNode) {
    try {
      const parsed = parseYaml(yamlNode.value);
      if (parsed && typeof parsed === "object") {
        meta = normalizeMeta(parsed as Record<string, unknown>);
      }
    } catch {
      // Malformed frontmatter is non-fatal; we simply ignore it.
    }
  }

  return { tree, meta };
}

/** Coerce a few well-known frontmatter fields into the shapes we expect. */
function normalizeMeta(raw: Record<string, unknown>): DocMeta {
  const meta: DocMeta = { ...raw };
  if (typeof raw.keywords === "string") {
    meta.keywords = raw.keywords
      .split(",")
      .map((k) => k.trim())
      .filter(Boolean);
  }
  return meta;
}
