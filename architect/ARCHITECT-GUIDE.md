# Architect Guide

> Repo-specific setup for `@libar-dev/architect`.
> For workflow details and package internals, use the upstream architect docs linked below.

---

## Package Documentation

The monorepo installs `@libar-dev/architect` from the npm registry and keeps
`deps-packages/architect/` as a read-only subtree for source exploration.

| Topic             | Upstream Doc                                                                                     |
| ----------------- | ------------------------------------------------------------------------------------------------ |
| Core methodology  | [METHODOLOGY.md](https://github.com/libar-dev/architect/blob/main/docs/METHODOLOGY.md)           |
| Session workflows | [SESSION-GUIDES.md](https://github.com/libar-dev/architect/blob/main/docs/SESSION-GUIDES.md)     |
| Gherkin authoring | [GHERKIN-PATTERNS.md](https://github.com/libar-dev/architect/blob/main/docs/GHERKIN-PATTERNS.md) |
| Process guard     | [PROCESS-GUARD.md](https://github.com/libar-dev/architect/blob/main/docs/PROCESS-GUARD.md)       |
| Validation tools  | [VALIDATION.md](https://github.com/libar-dev/architect/blob/main/docs/VALIDATION.md)             |
| Configuration     | [CONFIGURATION.md](https://github.com/libar-dev/architect/blob/main/docs/CONFIGURATION.md)       |
| Process API       | [PROCESS-API.md](https://github.com/libar-dev/architect/blob/main/docs/PROCESS-API.md)           |
| Annotation guide  | [ANNOTATION-GUIDE.md](https://github.com/libar-dev/architect/blob/main/docs/ANNOTATION-GUIDE.md) |
| Architecture      | [ARCHITECTURE.md](https://github.com/libar-dev/architect/blob/main/docs/ARCHITECTURE.md)         |
| MCP setup         | [MCP-SETUP.md](https://github.com/libar-dev/architect/blob/main/docs/MCP-SETUP.md)               |

Local generated references:

- `libar-platform/architect/docs/tag-taxonomy.md`
- `libar-platform/docs-living/reference/`
- `CLAUDE.md` via `pnpm claude:build`

---

## Repo Configuration

The repo root config is [`architect.config.js`](../../architect.config.js):

```javascript
import { defineConfig } from "@libar-dev/architect/config";

export default defineConfig({
  preset: "ddd-es-cqrs",
});
```

This repo uses the `ddd-es-cqrs` preset:

- Tag prefix: `@architect-*`
- Opt-in marker: `@architect`
- Categories: 21 DDD/ES/CQRS tags
- Local docs output: `libar-platform/docs-living/`

Reference-doc overrides in `architect.config.js` also define this repo's scoped
architecture outputs, including the component-topology reference doc.

---

## Directory Map

| Purpose                      | Location                                        |
| ---------------------------- | ----------------------------------------------- |
| Roadmap specs                | `libar-platform/architect/specs/`               |
| Platform specs               | `libar-platform/architect/specs/platform/`      |
| Example-app specs            | `libar-platform/architect/specs/example-app/`   |
| Decision records             | `libar-platform/architect/decisions/`           |
| Release definitions          | `libar-platform/architect/releases/`            |
| Design stubs                 | `libar-platform/architect/stubs/`               |
| Generated taxonomy reference | `libar-platform/architect/docs/tag-taxonomy.md` |
| Generated living docs        | `libar-platform/docs-living/`                   |
| Source-exploration subtree   | `deps-packages/architect/`                      |

The subtree is read-only in this repo. Treat it as package source and documentation
reference, not as an editable dependency.

---

## Common Commands

### CLI

| Command                                                          | Purpose                          |
| ---------------------------------------------------------------- | -------------------------------- |
| `pnpm exec architect -- overview`                                | Project health and active work   |
| `pnpm architect -- overview`                                     | Repo wrapper around the same API |
| `pnpm exec architect -- context <pattern> --session <type>`      | Curated session context          |
| `pnpm exec architect -- scope-validate <pattern> <session-type>` | FSM and prerequisite pre-flight  |

### Generation

| Command                                          | Purpose                                 |
| ------------------------------------------------ | --------------------------------------- |
| `pnpm docs:all`                                  | Regenerate the main living docs set     |
| `pnpm docs:tag-taxonomy`                         | Regenerate the local taxonomy reference |
| `pnpm exec architect-generate -g reference-docs` | Regenerate reference docs from config   |
| `pnpm exec architect-generate -g patterns`       | Regenerate pattern registry outputs     |

### Validation

| Command                              | Purpose                       |
| ------------------------------------ | ----------------------------- |
| `pnpm exec architect-guard --staged` | Pre-commit FSM guard          |
| `pnpm exec architect-guard --all`    | Full-repo FSM validation      |
| `pnpm exec architect-lint-patterns`  | Annotation and authoring lint |
| `pnpm exec architect-validate`       | Full validation pipeline      |

### Claude Modules

| Command                | Purpose                                |
| ---------------------- | -------------------------------------- |
| `pnpm claude:build`    | Rebuild `CLAUDE.md` from `_claude-md/` |
| `pnpm claude:validate` | Validate modular source files          |
| `pnpm claude:preview`  | Preview output without writing         |

---

## Session Output Paths

| Session Type   | Output Location                                                                            |
| -------------- | ------------------------------------------------------------------------------------------ |
| Planning       | `libar-platform/architect/specs/{product-area}/`                                           |
| Design         | `libar-platform/architect/decisions/` and `libar-platform/architect/stubs/{pattern-name}/` |
| Implementation | Runtime packages, tests, and docs under `libar-platform/`                                  |

For interactive sessions, prefer the architect CLI and `pnpm architect` over
manually reading generated markdown.

---

## Taxonomy Source of Truth

The repo's generated reference is:

- `libar-platform/architect/docs/tag-taxonomy.md`

The package source of truth is:

- `deps-packages/architect/src/taxonomy/registry-builder.ts`
- `deps-packages/architect/src/taxonomy/status-values.ts`
- `deps-packages/architect/src/taxonomy/categories.ts`
- `deps-packages/architect/src/taxonomy/format-types.ts`

Regenerate the local reference after config or upstream taxonomy changes:

```bash
pnpm docs:tag-taxonomy
```

---

## Quick Links

| Task                       | Reference                                                                                        |
| -------------------------- | ------------------------------------------------------------------------------------------------ |
| Understand the methodology | [METHODOLOGY.md](https://github.com/libar-dev/architect/blob/main/docs/METHODOLOGY.md)           |
| Choose a session workflow  | [SESSION-GUIDES.md](https://github.com/libar-dev/architect/blob/main/docs/SESSION-GUIDES.md)     |
| Write feature files        | [GHERKIN-PATTERNS.md](https://github.com/libar-dev/architect/blob/main/docs/GHERKIN-PATTERNS.md) |
| Review tags and formats    | [ANNOTATION-GUIDE.md](https://github.com/libar-dev/architect/blob/main/docs/ANNOTATION-GUIDE.md) |
| Understand the guard       | [PROCESS-GUARD.md](https://github.com/libar-dev/architect/blob/main/docs/PROCESS-GUARD.md)       |
| Review local taxonomy      | [docs/tag-taxonomy.md](docs/tag-taxonomy.md)                                                     |
| View current roadmap       | [ROADMAP.md](../docs-living/ROADMAP.md)                                                          |
| View pattern registry      | [PATTERNS.md](../docs-living/PATTERNS.md)                                                        |
