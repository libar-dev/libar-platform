import tseslint from "typescript-eslint";
import convex from "@convex-dev/eslint-plugin";
const noModuleLoading = [
  "error",
  {
    selector: "ImportExpression",
    message: "Pure domain code loads no module at run time.",
  },
];
// spec:context.context-component: no component function reads ctx.auth or the environment. The
// parent passes the actor and the tenant as arguments.
const noAuthNoEnvMessage =
  "Code that runs inside a context component reads neither ctx.auth nor the environment.";
const noAuthNoEnv = [
  "error",
  ...[
    "MemberExpression[property.name='auth']",
    "MemberExpression[property.value='auth']",
    "ObjectPattern > Property[key.name='auth']",
    "MemberExpression[property.name='env']",
    "MemberExpression[property.value='env']",
    "ObjectPattern > Property[key.name='env']",
    "ImportSpecifier[imported.name='env']",
  ].map((selector) => ({ selector, message: noAuthNoEnvMessage })),
];
export default tseslint.config(
  {
    ignores: ["**/_generated/**", "generated/**", "**/*.test.generated.ts"],
  },
  ...tseslint.configs.recommended,
  ...convex.configs.recommended.map((config) => ({
    ...config,
    files: ["fixture/convex/**/*.ts"],
  })),
  // A composition that runs natively reads its auth provider from the deployment's environment.
  {
    files: ["fixture/convex/auth.config.ts"],
    rules: { "@convex-dev/no-process-env": "off" },
  },
  // The kernel imports its own modules and, for Rejection.details, the type Value; nothing else.
  {
    files: ["src/kernel/**/*.ts"],
    rules: {
      // `import { type Value }` would keep an empty runtime import of convex/values.
      "@typescript-eslint/no-import-type-side-effects": "error",
      "no-restricted-syntax": noModuleLoading,
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "convex/values",
              allowImportNames: ["Value"],
              message:
                "The kernel takes only `import type { Value }` from convex/values, which the compiler erases.",
            },
          ],
          patterns: [
            {
              regex: "^convex(?:/(?!values$).*)?$",
              message:
                "The kernel imports nothing from Convex but the type Value.",
            },
            {
              regex: "^node:",
              message: "The kernel imports no Node built-in.",
            },
            {
              regex: "^(?!\\./(?!\\.)|convex(?:/|$)|node:)",
              message: "The kernel imports only its own modules.",
            },
          ],
        },
      ],
    },
  },
  // A fixture decider is pure domain code: it imports the kernel and its own modules only.
  {
    files: ["fixture/domain/**/*.ts"],
    rules: {
      "no-restricted-syntax": noModuleLoading,
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              regex: "^(?!\\./(?!\\.)|\\.\\./\\.\\./src/kernel/index\\.js$)",
              message:
                "A fixture decider imports only src/kernel/index.js and its own modules.",
            },
          ],
        },
      ],
    },
  },
  // The context library and every component of the fixture composition.
  {
    files: ["src/context/**/*.ts", "fixture/convex/*/**/*.ts"],
    rules: { "no-restricted-syntax": noAuthNoEnv },
  },
  // S0's probe of what ctx.auth answers inside a component, which is the one reason it is read there.
  {
    files: ["fixture/convex/annex/identity.ts"],
    rules: { "no-restricted-syntax": "off" },
  },
);
