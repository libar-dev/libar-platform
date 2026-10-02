import { dirname, relative, resolve } from "node:path";
import tseslint from "typescript-eslint";
import convex from "@convex-dev/eslint-plugin";
const repositoryRoot = import.meta.dirname;
// The production composition ships no test code: no module under example/ imports one under
// fixture/, harness/ or tests/. The rule resolves each relative import against the importing file,
// so a path that climbs out of example/ and into one of them is caught however it is spelled. A
// string literal and a template literal with no expression are read; the rule does not catch a bare
// specifier, such as a package name or a path alias, a dynamic import whose path is computed, or a
// require call.
const testCodeDirectories = /^(?:fixture|harness|tests)(?:\/|$)/;
const production = {
  rules: {
    "no-test-code": {
      meta: { type: "problem", schema: [] },
      create(context) {
        function check(source) {
          const path =
            source?.type === "Literal"
              ? source.value
              : source?.type === "TemplateLiteral" &&
                  source.expressions.length === 0
                ? source.quasis[0]?.value.cooked
                : undefined;
          if (typeof path !== "string" || !path.startsWith(".")) return;
          const target = relative(
            repositoryRoot,
            resolve(dirname(context.filename), path),
          ).replaceAll("\\", "/");
          if (testCodeDirectories.test(target))
            context.report({
              node: source,
              message:
                "The production composition imports nothing from fixture/, harness/ or tests/.",
            });
        }
        return {
          ImportDeclaration: (node) => check(node.source),
          ExportNamedDeclaration: (node) => check(node.source),
          ExportAllDeclaration: (node) => check(node.source),
          ImportExpression: (node) => check(node.source),
        };
      },
    },
  },
};
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
    files: ["fixture/convex/**/*.ts", "example/convex/**/*.ts"],
  })),
  // A composition that runs natively reads its auth provider from the deployment's environment.
  {
    files: ["fixture/convex/auth.config.ts", "example/convex/auth.config.ts"],
    rules: { "@convex-dev/no-process-env": "off" },
  },
  {
    files: ["example/**/*.ts"],
    plugins: { production },
    rules: { "production/no-test-code": "error" },
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
  // A decider is pure domain code: it imports the kernel and its own modules only.
  {
    files: ["fixture/domain/**/*.ts", "example/domain/**/*.ts"],
    rules: {
      "no-restricted-syntax": noModuleLoading,
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              regex: "^(?!\\./(?!\\.)|\\.\\./\\.\\./src/kernel/index\\.js$)",
              message:
                "A decider imports only src/kernel/index.js and its own modules.",
            },
          ],
        },
      ],
    },
  },
  // The context library and every component of both compositions.
  {
    files: [
      "src/context/**/*.ts",
      "fixture/convex/*/**/*.ts",
      "example/convex/*/**/*.ts",
    ],
    rules: { "no-restricted-syntax": noAuthNoEnv },
  },
  // The probe of what ctx.auth answers inside a component, which is the one reason it is read there.
  {
    files: ["fixture/convex/annex/identity.ts"],
    rules: { "no-restricted-syntax": "off" },
  },
);
