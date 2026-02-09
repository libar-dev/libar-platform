# ✅ Repo Level Docs Generation

**Purpose:** Detailed documentation for the Repo Level Docs Generation pattern

---

## Overview

| Property | Value                |
| -------- | -------------------- |
| Status   | completed            |
| Category | Process Enhancements |
| Phase    | 100                  |
| Quarter  | Q1-2026              |

## Description

As a monorepo maintainer, I want unified documentation generation from multiple sources.

So that specs, platform packages, and example app produce coherent documentation.

The PoC validated multi-source generation with combined Gherkin feature sources
and established tag conventions for PRD extraction, roadmap planning, and timeline
metadata. See session learnings documented in the Gherkin comments below.

## Dependencies

- Depends on: ProcessMetadataExpansion

## Acceptance Criteria

**Generate PRD from specs**

- Given feature files in delivery-process/specs/ with PRD tags
- When running pnpm docs:prd
- Then PRODUCT-REQUIREMENTS.md is generated in docs-living/
- And features are grouped by product area
- And acceptance criteria are extracted from @acceptance-criteria scenarios

**Generate remaining work summary**

- Given feature files with deliverables in Background section
- When running pnpm docs:prd:remaining
- Then REMAINING-WORK.md shows statistics, incomplete items, next actionable phases

**Generate implementation plans**

- Given feature files with acceptance criteria and deliverables
- When running pnpm docs:prd:plan
- Then SESSION-PLAN.md shows structured implementation guidance
- And each planned phase has pre-planning checklist
- And deliverables are listed with locations

**All generation scripts complete successfully**

- Given properly tagged spec files
- When running pnpm docs:prd:all
- Then all generators complete without errors
- And generated files are formatted with prettier

---

[← Back to Pattern Registry](../PATTERNS.md)
