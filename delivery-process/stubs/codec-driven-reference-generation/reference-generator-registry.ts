/**
 * @libar-docs
 * @libar-docs-status roadmap
 * @libar-docs-implements CodecDrivenReferenceGeneration
 * @libar-docs-uses GeneratorRegistry, DocumentGenerator
 * @libar-docs-target src/generators/built-in/reference-generators.ts
 *
 * ## Reference Generator Registrations
 *
 * Registers all 11 reference document generators in the existing
 * GeneratorRegistry. A single ReferenceDocGenerator class implements
 * DocumentGenerator directly, iterating REFERENCE_CONFIGS to produce
 * dual output (docs/ + _claude-md/) for each reference type.
 *
 * ## Design Decisions
 *
 * - AD-1: Configs live in one file — the registry IS the manifest
 * - AD-2: Single ReferenceDocGenerator handles all configs, producing dual output per config
 * - AD-3: Generator name: "reference-docs" (single registration, all 11 types)
 * - AD-4: Output paths derived from config (docsFilename, claudeMdSection/claudeMdFilename)
 * - AD-5: Follows DecisionDocGeneratorImpl pattern — implements DocumentGenerator
 *         directly, bypasses CodecBasedGenerator/DOCUMENT_TYPES/CodecRegistry.
 *         See decision-doc-generator.ts for the exact precedent.
 * - AD-6: CodecBasedGenerator/DOCUMENT_TYPES path does NOT work because:
 *         (a) DOCUMENT_TYPES is `as const` — not dynamically extensible at runtime
 *         (b) CodecRegistry.register() requires a DocumentType key from the enum
 *         (c) Adding new types requires changes to generate.ts, CodecOptions interface,
 *             codec imports, and factory imports — all in the upstream read-only subtree
 *         (d) DecisionDocGeneratorImpl already proves the direct path is sanctioned
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
    conventionTags: ["config-presets", "cli-patterns"],
    shapeSources: ["src/config/*.ts"],
    behaviorTags: ["configuration"],
    claudeMdSection: "config",
    docsFilename: "CONFIGURATION-REFERENCE.md",
    claudeMdFilename: "configuration.md",
  },
  {
    title: "Instructions Reference",
    conventionTags: ["annotation-system", "pattern-naming", "cli-patterns"],
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
 * ReferenceDocGenerator — implements DocumentGenerator directly (AD-5).
 *
 * Follows DecisionDocGeneratorImpl pattern:
 * - Single class handles ALL 11 reference types
 * - Dual output (docs/ + _claude-md/) is internal to generate()
 * - Registration via createReferenceDocGenerator() factory function
 *
 * NOT using CodecBasedGenerator because DOCUMENT_TYPES is `as const` (AD-6).
 *
 * @example
 * ```typescript
 * import { createReferenceDocGenerator } from './reference-generators.js';
 * import { generatorRegistry } from '../registry.js';
 *
 * generatorRegistry.register(createReferenceDocGenerator());
 *
 * // Now available:
 * generatorRegistry.get('reference-docs');
 * // Produces 22 files: 11 detailed (docs/) + 11 summary (_claude-md/)
 * ```
 */

// class ReferenceDocGenerator implements DocumentGenerator {
//   readonly name = 'reference-docs';
//   readonly description = 'Generate reference documentation from codec configs';
//
//   async generate(
//     _patterns: readonly ExtractedPattern[],
//     context: GeneratorContext
//   ): Promise<GeneratorOutput> {
//     const files: OutputFile[] = [];
//
//     for (const config of REFERENCE_CONFIGS) {
//       // 1. Detailed output → docs/{docsFilename}
//       const detailedCodec = createReferenceCodec(config, { detailLevel: 'detailed' });
//       const detailedDoc = detailedCodec.decode(context.masterDataset);
//       files.push(...renderDocumentWithFiles(detailedDoc, `docs/${config.docsFilename}`));
//
//       // 2. Summary output → _claude-md/{section}/{filename}
//       const summaryCodec = createReferenceCodec(config, { detailLevel: 'summary' });
//       const summaryDoc = summaryCodec.decode(context.masterDataset);
//       files.push(...renderDocumentWithFiles(summaryDoc, `_claude-md/${config.claudeMdSection}/${config.claudeMdFilename}`));
//     }
//
//     return { files };
//   }
// }

export function createReferenceDocGenerator(): unknown /* DocumentGenerator */ {
  // return new ReferenceDocGenerator();
  throw new Error("ReferenceDocGenerator not yet implemented - roadmap pattern");
}
