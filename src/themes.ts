import type { Theme } from "./types.js";

/**
 * Built-in themes. Keyed by name for lookup from the CLI/API.
 * Sizes use docx half-points (e.g. 22 = 11pt).
 */
export const themes: Record<string, Theme> = {
  clean: {
    name: "clean",
    bodyFont: "Calibri",
    headingFont: "Calibri Light",
    monoFont: "Consolas",
    bodySize: 22,
    headingSizes: [48, 36, 28, 24, 22, 22],
    headingColor: "2F5496",
    accentColor: "2563EB",
    codeBackground: "F3F4F6",
    quoteColor: "6B7280",
  },
  compact: {
    name: "compact",
    bodyFont: "Aptos",
    headingFont: "Aptos Display",
    monoFont: "Cascadia Mono",
    bodySize: 20,
    headingSizes: [36, 28, 24, 22, 20, 20],
    headingColor: "155E75",
    accentColor: "0F766E",
    codeBackground: "F1F5F9",
    quoteColor: "64748B",
  },
  serif: {
    name: "serif",
    bodyFont: "Georgia",
    headingFont: "Georgia",
    monoFont: "Consolas",
    bodySize: 24,
    headingSizes: [44, 34, 28, 24, 24, 24],
    headingColor: "5B21B6",
    accentColor: "9333EA",
    codeBackground: "F5F3FF",
    quoteColor: "6B7280",
  },
};

export const DEFAULT_THEME = "clean";

/** Resolve a theme name or object into a concrete Theme. Throws on unknown name. */
export function resolveTheme(theme: string | Theme | undefined): Theme {
  if (!theme) return themes[DEFAULT_THEME]!;
  if (typeof theme !== "string") return theme;
  const found = themes[theme];
  if (!found) {
    const available = Object.keys(themes).join(", ");
    throw new Error(`Unknown theme "${theme}". Available themes: ${available}`);
  }
  return found;
}
