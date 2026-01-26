import { defineConfig, globalIgnores } from "eslint/config";
import js from "@eslint/js";
import tseslint from "typescript-eslint";

const eslintConfig = defineConfig([
  js.configs.recommended,
  ...tseslint.configs.recommended,
  // Ladle mocks intentionally ignore some props
  {
    files: [".ladle/mocks/**/*.tsx"],
    rules: {
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
  globalIgnores([
    "dist/**",
    "build/**",
    // Symlinked convex folder (linted in order-management)
    "convex/**",
    // Auto-generated route tree
    "routeTree.gen.ts",
    // Auto-generated Playwright-BDD spec files
    "tests/e2e/.features-gen/**",
  ]),
]);

export default eslintConfig;
