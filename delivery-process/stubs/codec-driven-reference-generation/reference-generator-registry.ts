/**
 * @libar-docs
 * @libar-docs-status roadmap
 * @libar-docs-implements CodecDrivenReferenceGeneration
 * @libar-docs-uses GeneratorRegistry, CodecBasedGenerator
 * @libar-docs-target src/generators/built-in/reference-generators.ts
 *
 * ## Reference Generator Registrations
 *
 * Registers all 11 reference document generators in the existing
 * GeneratorRegistry. Each registration is a ReferenceDocConfig object
 * that replaces one recipe .feature file.
 *
 * ## Design Decisions
 *
 * - AD-1: Configs live in one file — the registry IS the manifest
 * - AD-2: Each config registers TWO generators: detailed + summary
 * - AD-3: Generator names follow pattern: "{name}-reference" and "{name}-reference-claude"
 * - AD-4: Output paths derived from config (docsFilename, claudeMdSection/claudeMdFilename)
 *
 * See: CodecDrivenReferenceGeneration spec
 * Since: DS (design session)
 */

import type { ReferenceDocConfig } from "./reference-codec.js";

// ============================================================================
// Reference Document Configurations
// ============================================================================

/**
 * All reference document configurations.
 *
 * Each entry replaces one recipe .feature file from delivery-process/recipes/.
 * The Source Mapping tables from recipes are encoded in conventionTags,
 * shapeSources, and behaviorTags.
 */
export const REFERENCE_CONFIGS: readonly ReferenceDocConfig[] = [
  {
    title: "Process Guard Reference",
    conventionTags: ["fsm-rules"],
    shapeSources: ["src/lint/*.ts", "src/validation/*.ts"],
    behaviorTags: ["process-guard"],
    claudeMdSection: "validation",
    docsFilename: "PROCESS-GUARD-REFERENCE.md",
    claudeMdFilename: "process-guard.md",
  },
  {
    title: "Session Guides Reference",
    conventionTags: ["session-workflow", "fsm-rules"],
    shapeSources: [],
    behaviorTags: ["session-guides"],
    claudeMdSection: "sessions",
    docsFilename: "SESSION-GUIDES-REFERENCE.md",
    claudeMdFilename: "session-guides.md",
  },
  {
    title: "Architecture Reference",
    conventionTags: ["pipeline-architecture", "output-format"],
    shapeSources: ["src/generators/types.ts", "src/generators/pipeline/*.ts"],
    behaviorTags: ["architecture"],
    claudeMdSection: "architecture",
    docsFilename: "ARCHITECTURE-REFERENCE.md",
    claudeMdFilename: "architecture.md",
  },
  {
    title: "Configuration Reference",
    conventionTags: ["config-presets"],
    shapeSources: ["src/config/*.ts"],
    behaviorTags: ["configuration"],
    claudeMdSection: "config",
    docsFilename: "CONFIGURATION-REFERENCE.md",
    claudeMdFilename: "configuration.md",
  },
  {
    title: "Instructions Reference",
    conventionTags: ["annotation-system", "pattern-naming"],
    shapeSources: ["src/taxonomy/*.ts", "src/cli/*.ts"],
    behaviorTags: ["instructions"],
    claudeMdSection: "reference",
    docsFilename: "INSTRUCTIONS-REFERENCE.md",
    claudeMdFilename: "instructions.md",
  },
  {
    title: "Methodology Reference",
    conventionTags: ["session-workflow", "annotation-system"],
    shapeSources: [],
    behaviorTags: ["methodology"],
    claudeMdSection: "methodology",
    docsFilename: "METHODOLOGY-REFERENCE.md",
    claudeMdFilename: "methodology.md",
  },
  {
    title: "Gherkin Patterns Reference",
    conventionTags: ["testing-policy"],
    shapeSources: [],
    behaviorTags: ["gherkin-patterns"],
    claudeMdSection: "gherkin",
    docsFilename: "GHERKIN-PATTERNS-REFERENCE.md",
    claudeMdFilename: "gherkin-patterns.md",
  },
  {
    title: "Taxonomy Reference",
    conventionTags: ["annotation-system"],
    shapeSources: ["src/taxonomy/*.ts"],
    behaviorTags: ["taxonomy"],
    claudeMdSection: "taxonomy",
    docsFilename: "TAXONOMY-REFERENCE.md",
    claudeMdFilename: "taxonomy.md",
  },
  {
    title: "Validation Reference",
    conventionTags: ["fsm-rules", "testing-policy"],
    shapeSources: ["src/validation/*.ts"],
    behaviorTags: ["validation"],
    claudeMdSection: "validation",
    docsFilename: "VALIDATION-REFERENCE.md",
    claudeMdFilename: "validation.md",
  },
  {
    title: "Publishing Reference",
    conventionTags: ["publishing"],
    shapeSources: [],
    behaviorTags: ["publishing"],
    claudeMdSection: "publishing",
    docsFilename: "PUBLISHING-REFERENCE.md",
    claudeMdFilename: "publishing.md",
  },
  {
    title: "Index Reference",
    conventionTags: ["doc-generation"],
    shapeSources: [],
    behaviorTags: ["index"],
    claudeMdSection: "index",
    docsFilename: "INDEX-REFERENCE.md",
    claudeMdFilename: "index.md",
  },
] as const;

// ============================================================================
// Registration
// ============================================================================

/**
 * Registers all reference generators in the GeneratorRegistry.
 *
 * Each config produces TWO generator registrations:
 * 1. "{name}-reference" → detailed output → docs/{docsFilename}
 * 2. "{name}-reference-claude" → summary output → _claude-md/{section}/{filename}
 *
 * Uses existing CodecBasedGenerator adapter — no new generator infrastructure.
 *
 * @example
 * ```typescript
 * import { registerReferenceGenerators } from './reference-generators.js';
 * import { registry } from '../registry.js';
 *
 * registerReferenceGenerators(registry);
 *
 * // Now available:
 * registry.get('process-guard-reference');       // detailed docs
 * registry.get('process-guard-reference-claude'); // summary _claude-md
 * ```
 */
export function registerReferenceGenerators(
  _registry: unknown // GeneratorRegistry
): void {
  // For each config in REFERENCE_CONFIGS:
  // 1. Create codec with createReferenceCodec(config, { detailLevel: 'detailed' })
  // 2. Wrap in CodecBasedGenerator with output path docs/{docsFilename}
  // 3. Register as "{kebab-name}-reference"
  //
  // 4. Create codec with createReferenceCodec(config, { detailLevel: 'summary' })
  // 5. Wrap in CodecBasedGenerator with output path _claude-md/{section}/{filename}
  // 6. Register as "{kebab-name}-reference-claude"

  throw new Error("registerReferenceGenerators not yet implemented - roadmap pattern");
}
