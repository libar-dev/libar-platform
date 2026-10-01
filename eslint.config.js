import tseslint from "typescript-eslint";
import convex from "@convex-dev/eslint-plugin";
export default tseslint.config(
  { ignores: ["**/_generated/**", "generated/**"] },
  ...tseslint.configs.recommended,
  ...convex.configs.recommended.map((config) => ({
    ...config,
    files: ["fixture/convex/**/*.ts"],
  })),
  // The acceptance contract requires this deployment-time config to read process.env.
  {
    files: ["fixture/convex/auth.config.ts"],
    rules: { "@convex-dev/no-process-env": "off" },
  },
);
