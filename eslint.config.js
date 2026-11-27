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
      // Bundled upstream knowledge is vendored verbatim and hashed by the parity
      // checks, so it is never ours to restyle.
      "packages/knowledge/**",
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
      "scripts/**/*.ts"
    ],
    ...tseslint.configs.disableTypeChecked
  }
);
