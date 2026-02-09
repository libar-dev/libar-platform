/**
 * @libar-docs
 * @libar-docs-status roadmap
 * @libar-docs-implements CodecDrivenReferenceGeneration
 * @libar-docs-target src/renderable/codecs/convention-extractor.ts
 *
 * ## Convention Extractor
 *
 * Filters MasterDataset for decision records tagged with
 * `@libar-docs-convention` and extracts their Rule block content
 * as structured data for reference codec composition.
 *
 * ## Design Decisions
 *
 * - AD-1: Conventions are decision record patterns with @convention tag
 * - AD-2: Rule block structure (Invariant/Rationale/Verified-by) is preserved
 * - AD-3: Tables in Rule blocks are extracted as structured data, not raw text
 * - AD-4: Multiple convention tags per decision record are supported (CSV)
 *
 * See: CodecDrivenReferenceGeneration spec
 * Since: DS (design session)
 */

import type { MasterDataset } from "../../generators/pipeline/types.js";

// ============================================================================
// Convention Content Types
// ============================================================================

/**
 * Structured content extracted from a decision record Rule block.
 */
export interface ConventionRuleContent {
  /** Rule name from the Gherkin Rule: block */
  readonly ruleName: string;

  /** Invariant statement if present */
  readonly invariant?: string;

  /** Rationale statement if present */
  readonly rationale?: string;

  /** Verified-by references if present */
  readonly verifiedBy?: readonly string[];

  /** Tables found in the Rule block description */
  readonly tables: readonly ConventionTable[];

  /** Free-text content (non-table, non-structured) */
  readonly narrative: string;
}

/**
 * A table extracted from a Rule block.
 */
export interface ConventionTable {
  readonly headers: readonly string[];
  readonly rows: readonly Record<string, string>[];
}

/**
 * All convention content for a given tag value.
 */
export interface ConventionBundle {
  /** The convention tag value (e.g., "fsm-rules") */
  readonly conventionTag: string;

  /** Source decision records that contributed */
  readonly sourceDecisions: readonly string[];

  /** Extracted Rule block content, ordered by source */
  readonly rules: readonly ConventionRuleContent[];
}

// ============================================================================
// Extraction Function
// ============================================================================

/**
 * Extracts convention content from MasterDataset.
 *
 * Filters patterns for decision records tagged with `@libar-docs-convention`
 * matching the requested tag values. Extracts Rule block content as
 * structured data.
 *
 * Decision records are already in the MasterDataset as patterns — this
 * function filters and reshapes, not re-parses.
 *
 * @param dataset - The MasterDataset containing all extracted patterns
 * @param conventionTags - Convention tag values to filter by
 * @returns Array of ConventionBundles, one per requested tag value
 *
 * @example
 * ```typescript
 * const conventions = extractConventions(dataset, ['fsm-rules', 'testing-policy']);
 * // conventions[0].conventionTag === 'fsm-rules'
 * // conventions[0].rules[0].ruleName === 'FSM Transitions'
 * // conventions[0].rules[0].tables[0].headers === ['From', 'To', 'Condition']
 * ```
 */
export function extractConventions(
  _dataset: MasterDataset,
  _conventionTags: readonly string[]
): ConventionBundle[] {
  // 1. Filter dataset.patterns for decision records (source === 'gherkin', has @adr tag)
  // 2. Filter by @libar-docs-convention tag matching requested values
  // 3. Extract Rule block content using existing partitionAdrRules() from adr.ts
  // 4. Parse structured elements (Invariant, Rationale, Verified-by, tables)
  // 5. Group by convention tag value

  throw new Error("ConventionExtractor not yet implemented - roadmap pattern");
}
