// @ts-nocheck

import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import pluginReact from "eslint-plugin-react";
import json from "@eslint/json";
import markdown from "@eslint/markdown";
// import css from "@eslint/css";
import gitignore from "eslint-config-flat-gitignore";
import { defineConfig } from "eslint/config";
import importsLastPlugin from "./eslint-imports-last-plugin.js";

const codeFiles = ["**/*.{js,mjs,cjs,ts,mts,cts,jsx,tsx}"];
const tsFiles = [
  "server/**/*.{ts,mts,cts,tsx}",
  "ui/**/*.{ts,mts,cts,tsx}",
  "lib/**/*.{ts,mts,cts,tsx}",
  "**/*.d.ts",
];
const reactFiles = ["**/*.{jsx,tsx}"];

export default defineConfig([
  gitignore(),
  {
    files: codeFiles,
    ignores: ["eslint.config.ts"],
    plugins: {
      js,
      "imports-last": importsLastPlugin,
    },
    extends: ["js/recommended"],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: {
      "imports-last/imports-last": "error",
    },
  },
  ...tseslint.configs.recommended.map((config) => ({
    ...config,
    files: config.files ?? tsFiles,
  })),
  {
    ...pluginReact.configs.flat.recommended,
    files: reactFiles,
    settings: {
      ...pluginReact.configs.flat.recommended.settings,
      react: {
        version: "19.0",
      },
    },
  },
  {
    ...pluginReact.configs.flat["jsx-runtime"],
    files: reactFiles,
  },
  {
    files: ["tsconfig.json"],
    plugins: { json },
    language: "json/jsonc",
    extends: ["json/recommended"],
  },
  {
    files: ["**/*.json"],
    ignores: ["tsconfig.json"],
    plugins: { json },
    language: "json/json",
    extends: ["json/recommended"],
  },
  {
    files: ["**/*.jsonc"],
    plugins: { json },
    language: "json/jsonc",
    extends: ["json/recommended"],
  },
  {
    files: ["**/*.json5"],
    plugins: { json },
    language: "json/json5",
    extends: ["json/recommended"],
  },
  {
    files: ["**/*.md"],
    plugins: { markdown },
    language: "markdown/gfm",
    extends: ["markdown/recommended"],
  },
  // {
  //   files: ["**/*.css"],
  //   plugins: { css },
  //   language: "css/css",
  //   extends: ["css/recommended"],
  // },
]);
