@libar-docs
@libar-docs-adr:006
@libar-docs-adr-status:accepted
@libar-docs-adr-category:process
@libar-docs-release:v0.3.0
@libar-docs-pattern:PDR006TypeScriptTaxonomy
@libar-docs-status:completed
@libar-docs-unlock-reason:Migrate-to-Rule-keyword-structure
@libar-docs-completed:2026-01-09
@libar-docs-phase:43
@libar-docs-quarter:Q1-2026
@libar-docs-effort-planned:4h
@libar-docs-effort-actual:6h
@libar-docs-business-value:compile-time-taxonomy-protection
@libar-docs-depends-on:PDR005MvpWorkflow
@libar-docs-product-area:Process
Feature: PDR-006 - TypeScript-Sourced Taxonomy

  Rule: Context - JSON taxonomy lacked compile-time safety

    The delivery-process package uses tag-registry.json files to define taxonomy:
    - Categories (scanner, extractor, generator, etc.)
    - Metadata tags (status, phase, effort, etc.)
    - Aggregation tags (overview, decision, etc.)

    Previously:
    - JSON files were the source of truth
    - Zod schemas validated structure at runtime
    - No compile-time enforcement of domain values
    - Consumers used string literals that may not match registry

    Problems:
    1. Typos in status values only caught at runtime
    2. Renaming a status value requires manual search/replace
    3. No IDE autocomplete for valid taxonomy values
    4. JSON can be edited without type checking

  Rule: Decision - TypeScript constants as source of truth with generated JSON

    Adopt TypeScript as the source of truth for taxonomy:

    TypeScript Constants --> Zod Schemas --> JSON (generated)
         (source)           (validation)      (artifact)

    Key principles:
    1. TypeScript "as const" arrays define valid values
    2. Types are inferred from constants (no duplication)
    3. Zod schemas use the constants for runtime validation
    4. JSON files are generated artifacts (not edited manually)

    Implementation (2026-01-09):

    The taxonomy module was implemented at packages/libar-dev/delivery-process/src/taxonomy/:

    | File | Purpose |
    |------|---------|
    | status-values.ts | PROCESS_STATUS_VALUES constant |
    | normalized-status.ts | NORMALIZED_STATUS_VALUES constant |
    | categories.ts | CATEGORY_TAGS constant |
    | format-types.ts | FORMAT_TYPES constant |
    | hierarchy-levels.ts | HIERARCHY_LEVELS constant |
    | layer-types.ts | LAYER_TYPES constant |
    | registry-builder.ts | buildDefaultRegistry() |

    The taxonomyModified detection in process-guard was deprecated since
    TypeScript changes require recompilation, making runtime detection unnecessary.

    Superseded Spec:
    The deferred-status-handling.feature spec proposed a flag-based approach
    (libar-process-deferred:true alongside roadmap status). This was superseded
    by making "deferred" a first-class FSM status value instead.

    @happy-path @acceptance-criteria
    Scenario: Compiler enforces taxonomy values
      Given the taxonomy is defined in TypeScript files
      When I reference a status value in code
      Then the compiler enforces it matches defined values
      And IDE provides autocomplete for valid options

    @acceptance-criteria
    Scenario: Zod schemas derive from TypeScript constants
      Given the TypeScript constant "PROCESS_STATUS_VALUES"
      When the Zod schema is defined
      Then it uses z.enum(PROCESS_STATUS_VALUES) not z.array(z.string())
      And invalid values are rejected at both compile and runtime

  Rule: Consequences - Compile-time safety with migration overhead

    Positive outcomes:
    - Compile-time safety for all taxonomy values
    - IDE autocomplete and refactoring support
    - Single source of truth (TypeScript)
    - Zod validation remains for runtime boundary protection

    Negative outcomes:
    - External tools expecting JSON need generated output (mitigated by registry-builder.ts)
    - Migration effort for existing JSON definitions (completed)

    Trade-off accepted:
    - JSON becomes a derived artifact, not source
    - External consumers use generated JSON unchanged

    @acceptance-criteria
    Scenario: Registry builder creates valid TagRegistry
      Given the TypeScript taxonomy definitions
      When buildDefaultRegistry() is called
      Then a TagRegistry object is returned
      And the registry matches the TypeScript definitions exactly

    @acceptance-criteria
    Scenario: Type inference from constants
      Given the constant "PROCESS_STATUS_VALUES = ['roadmap', 'active', 'completed', 'deferred'] as const"
      When ProcessStatusValue type is defined
      Then it infers to "roadmap" | "active" | "completed" | "deferred"
      And no type duplication is required
