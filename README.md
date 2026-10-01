# libar-platform

A transactional domain platform for Convex. Bounded contexts own their state and their journal, one business operation is one mutation, and work leaves the transaction only when something has to wait, spread load or reach an external system.

This repository holds the design and, from the first build slice on, the code built from it. The first slice built the test harness, the fixture app and the probes.

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

Use Node 24 and run `npm ci` in the repository root. The repository has one `package.json`. The root `convex.json` names `fixture/convex` as the function directory of the fixture app.

Each tier has its own command and its own directory:

- Domain tier: `npm run test:pure` runs `tests/pure`. These tests need no backend and no simulator. Until slice S1 adds a domain, they test the pure parts of the harness.
- Simulator tier: `npm run test:simulator` runs `tests/simulator` on `convex-test`. Every test name starts with `convex-test` and the version it ran on. A simulator pass is not native proof.
- Native tier: `npm run test:native` runs `tests/native`. Every test owns its processes and temporary storage, stops its processes and removes its storage when it ends. Bound examples deploy the fixture app.
- Compile check: `npm run typecheck` compiles the fixture app, the harness and the tests. `npm run test:types` runs the type tests in `tests/types`. A compile check says nothing about a running backend.

The claim tiers in `AGENTS.md` map to these names: compiled means compile check, pure test means domain tier, `convex-test` means simulator tier, and native backend means native tier.

`npm test` runs the type tests, the domain tier and the simulator tier. None of them needs a backend.

The native tier downloads the pinned backend release into `.cache/` on first use and checks the hash of the executable on every run. `harness/backend-release.json` pins the release for macOS on Apple silicon and for Linux on x86-64. On another platform, or to run another build, set `CONVEX_BACKEND_BINARY` to a `convex-local-backend` executable. The run's record then names the release only when the executable's hash is the pinned one.

The harness gives every Convex CLI call the address and the admin key of the backend it started, and an environment of its own. A deploy key or a deployment named in your shell or in a `.env` file is never used.

`npm run codegen` starts a disposable backend and rewrites `fixture/convex/_generated` and `fixture/convex/annex/_generated`. Run it after you add or rename a fixture function or change its arguments, and commit the result. CI fails when the committed files differ from what codegen writes.

Every native run writes a record to `evidence/runs/`. [`evidence/README.md`](evidence/README.md) says what a record holds and which records are kept.
