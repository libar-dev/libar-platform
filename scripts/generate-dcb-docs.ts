#!/usr/bin/env npx tsx
/**
 * POC: Generate DCB API Reference Documentation
 *
 * Demonstrates code-first documentation generation using the delivery-process
 * DecisionDocGenerator. Extracts TypeScript types from annotated source files
 * and generates both compact (for Claude context) and detailed (for humans) output.
 *
 * Usage: npx tsx scripts/generate-dcb-docs.ts
 *
 * Output:
 * - docs-generated/_claude-md/platform/dcb-api-reference.md (compact)
 * - docs-generated/docs/DCB-API-REFERENCE.md (detailed)
 */

import { execSync } from "node:child_process";
import * as path from "node:path";
import * as fs from "node:fs";

const ROOT_DIR = path.resolve(import.meta.dirname, "..");
const OUTPUT_DIR = path.join(ROOT_DIR, "docs-generated");

console.log("=".repeat(60));
console.log("POC: DCB API Reference - Code-First Documentation");
console.log("=".repeat(60));
console.log();

// Ensure output directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  console.log(`Created output directory: ${OUTPUT_DIR}`);
}

// Use the generate-docs CLI with doc-from-decision generator
const cmd = [
  "pnpm exec generate-docs",
  "-g doc-from-decision",
  "-i 'packages/platform-core/src/dcb/**/*.ts'", // TypeScript sources for shape extraction
  "--features 'specs/platform/generated-docs/*.feature'",
  `-o docs-generated`,
  "-f", // force overwrite
].join(" ");

console.log(`Running: ${cmd}`);
console.log();

try {
  execSync(cmd, {
    cwd: ROOT_DIR,
    stdio: "inherit",
    env: { ...process.env },
  });

  console.log();
  console.log("=".repeat(60));
  console.log("POC Complete!");
  console.log("=".repeat(60));
  console.log();

  // List generated files
  const listFiles = (dir: string, prefix = "") => {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        console.log(`${prefix}${entry.name}/`);
        listFiles(fullPath, prefix + "  ");
      } else {
        const stats = fs.statSync(fullPath);
        console.log(`${prefix}${entry.name} (${stats.size} bytes)`);
      }
    }
  };

  console.log("Generated files:");
  listFiles(OUTPUT_DIR);
  console.log();

} catch (error) {
  console.error("Generation failed:", error);
  process.exit(1);
}
