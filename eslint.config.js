import js from "@eslint/js";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";

export default tseslint.config(
  { ignores: ["dist/**", "node_modules/**", "examples/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // The renderer casts through `unknown` in a few well-commented spots.
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
  // Keep ESLint clear of formatting concerns; Prettier owns those.
  prettier,
);
