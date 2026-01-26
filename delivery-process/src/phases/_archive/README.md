# Archived Phase Files

This directory contains deprecated TypeScript phase files.

## Why Deprecated?

Per [PDR-002 - Release Management Architecture](../../../decisions/pdr-002-release-management-architecture.feature):

1. **Too verbose**: ~50 lines with embedded markdown documentation
2. **Redundant**: Release info now lives in minimal `.feature` files
3. **Tight coupling**: Assumed 1:1 mapping between phases and releases

## New Approach

- **Release definitions**: `delivery-process/releases/*.feature` (minimal Gherkin)
- **Deliverable association**: `@libar-docs-release:v0.1.0` tag on each deliverable
- **vNEXT pattern**: `@libar-docs-release:vNEXT` for unreleased work

## Migration

When migrating from TypeScript phase files:

1. Create release `.feature` file in `delivery-process/releases/`
2. Tag deliverables with `@libar-docs-release:<version>`
3. Move TypeScript phase file to this `_archive/` directory

---

Archived: 2026-01-09
