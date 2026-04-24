# libar-platform

This directory contains the platform workspaces that power the Convex event sourcing stack.

## Layout

- `packages/` contains the reusable platform packages.
- `examples/order-management/` contains the reference bounded contexts and app wiring.
- `apps/frontend/` contains the frontend, stories, and browser tests.
- `architect/` contains roadmap specs, decisions, generators, and validation inputs.
- `docs-living/` contains generated projections of the architect sources.

## Working rules

- Edit source specs, annotations, and package code.
- Do not hand-edit `docs-living/`.
- Use `pnpm docs:all` after docs or annotation changes.
- Use `pnpm test:coverage` for the package-level coverage gate.

## Key commands

| Command | Purpose |
| --- | --- |
| `pnpm test:packages` | Run the six platform package suites |
| `pnpm test:integration:platform` | Run isolated infrastructure integration tests |
| `pnpm test:coverage` | Enforce measured coverage floors across platform packages |
| `pnpm docs:all` | Refresh generated platform docs |

## Read next

- `packages/platform-*/README.md` for package-specific usage
- `examples/order-management/README.md` for the reference application
- `../docs/README.md` for the hand-written docs index
