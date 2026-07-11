#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { basename, dirname, extname, resolve } from "node:path";
import { Command } from "commander";
import { convert } from "./index.js";
import { themes } from "./themes.js";
import type { OutputFormat } from "./types.js";

const program = new Command();

program
  .name("md2x")
  .description("Convert AI-generated Markdown into polished documents.")
  .argument("<input>", "path to the input Markdown file, or '-' for stdin")
  .option("-o, --output <file>", "output file path (defaults to <input>.docx)")
  .option("-f, --format <format>", "output format", "docx")
  .option("-t, --theme <theme>", "theme name", "clean")
  .option("--list-themes", "list available themes and exit")
  .version("0.1.0")
  .action(async (input: string, opts: CliOptions) => {
    if (opts.listThemes) {
      console.log("Available themes:");
      for (const name of Object.keys(themes)) console.log(`  - ${name}`);
      return;
    }

    const markdown = input === "-" ? await readStdin() : await readFile(resolve(input), "utf8");
    const format = opts.format as OutputFormat;

    const { buffer, extension } = await convert(markdown, {
      format,
      theme: opts.theme,
      basePath: input === "-" ? process.cwd() : dirname(resolve(input)),
    });

    const output = opts.output ?? deriveOutput(input, extension);
    await writeFile(resolve(output), buffer);
    console.error(`Wrote ${output}`);
  });

program.parseAsync(process.argv).catch((err: unknown) => {
  console.error(`md2x: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});

interface CliOptions {
  output?: string;
  format: string;
  theme: string;
  listThemes?: boolean;
}

function deriveOutput(input: string, extension: string): string {
  if (input === "-") return `out.${extension}`;
  const base = basename(input, extname(input));
  return `${base}.${extension}`;
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}
