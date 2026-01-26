# 🚧 Unified Tag Prefix Migration

**Purpose:** Detailed requirements for the Unified Tag Prefix Migration feature

---

## Overview

| Property       | Value                                                |
| -------------- | ---------------------------------------------------- |
| Status         | active                                               |
| Product Area   | DeliveryProcess                                      |
| Business Value | standardize all tags under unified libar docs prefix |
| Phase          | 100                                                  |

## Description

**Problem:** Per PDR-004, all tags should use the unified `@libar-docs-*` prefix.
The codebase had multiple tag formats that needed standardization.

**Current State (2026-01-08):** All ~119 feature files migrated (~1,159 tags converted).
Migration script created and tested. Package internals still use hardcoded
`@libar-process-*` (scanner/extractor). Remaining: Update package to recognize
`@libar-docs-*` natively.

**Tooling:**

- `pnpm migrate-tags` - Migration CLI (from package directory)
- `pnpm lint:patterns` - TypeScript tag linter
- `pnpm lint:patterns:strict` - Strict mode (CI)

**Key Locations (per PDR-004):**

- Repo taxonomy: `delivery-process/tag-registry.json`
- Package taxonomy: `deps/libar-dev-packages/packages/tooling/delivery-process/tag-registry.json`
- Migration script: `deps/libar-dev-packages/packages/tooling/delivery-process/scripts/migrate-tags.ts`

## Acceptance Criteria

**Short-form pattern tag triggers warning**

- Given a feature file with `@pattern:MyPattern`
- When running the pattern linter
- Then warning: "Deprecated: @pattern: should be @libar-docs-pattern:"
- And validation still passes

**Old prefix tags trigger deprecation warning**

- Given a feature file with `@libar-process-pattern:MyPattern`
- When running the pattern linter
- Then warning: "Deprecated: @libar-process-_ prefix should be @libar-docs-_"
- And validation still passes

**New unified prefix passes without warning**

- Given a feature file with `@libar-docs-pattern:MyPattern`
- When running the pattern linter
- Then no deprecation warning is emitted
- And validation passes

**Migrate short-form tags**

- Given a feature file with short-form tags
- When running migrate-tags --file path/to/file.feature
- Then all `@pattern:` become `@libar-docs-pattern:`
- And all `@status:` become `@libar-docs-status:`
- And file is updated in place

**Migrate old prefix tags**

- Given a feature file with `@libar-process-*` tags
- When running migrate-tags --file path/to/file.feature
- Then all `@libar-process-pattern:` become `@libar-docs-pattern:`
- And all `@libar-process-status:` become `@libar-docs-status:`
- And all `@libar-process-adr:` become `@libar-docs-adr:`
- And file is updated in place

**Dry run shows changes without modifying**

- Given a feature file with non-standard tags
- When running migrate-tags --dry-run --file path/to/file.feature
- Then changes are displayed
- And file is NOT modified

**Batch migration of directory**

- Given delivery-process/decisions/ contains 4 PDR files
- When running migrate-tags --dir delivery-process/decisions/
- Then all files are updated to use `@libar-docs-*` prefix
- And summary shows "Migrated 4 files"

**Scanner extracts from old prefix tags**

- Given a feature file with `@libar-process-adr:001`
- When the scanner parses the file
- Then ADR number 001 is extracted
- And deprecation warning is logged

**Scanner extracts from new prefix tags**

- Given a feature file with `@libar-docs-adr:001`
- When the scanner parses the file
- Then ADR number 001 is extracted
- And no deprecation warning is logged

**BDD tags are not flagged for migration**

- Given a feature file with `@acceptance-criteria` tag on a scenario
- When running the pattern linter
- Then no warning is emitted for `@acceptance-criteria`

**Generator processes short-form tags**

- Given a feature file with `@pattern:MyPattern` (short-form)
- When generating documentation
- Then pattern is included in output
- And deprecation warning is logged

**Generator processes old prefix tags**

- Given a feature file with `@libar-process-pattern:MyPattern`
- When generating documentation
- Then pattern is included in output
- And deprecation warning is logged

**Generator processes new unified prefix tags**

- Given a feature file with `@libar-docs-pattern:MyPattern`
- When generating documentation
- Then pattern is included in output
- And no deprecation warning is logged

**Override taxonomy via CLI flag**

- Given a repo with `delivery-process/tag-registry.json` (DDD categories)
- And a package with `deps/libar-dev-packages/packages/tooling/delivery-process/tag-registry.json` (tooling categories)
- When running docs generation with `--taxonomy-override delivery-process/tag-registry.json`
- Then the repo taxonomy is used instead of package taxonomy
- And generated docs show DDD categories

**Default taxonomy uses package categories**

- Given no --taxonomy-override flag is provided
- When running docs generation from the package
- Then the package's built-in taxonomy is used
- And generated docs show tooling categories (scanner, extractor, etc.)

**Validate taxonomy compatibility**

- Given a custom taxonomy file
- When loading the taxonomy
- Then it must have the same schema as the package taxonomy
- And missing required fields cause validation errors

## Business Rules

**Short-form tags trigger deprecation warnings**

_Verified by: Short-form pattern tag triggers warning, Old prefix tags trigger deprecation warning, New unified prefix passes without warning_

**Migration script converts all tag formats to unified prefix**

_Verified by: Migrate short-form tags, Migrate old prefix tags, Dry run shows changes without modifying, Batch migration of directory_

**Scanner accepts both prefixes during transition**

_Verified by: Scanner extracts from old prefix tags, Scanner extracts from new prefix tags_

**BDD standard tags remain unprefixed**

_Verified by: BDD tags are not flagged for migration_

**Generators produce documentation regardless of tag format**

_Verified by: Generator processes short-form tags, Generator processes old prefix tags, Generator processes new unified prefix tags_

**Taxonomy can be overridden for configured process instances**

_Verified by: Override taxonomy via CLI flag, Default taxonomy uses package categories, Validate taxonomy compatibility_

## Deliverables

- Pattern linter for TypeScript (Complete)
- Migration script (CLI) (Complete)
- Repo-wide tag migration (Complete)
- Scanner dual-prefix support (Pending)
- Package internal @libar-docs-\* support (Pending)
- Deprecation warning in generators (Pending)
- Taxonomy override CLI option (Pending)

---

[← Back to Product Requirements](../PRODUCT-REQUIREMENTS.md)
