/**
 * @libar-docs
 * @libar-docs-status roadmap
 * @libar-docs-implements CodecDrivenReferenceGeneration
 * @libar-docs-target src/renderable/codecs/reference.ts
 *
 * ## Parameterized Reference Document Codec
 *
 * A single codec factory that creates reference document codecs from
 * configuration objects. Replaces 11 recipe .feature files with
 * TypeScript config.
 *
 * ## Design Decisions
 *
 * - AD-1: One factory, many configs — not 11 separate codec classes
 * - AD-2: Config objects encode the Source Mapping from recipes
 * - AD-3: Convention content extracted from MasterDataset (not from files)
 * - AD-4: DetailLevel controls output density (summary for _claude-md/)
 * - AD-5: Composition order: conventions → shapes → behaviors
 * - AD-6: shapeSources resolved via in-memory glob matching against pattern.source.file
 *         (SourceInfo.file field on ExtractedPattern). No filesystem access needed —
 *         MasterDataset patterns already carry source.file and extractedShapes.
 *         Use picomatch for glob matching or simple path prefix matching as a
 *         dependency-free alternative (e.g., source.file.startsWith("src/lint/")).
 *
 * See: CodecDrivenReferenceGeneration spec
 * Since: DS (design session)
 */

import { z } from "zod/v4";
import type { MasterDataset } from "../../generators/pipeline/types.js";
import type { RenderableDocument } from "../types.js";
import type { BaseCodecOptions, DetailLevel } from "./types/base.js";
import { MasterDatasetSchema } from "../../validation-schemas/master-dataset.js";
import { RenderableDocumentOutputSchema } from "./shared-schema.js";
import { mergeOptions } from "./types/base.js";
import { extractConventions } from "./convention-extractor.js";

// ============================================================================
// Configuration Types
// ============================================================================

/**
 * Configuration for a reference document type.
 *
 * Each config object replaces one recipe .feature file.
 * The Source Mapping from the recipe becomes these fields.
 */
export interface ReferenceDocConfig {
  /** Document title (e.g., "Process Guard Reference") */
  readonly title: string;

  /** Convention tag values to extract from decision records */
  readonly conventionTags: readonly string[];

  /**
   * Glob patterns for TypeScript shape extraction sources.
   * Maps to Source Mapping rows where Extraction Method = "extract-shapes tag"
   */
  readonly shapeSources: readonly string[];

  /**
   * Tags to filter behavior patterns from MasterDataset.
   * Maps to Source Mapping rows where Source = behavior specs
   */
  readonly behaviorTags: readonly string[];

  /**
   * Target _claude-md/ directory for summary output.
   * Maps to @libar-docs-claude-md-section from recipes.
   */
  readonly claudeMdSection: string;

  /**
   * Output filename for detailed docs (in docs/).
   * e.g., "PROCESS-GUARD-REFERENCE.md"
   */
  readonly docsFilename: string;

  /**
   * Output filename for summary _claude-md module.
   * e.g., "process-guard.md"
   */
  readonly claudeMdFilename: string;
}

// ============================================================================
// Reference Codec Options
// ============================================================================

export interface ReferenceCodecOptions extends BaseCodecOptions {
  /** Override detail level (default: 'standard') */
  readonly detailLevel?: DetailLevel;
}

const DEFAULT_REFERENCE_OPTIONS: ReferenceCodecOptions = {
  detailLevel: "standard",
  generateDetailFiles: false,
};

// ============================================================================
// Codec Factory
// ============================================================================

/**
 * Creates a reference document codec from configuration.
 *
 * The codec composes a RenderableDocument from three sources:
 * 1. Convention content — Rule blocks from convention-tagged decision records
 * 2. Shape extractions — TypeScript types from annotated source files
 * 3. Behavior content — Rules and scenarios from behavior specs
 *
 * @param config - Reference document configuration (replaces recipe file)
 * @param options - Codec options including DetailLevel
 */
export function createReferenceCodec(config: ReferenceDocConfig, options?: ReferenceCodecOptions) {
  const _opts = mergeOptions(DEFAULT_REFERENCE_OPTIONS, options);

  return z.codec(MasterDatasetSchema, RenderableDocumentOutputSchema, {
    decode: (_dataset: MasterDataset): RenderableDocument => {
      // 1. Extract convention content from tagged decision records
      const _conventions = extractConventions(_dataset, config.conventionTags);

      // 2. Filter patterns with extractedShapes by source file path (AD-6)
      // For each config.shapeSources glob, iterate _dataset.patterns where
      // pattern.source.file matches the glob. Collect pattern.extractedShapes.
      // Uses in-memory glob matching — no filesystem access needed.

      // 3. Filter behavior patterns by tags
      // Uses dataset.patterns filtered by config.behaviorTags

      // 4. Compose RenderableDocument based on DetailLevel
      // summary: tables, type names only, <100 lines
      // standard: tables + descriptions + code examples
      // detailed: everything including full JSDoc

      throw new Error("CodecDrivenReferenceGeneration not yet implemented - roadmap pattern");
    },
    encode: (): never => {
      throw new Error("ReferenceDocumentCodec is decode-only");
    },
  });
}
