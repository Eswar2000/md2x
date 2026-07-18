#!/usr/bin/env node
import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { convert } from "./index.js";
import { themes, DEFAULT_THEME } from "./themes.js";

/**
 * md2x MCP server.
 *
 * Exposes md2x as Model Context Protocol tools so any MCP-capable AI client
 * (Claude Desktop, VS Code, Cursor, Cline, …) can turn the Markdown it writes
 * into a real `.docx` on demand — the user just chats.
 *
 * Transport is stdio, so nothing may be written to stdout except protocol
 * messages; all diagnostics go to stderr.
 */

const { version } = createRequire(import.meta.url)("../package.json") as { version: string };

const themeNames = Object.keys(themes) as [string, ...string[]];

/** Resolve a user-supplied output path against the cwd, expanding `~` and adding `.docx`. */
function resolveOutputPath(outputPath?: string): string {
  const raw = outputPath?.trim() ? outputPath.trim() : "document.docx";
  const expanded = raw === "~" || raw.startsWith("~/") ? join(homedir(), raw.slice(1)) : raw;
  let target = isAbsolute(expanded) ? expanded : resolve(process.cwd(), expanded);
  if (!target.toLowerCase().endsWith(".docx")) target += ".docx";
  return target;
}

const server = new McpServer({ name: "md2x", version });

server.registerTool(
  "create_docx",
  {
    title: "Create Word document",
    description:
      "Convert Markdown into a polished Word (.docx) document and save it to disk. " +
      "Use this whenever the user wants a Word document, a .docx, a downloadable " +
      "report, or asks to export/save content as Word. Returns the saved file path.",
    inputSchema: {
      markdown: z.string().describe("The Markdown content to convert."),
      outputPath: z
        .string()
        .optional()
        .describe(
          "Where to write the file. Absolute, or relative to the current working " +
            "directory (e.g. 'report.docx' or 'docs/report.docx'). '~' is expanded to " +
            "the home directory. Defaults to 'document.docx' in the current directory.",
        ),
      theme: z
        .enum(themeNames)
        .optional()
        .describe(`Visual theme. One of: ${themeNames.join(", ")}. Defaults to ${DEFAULT_THEME}.`),
    },
  },
  async ({ markdown, outputPath, theme }) => {
    try {
      const { buffer } = await convert(markdown, {
        format: "docx",
        theme,
        basePath: process.cwd(),
      });
      const target = resolveOutputPath(outputPath);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, buffer);
      return { content: [{ type: "text" as const, text: `Saved Word document to ${target}` }] };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        content: [{ type: "text" as const, text: `Failed to create the document: ${message}` }],
        isError: true,
      };
    }
  },
);

server.registerTool(
  "list_themes",
  {
    title: "List document themes",
    description: "List the visual themes available for the generated Word document.",
    inputSchema: {},
  },
  async () => ({
    content: [
      {
        type: "text" as const,
        text: `Available themes: ${themeNames.join(", ")} (default: ${DEFAULT_THEME}).`,
      },
    ],
  }),
);

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // stderr is safe; stdout is reserved for the MCP protocol.
  console.error("md2x MCP server ready (stdio).");
}

main().catch((err) => {
  console.error("md2x-mcp fatal error:", err);
  process.exit(1);
});
