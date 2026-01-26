# Delivery Process Guide

> Repo-specific configuration for `@libar-dev/delivery-process`.
> For methodology and detailed workflows, see [Package Documentation](#package-documentation).

---

## Package Documentation

The `@libar-dev/delivery-process` package provides comprehensive documentation for the delivery process methodology. This repo-specific guide provides configuration details; refer to package docs for concepts and workflows.

| Topic                 | Package Doc                                                                                                  |
| --------------------- | ------------------------------------------------------------------------------------------------------------ |
| Core Methodology      | [METHODOLOGY.md](../deps/libar-dev-packages/packages/tooling/delivery-process/docs/METHODOLOGY.md)           |
| Session Workflows     | [SESSION-GUIDES.md](../deps/libar-dev-packages/packages/tooling/delivery-process/docs/SESSION-GUIDES.md)     |
| Gherkin Patterns      | [GHERKIN-PATTERNS.md](../deps/libar-dev-packages/packages/tooling/delivery-process/docs/GHERKIN-PATTERNS.md) |
| Process Guard (FSM)   | [PROCESS-GUARD.md](../deps/libar-dev-packages/packages/tooling/delivery-process/docs/PROCESS-GUARD.md)       |
| Validation & Linting  | [VALIDATION.md](../deps/libar-dev-packages/packages/tooling/delivery-process/docs/VALIDATION.md)             |
| Tag Taxonomy          | [TAXONOMY.md](../deps/libar-dev-packages/packages/tooling/delivery-process/docs/TAXONOMY.md)                 |
| Configuration         | [CONFIGURATION.md](../deps/libar-dev-packages/packages/tooling/delivery-process/docs/CONFIGURATION.md)       |
| Pipeline Architecture | [ARCHITECTURE.md](../deps/libar-dev-packages/packages/tooling/delivery-process/docs/ARCHITECTURE.md)         |
| Tag Reference         | [INSTRUCTIONS.md](../deps/libar-dev-packages/packages/tooling/delivery-process/INSTRUCTIONS.md)              |

---

## Repo Configuration

### Tag Prefix

This repo uses `@libar-docs-*` tags (DDD_ES_CQRS_PRESET).

| Placeholder in Package Docs | This Repo                |
| --------------------------- | ------------------------ |
| `@<prefix>-pattern`         | `@libar-docs-pattern`    |
| `@<prefix>-status`          | `@libar-docs-status`     |
| `@<prefix>-phase`           | `@libar-docs-phase`      |
| `@<prefix>-depends-on`      | `@libar-docs-depends-on` |

### Directory Mapping

| Placeholder in Package Docs | This Repo                           |
| --------------------------- | ----------------------------------- |
| `{specs-directory}/`        | `delivery-process/specs/`           |
| `{packages-directory}/`     | `deps/libar-dev-packages/packages/` |
| `{plans-directory}/`        | `docs/project-management/plans/`    |
| `{decisions-directory}/`    | `delivery-process/decisions/`       |

### Tag Taxonomy Source

All valid `@libar-docs-*` tags are defined in TypeScript:

```
deps/libar-dev-packages/packages/tooling/delivery-process/src/taxonomy/
├── registry-builder.ts  # buildRegistry()
├── status-values.ts     # FSM states (roadmap, active, completed, deferred)
├── categories.ts        # 21 domain categories
└── format-types.ts      # value, enum, csv, flag, etc.
```

---

## Product Areas

| Area             | Location                                       | Description              |
| ---------------- | ---------------------------------------------- | ------------------------ |
| Platform         | `deps/libar-dev-packages/packages/platform/`   | ES infrastructure        |
| Delivery Process | `@libar-dev/delivery-process` (git dependency) | USDP tooling             |
| Example App      | `order-management/`                            | Reference implementation |

### Platform Packages

All platform packages are tracked together as "Platform":

| Package                       | Purpose                                  |
| ----------------------------- | ---------------------------------------- |
| `@libar-dev/platform-core`    | Core utilities, event bus, DI            |
| `@libar-dev/platform-bc`      | Bounded context component infrastructure |
| `@libar-dev/platform-bus`     | Command/Event bus infrastructure         |
| `@libar-dev/platform-decider` | Pure decider pattern implementation      |
| `@libar-dev/platform-fsm`     | Finite state machine utilities           |
| `@libar-dev/platform-store`   | Event store abstractions                 |

---

## Release Strategy

| Version    | Purpose                                               | Status    |
| ---------- | ----------------------------------------------------- | --------- |
| **v0.1.0** | Delivery process foundation (FSM, Process Guard, API) | active    |
| **v0.2.0** | Platform roadmap (aggregate-less pivot, Phases 14-22) | active    |
| **v0.3.0** | TypeScript taxonomy migration (PDR-006)               | completed |
| **v1.x**   | Port initial roadmap milestones                       | roadmap   |

### v0.2.0 Platform Roadmap (Phases 14-22)

| Phase | Pattern                              |
| ----- | ------------------------------------ |
| 14    | Decider Pattern                      |
| 15    | Projection Categories                |
| 16    | Dynamic Consistency Boundaries (DCB) |
| 17    | Reactive Projections                 |
| 18    | Production Hardening                 |
| 19    | BDD Testing Infrastructure           |
| 20    | ECST/Fat Events, Reservation Pattern |
| 21    | Integration Patterns                 |
| 22    | Agent as Bounded Context             |

---

## Key Locations

| What             | Where                                                          |
| ---------------- | -------------------------------------------------------------- |
| Process specs    | `delivery-process/specs/`                                      |
| Platform specs   | `delivery-process/specs/platform/`                             |
| PDRs (decisions) | `delivery-process/decisions/`                                  |
| Releases         | `delivery-process/releases/`                                   |
| Templates        | `delivery-process/templates/`                                  |
| Generated docs   | `docs-living/` (never edit)                                    |
| Pattern briefs   | `docs/project-management/aggregate-less-pivot/pattern-briefs/` |

### Generated Documentation Structure

```
docs-living/
├── CHANGELOG-GENERATED.md    # Release changelog
├── CURRENT-WORK.md           # Active patterns summary
├── DECISIONS.md              # PDRs/ADRs index
├── PATTERNS.md               # Pattern registry
├── PRODUCT-REQUIREMENTS.md   # All patterns index
├── REMAINING-WORK.md         # Incomplete work summary
├── ROADMAP.md                # Phase progress overview
├── current/                  # Per-phase active work
├── decisions/                # Individual ADR/PDR files
├── phases/                   # Per-phase roadmap details
├── patterns/                 # Per-category pattern details
├── remaining/                # Per-phase incomplete work
├── requirements/             # Per-pattern requirement docs
├── timeline/                 # Historical milestones
└── working/                  # PR-scoped changes
```

---

## Commands Reference

### Documentation Generation

| Command                   | Output                   | Description               |
| ------------------------- | ------------------------ | ------------------------- |
| `pnpm docs:all`           | All doc types            | Full regeneration         |
| `pnpm docs:patterns`      | `PATTERNS.md`            | Pattern registry          |
| `pnpm docs:prd:roadmap`   | `ROADMAP.md`             | Phase progress            |
| `pnpm docs:prd:remaining` | `REMAINING-WORK.md`      | Incomplete work           |
| `pnpm docs:prd:current`   | `CURRENT-WORK.md`        | Active work               |
| `pnpm docs:pdrs`          | `DECISIONS.md`           | PDR documentation         |
| `pnpm docs:changelog`     | `CHANGELOG-GENERATED.md` | Release changelog         |
| `pnpm docs:pr-changes`    | `working/PR-CHANGES.md`  | PR-scoped changes vs main |

### Validation

| Command                      | Purpose               |
| ---------------------------- | --------------------- |
| `pnpm lint-process --staged` | Pre-commit validation |
| `pnpm lint-process --all`    | Full FSM validation   |

### CLAUDE.md Management

| Command                | Purpose                 |
| ---------------------- | ----------------------- |
| `pnpm claude:validate` | Validate modules        |
| `pnpm claude:build`    | Build all variations    |
| `pnpm claude:preview`  | Preview without writing |

---

## Session Output Paths

| Session Type   | Output Location                                      |
| -------------- | ---------------------------------------------------- |
| Planning       | `delivery-process/specs/{product-area}/`             |
| Design         | `docs/project-management/plans/designs/`             |
| Implementation | Package source + tests in `deps/libar-dev-packages/` |

---

## ProcessStateAPI

For Claude Code sessions, use ProcessStateAPI instead of reading generated documentation:

```typescript
import {
  generators,
  api as apiModule,
  createDefaultTagRegistry,
} from "@libar-dev/delivery-process";

// Build dataset from extracted patterns
const tagRegistry = createDefaultTagRegistry();
const dataset = generators.transformToMasterDataset({
  patterns: extractedPatterns, // From scanPatterns + extractPatterns
  tagRegistry,
});
const api = apiModule.createProcessStateAPI(dataset);

// Common queries
api.getCurrentWork(); // Active patterns
api.getRoadmapItems(); // Available to start
api.getPatternsByPhase(19); // All Phase 19 patterns
api.isValidTransition("roadmap", "active"); // Can we start?
api.getPattern("BddTestingInfrastructure"); // Full pattern details
api.getPhaseProgress(19); // Phase completion metrics
```

See [METHODOLOGY.md#processstateapi](../deps/libar-dev-packages/packages/tooling/delivery-process/docs/METHODOLOGY.md#processstateapi-for-ai-sessions) for the complete API reference.

---

## Quick Links

| Task                       | Reference                                                                                                    |
| -------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Understand the methodology | [METHODOLOGY.md](../deps/libar-dev-packages/packages/tooling/delivery-process/docs/METHODOLOGY.md)           |
| Choose a session type      | [SESSION-GUIDES.md](../deps/libar-dev-packages/packages/tooling/delivery-process/docs/SESSION-GUIDES.md)     |
| Write Gherkin specs        | [GHERKIN-PATTERNS.md](../deps/libar-dev-packages/packages/tooling/delivery-process/docs/GHERKIN-PATTERNS.md) |
| Understand FSM states      | [PROCESS-GUARD.md](../deps/libar-dev-packages/packages/tooling/delivery-process/docs/PROCESS-GUARD.md)       |
| Check valid tags           | [INSTRUCTIONS.md](../deps/libar-dev-packages/packages/tooling/delivery-process/INSTRUCTIONS.md)              |
| View current roadmap       | [ROADMAP.md](../docs-living/ROADMAP.md)                                                                      |
| View pattern registry      | [PATTERNS.md](../docs-living/PATTERNS.md)                                                                    |
