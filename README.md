# libar-platform

A transactional domain platform for Convex. Bounded contexts own their state and their journal, one business operation is one mutation, and work leaves the transaction only when something has to wait, spread load or reach an external system.

This repository holds the design and, from the first build slice on, the code built from it. There is no code yet.

## Where to start

- [`docs/convex-transactional-domain-platform-decisions.md`](docs/convex-transactional-domain-platform-decisions.md) says what the platform is: nineteen decisions, twelve laws, the Convex facts they rest on, seven probes and forty-three acceptance scenarios. Every decision is a proposal until the owner rules on it.
- [`design/README.md`](design/README.md) is the index of the design, written as a [Software Delivery Protocol](https://github.com/libar-dev/software-delivery-protocol) corpus of Specs under `design/specs/`.
- [`design/STATE.md`](design/STATE.md) says where the work stands and what comes next. [`design/SESSIONS.md`](design/SESSIONS.md) says how a working session runs.

## Reading the design

```sh
npm ci
npx sdp view
open generated/design-review/index.md
```

`python3 design/tools/check.py` validates the corpus and checks that the Specs, the index and the review ledger agree.

## Status

The design has been through three review rounds and carries open findings, all listed in `design/reviews/consensus-ledger.json`. It is being finished by building it, one slice at a time, starting with the repository layout and the probes.

## Running the code

Use Node 24 and run `npm ci` in the repository root. Each tier has its own command:

- Compiled: `npm run typecheck` and `npm run test:types`.
- Pure: `npm run test:pure`.
- Simulator: `npm run test:simulator`, using `convex-test`.
- Native backend: `npm run test:native`, with a disposable backend per test.

`npm test` runs the three tiers that need no backend. `npm run codegen` starts a disposable backend, deploys the fixture app, regenerates both Convex API directories and stops the backend. Native commands download the pinned backend into `.cache/`, or use the binary named by `CONVEX_BACKEND_BINARY`. The Linux asset hash must be filled in `harness/backend-release.json` before its first download. Native runs write evidence under `evidence/runs/`.
