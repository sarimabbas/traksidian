import tsparser from "@typescript-eslint/parser";
import { defineConfig } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";
import { DEFAULT_BRANDS } from "eslint-plugin-obsidianmd/dist/lib/rules/ui/brands.js";
import { DEFAULT_ACRONYMS } from "eslint-plugin-obsidianmd/dist/lib/rules/ui/acronyms.js";

export default defineConfig([
  ...obsidianmd.configs.recommended,
  {
    files: ["src/**/*.ts"],
    languageOptions: {
      parser: tsparser,
      parserOptions: { project: "./tsconfig.json" },
      globals: {
        console: "readonly",
        window: "readonly",
        navigator: "readonly",
      },
    },
    rules: {
      "obsidianmd/ui/sentence-case": ["error", {
        brands: [...DEFAULT_BRANDS, "Trakt", "Traktr"],
        acronyms: [...DEFAULT_ACRONYMS, "TMDB", "TV"],
        ignoreRegex: ["^trakt", "\"trakt"],
      }],
    },
  },
]);
