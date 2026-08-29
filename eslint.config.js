import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked.map((config) => ({ ...config, files: ["**/*.ts", "**/*.tsx"] })),
  {
    ignores: [
      "**/dist/**",
      "**/lib/**",
      "**/coverage/**",
      "**/node_modules/**",
      "docs/blueprint/**",
      "packages/knowledge/oh-story/**",
      "release/**"
    ]
  },
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parserOptions: {
        project: ["./tsconfig.lint.json"],
        tsconfigRootDir: import.meta.dirname
      }
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-misused-promises": "off"
    }
  },
  {
    files: [
      "**/test/**/*.{ts,tsx}",
      "**/tests/**/*.{ts,tsx}",
      "**/*.config.ts",
      "scripts/**/*.ts",
      "tests/**/*.ts",
      "vitest.workspace.ts",
      "playwright.config.ts"
    ],
    ...tseslint.configs.disableTypeChecked
  }
);
