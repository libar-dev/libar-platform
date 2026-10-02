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

Use Node 24 and run `npm ci` in the repository root. The repository has one `package.json`.

The code runs as two compositions, two Convex apps assembled from the shared libraries under `src/`. The Convex CLI reads `convex.json` and `package.json` from its working directory, so each composition is a name, a project directory and a functions directory:

- The fixture composition exists only to prove scenarios. Its project directory is the repository root, whose `convex.json` names `fixture/convex/` as its functions directory. It holds the fixture contexts, the fixture functions and every fault a test injects.
- The production composition is the example application with no test-only function. Its project directory is `example/`, whose `convex.json` names `convex/`, so its functions are in `example/convex/`. Its contexts are the components `example/convex/orders/` and `example/convex/inventory/`, and its deciders are in `example/domain/`. `example/package.json` is a symbolic link to the root's, so the repository still has one `package.json`. Lint fails any module under `example/` that imports from `fixture/`, `harness/` or `tests/`.

Each tier has its own command and its own directory:

- Domain tier: `npm run test:pure` runs `tests/pure`. These tests need no backend and no simulator. They test the kernel, the fixture domain and the pure parts of the harness.
- Simulator tier: `npm run test:simulator` runs `tests/simulator` on `convex-test`. Every test name starts with `convex-test` and the version it ran on. A simulator pass is not native proof. A test registers the composition it runs: `tests/simulator/production.ts` registers the production composition with its two contexts, and the fixture tests register the fixture composition's components themselves.
- Native tier: `npm run test:native` runs `tests/native`. Every test owns its processes and temporary storage, stops its processes and removes its storage when it ends. A test chooses its composition by the function that starts its backend: `fixtureBackend()` deploys the fixture composition and `productionBackend()` deploys the production composition. Each backend's facts in the run's record name the composition it deployed.
- Compile check: `npm run typecheck` compiles both compositions, the harness and the tests. `npm run test:types` runs the type tests in `tests/types`. A compile check says nothing about a running backend.

The claim tiers in `AGENTS.md` map to these names: compiled means compile check, pure test means domain tier, `convex-test` means simulator tier, and native backend means native tier.

`npm test` runs the type tests, the domain tier and the simulator tier. None of them needs a backend. `npm run lint` and `npm run format:check` cover `fixture/` and `example/` alike.

`npm run test:all` runs every project in one run, the native tier included, and its record holds every test of every project, each under the project that ran it. `npm run acceptance` then answers whether the first experiment passed: it derives the graph, takes the rows `acceptanceRows` of `spec:application.first-experiment` names, makes one required scenario per example of each row, and reads them against the newest record under `evidence/runs/`, or against the record `npm run acceptance -- <path>` names. It prints one line per required scenario with its status, `passed`, `failed`, `absent` or `missing`, and a last line `acceptance: passed` or `acceptance: not passed`. It exits 0 when every scenario passed in a passed run on a clean tree; 1 when a scenario failed or is absent, the run did not pass or the tree was not clean; 3 when nothing of that holds and a scenario has no example or no verifier; and 2 when it cannot answer. CI runs both and fails on 1 and 2. `spec:platform.acceptance-contract` holds the rules.

The native tier downloads the pinned backend release into `.cache/` on first use and checks the hash of the executable on every run. `harness/backend-release.json` pins the release for macOS on Apple silicon and for Linux on x86-64. On another platform, or to run another build, set `CONVEX_BACKEND_BINARY` to a `convex-local-backend` executable. The run's record then names the release only when the executable's hash is the pinned one.

The harness runs every Convex CLI call in the project directory of the composition it acts on, and gives the call the address and the admin key of the backend it started, and an environment of its own. A deploy key or a deployment named in your shell or in a `.env` file is never used.

`npm run codegen` rewrites the generated files of both compositions: every `_generated` directory under `fixture/convex` and under `example/convex`. For each composition it starts a disposable backend, runs codegen in the composition's project directory and removes the backend. `npm run codegen -- production` or `npm run codegen -- fixture` rewrites one. Run it after you add or rename a function or change its arguments, and commit the result. CI fails when a committed generated file differs from what codegen writes, or when codegen writes one that is not committed.

`npm run dev` starts one disposable backend and runs `convex dev` against it for the fixture composition; `npm run dev -- production` does the same for the production composition. Each time you save a file of that composition, it rewrites the composition's `_generated` directories. It runs until you press Ctrl-C, then stops the backend and removes it. Commit the generated files as with `npm run codegen`: CI still fails when they are stale. It refuses to start when a `.env.local` file exists in the composition's project directory, the repository root or `example/`, because `convex dev` would write the backend's URL into it.

Every native run writes a record to `evidence/runs/`. [`evidence/README.md`](evidence/README.md) says what a record holds and where the record of a push is kept.

The native measurement files are [the cost cells](tests/native/place-order-measurement.test.ts), [the contention matrix](tests/native/place-order-contention.test.ts) and [the timing cells](tests/native/place-order-timing.test.ts). [The timing command](scripts/measure-place-order.mjs), `npm run measure:place-order`, writes records and prints speed comparisons marked as taken under load. On a quiet machine use `npm run measure:place-order -- --quiet`. The timing cells are skipped by ordinary native test runs.
