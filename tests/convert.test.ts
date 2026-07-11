import { describe, expect, it } from "vitest";
import { convert } from "../src/index.js";

/** The docx zip signature: bytes "PK\x03\x04". */
const ZIP_MAGIC = Buffer.from([0x50, 0x4b, 0x03, 0x04]);

describe("convert -> docx", () => {
  it("produces a non-empty docx buffer with a valid zip header", async () => {
    const md = "# Title\n\nHello **world** with `code` and *emphasis*.";
    const { buffer, format, extension } = await convert(md, { format: "docx" });

    expect(format).toBe("docx");
    expect(extension).toBe("docx");
    expect(buffer.length).toBeGreaterThan(0);
    expect(buffer.subarray(0, 4).equals(ZIP_MAGIC)).toBe(true);
  });

  it("extracts frontmatter into document metadata", async () => {
    const md = ["---", "title: My Report", "author: Ada", "---", "", "Body."].join("\n");
    const { meta } = await convert(md);

    expect(meta.title).toBe("My Report");
    expect(meta.author).toBe("Ada");
  });

  it("handles lists, tables, code blocks and quotes without throwing", async () => {
    const md = [
      "# Doc",
      "",
      "- one",
      "- two",
      "  - nested",
      "",
      "1. first",
      "2. second",
      "",
      "> a quote",
      "",
      "| a | b |",
      "| - | - |",
      "| 1 | 2 |",
      "",
      "```js",
      "const x = 1;",
      "```",
    ].join("\n");

    const { buffer } = await convert(md, { format: "docx", theme: "compact" });
    expect(buffer.length).toBeGreaterThan(0);
  });

  it("handles math, callouts and emoji without throwing", async () => {
    const md = [
      "# Doc",
      "",
      "Inline $a^2 + b^2 = c^2$ math.",
      "",
      "$$",
      "\\int_0^1 x^2 \\, dx = \\frac{1}{3}",
      "$$",
      "",
      "> [!NOTE]",
      "> A callout with a rocket :rocket:.",
    ].join("\n");

    const { buffer } = await convert(md, { format: "docx" });
    expect(buffer.subarray(0, 4).equals(ZIP_MAGIC)).toBe(true);
    expect(buffer.length).toBeGreaterThan(0);
  });

  it("throws on an unknown theme", async () => {
    await expect(convert("# hi", { theme: "does-not-exist" })).rejects.toThrow(/Unknown theme/);
  });
});
