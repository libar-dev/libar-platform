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
npx sdp view design
open design/generated/design-review/index.md
```

`python3 design/tools/check.py` validates the corpus and checks that the Specs, the index and the review ledger agree.

## Status

The design has been through three review rounds and carries open findings, all listed in `design/reviews/consensus-ledger.json`. It is being finished by building it, one slice at a time, starting with the repository layout and the probes.
