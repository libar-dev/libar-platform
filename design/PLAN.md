# Design plan: the Convex transactional domain platform as an SDP corpus

Lead architect's plan, 2026-09-30. Authoring agents execute it; the orchestrator owns this file. Nobody but the orchestrator edits it.

Two inputs. The decisions document at `../docs/convex-transactional-domain-platform-decisions.md` (below: "the doc") says what the platform is. The Libar Software Delivery Protocol (below: "SDP"), installed at the version the repository's `package.json` pins, says how the design is written down. The doc wins on content, SDP wins on form, this plan wins on IDs, layout and conventions. Where the plan had to rule on something neither input rules on, section 11 lists it for the owner.

## 0. Validate and tooling

The CLI is the `sdp` binary of the pinned `@libar-dev/software-delivery-protocol` package. Run `npm ci` once at the repository root, then call it as `npx sdp`. A bare `sdp` on macOS resolves to an unrelated Xcode tool. The package also ships the recipe catalog, three agent skills and the Protocol's own Specs; `npx sdp --help` lists their paths.

```sh
# from the repository root
npx sdp validate
```

The Protocol's root is the repository root since slice S0, so that one graph holds the Specs under `design/specs/` and the test anchors that verify them, which live outside `design/`. No `--exclude` is needed. Output goes to `generated/` at the repository root (graph, contracts, registrar manifest), which `.gitignore` ignores. A test imports its example's step contract from `generated/contracts/`, so `npx sdp build` runs before the tests.

Other verbs, same path and root rules:

- `npx sdp validate --watch` is the authoring loop; it re-runs on carrier changes and stays alive.
- `npx sdp view` writes the Design Review to `generated/design-review/` (an index plus one page per Spec and Pack). This is the human-readable rendering of the corpus.
- `npx sdp q '<body>' --json` evaluates a recipe body from the package's `docs/agent-surface/recipes.md` against this corpus. Recipes 3 (one Spec's guarantees), 5 (Pack review), 6 (concept search), 7 (readiness divergence), 8 (orphans and gaps), 9 (promotion preflight) and 11 (the lower ladder) are the useful ones on paper. With code in the tree these join them: 2 (the drift alarm, which lists what is built and does not state `ready`), 4 (what a changed file reaches), 10 (declared against enabled verifiers), 20 (the open-question register), 21 (what a Spec rests on, with each target's rung and floor), 22 (the mention audit) and 23 (entry search by name).
- `npx sdp q '<body>' --root node_modules/@libar-dev/software-delivery-protocol/specs --json` asks the same questions of the Protocol's own Specs, which the authoring skill cites.
- `npx sdp new spec design/specs/<family>/<name>.sdp.md --id ID --kind KIND --altitude ALT --title TITLE --outcome OUTCOME` scaffolds an idea-rung stub. PATH is relative to the current directory, so from the repository root it starts with `design/specs/`.

Exit code 1 means an error; warnings exit 0. The corpus must exit 0 with zero errors and zero warnings.

## 1. Reading the inputs: the numbering key

The doc numbers its decisions (1 to 19), laws (1 to 12), sources (S1 to S15) and probes (1 to 7). It does not number its fact ledger, its acceptance scenarios or its open questions. The plan numbers them in table order so that every citation is one token. These numbers are plan-imposed; section 11 asks the owner to adopt them.

| Token | Meaning | Source in the doc |
|---|---|---|
| `D1` to `D19` | decision | "Core decisions" and "Durable and later layers" |
| `Law 1` to `Law 12` | law | "Laws" |
| `F1` to `F17` | fact-ledger row, in table order | "Fact ledger" |
| `Probe 1` to `Probe 7` | probe, in list order | "Fact ledger", probes list |
| `S1` to `S15` | source | "Sources" |
| `Sc L0-1`, `Sc L1-1` ... `Sc L6-4`, `Sc ALL-1` | acceptance scenario, numbered by layer then table order | "Acceptance scenarios" (section 4 below lists every row) |
| `OQ1` to `OQ6` | open question, in bullet order | "Open questions" |
| `E-1` ... | design extension beyond the doc | section 10 below |
| `Vocab: term` | a term of the doc's vocabulary | "Vocabulary" |

The seventeen facts, for reference (status as the doc states it; section 9 records what was rechecked on 2026-09-30):

| Token | Fact | Status | Decisions |
|---|---|---|---|
| F1 | Mutations are serializable under optimistic concurrency | documented S1 | 1, 9 |
| F2 | Component calls commit or roll back with the calling mutation | documented S2 | 1, 2 |
| F3 | `ctx.runMutation` inside a mutation gives partial rollback; the parent can catch and continue | documented S10 | 7, 13 |
| F4 | `ctx.runQuery` and `ctx.runMutation` inside a mutation cost more than a helper call | documented S10; size unknown | 2, 7 |
| F5 | The React client retries mutations until confirmed; the backend executes each call once | documented S14 | 6 |
| F6 | React and Rust clients run one client's mutations one at a time, in order | documented S15 | 6 |
| F7 | Queries are reactive; subscriptions synchronize state and are not durable event delivery | documented S5 | 8 |
| F8 | Scheduling from a mutation commits with it | documented S6 | 13 |
| F9 | Scheduled mutations retry internal errors and run once; developer errors end them; scheduled actions are not retried | documented S6 | 13, 14 |
| F10 | An action's mutation calls are separate transactions | documented S7 | 14 |
| F11 | Components have no `ctx.auth` | documented S4 | 11 |
| F12 | Backups exclude pending scheduled functions | documented S8 | 13, 19 |
| F13 | Transactions have limits | documented S9 | 10, 19 |
| F14 | `ConvexError` data survives a nested mutation and a component boundary | assumed | 7 |
| F15 | A parent query calling a component query stays reactive | assumed | 8 |
| F16 | `_scheduled_functions` shows failed runs for some retention window | assumed | 13 |
| F17 | `@convex-dev/migrations` fits a generation backfill | assumed | 9 |

## 2. Component map

Detail levels follow the doc's rule "Detail follows the build" (decision method, rule 4). Full means interfaces, TypeScript signatures, Convex tables and indexes, transaction boundaries, error taxonomy, step sequences and limits. Proportional means trigger, promise, contract surface, rules and scenarios at the depth the doc gives, with a `[deferred]` marker on what the build will write. Layer 3 sits between the two because D13 to D15 are specific.

| # | Component | Layer | Detail | Purpose | Owning decisions, laws | Scenarios | Depends on | Package |
|---|---|---|---|---|---|---|---|---|
| 1 | Foundation: thesis, layers and profiles, decision method, laws, decisions, fact ledger and probes, acceptance contract, existing systems, vocabulary | all | full transcription | Carry the doc into the graph so every other Spec can cite an ID instead of a paragraph | all | none of its own | nothing | A |
| 2 | Domain kernel | 0 | full | Pure `decide`, `evolve`, initial state, the fold; inputs enter as data; the four outcomes as a type | D3, D4; Law 3, Law 6 | L0-1, L0-2 | nothing (pure TypeScript) | B |
| 3 | Context component | 1 | full | One Convex component per bounded context owning CMS, journal and stream metadata; sanctioned operations only; DTOs out; actor and scope in | D2, D5, D11; Law 1, 2, 3, 11; F2, F11 | L1-1, L1-10, L1-11 | kernel; actor and scope contract | B |
| 4 | Journal and event envelope | 1 | full | Append with expected version, per-stream order, envelope fields, indexes, baseline events, audit-only option | D2, D5; Law 3, 10; F1 | L2-7 | context component | B |
| 5 | Persistence adapter, tables, queries, batch API | 1 | full | Load, decide, fold, append, save in one component mutation; the schema; authorized DTO queries; list-shaped operations | D3, D8, D10; F1, F13, F15 | (covered by 3 and 4) | kernel contract | B |
| 6 | Command pipeline | 1 | full | The one top-level mutation: validate, authenticate, authorize, dedupe, admit, execute contexts, update read models, record receipt, return versions; throw on failure | D1, D4, D6, D7, D11, D12; Law 1, 2, 4, 5, 6; F1, F2, F3 | L1-2 | context component, receipts, authority, outcome boundary | C |
| 7 | Outcome and rejection boundary | 1 | full | Map the four outcomes to the wire; `ConvexError` shape and closed error-code list; transient refusals are retryable; the optional refusal-record dispatcher | D4, D7; Law 6; F3, F14; OQ2 | L1-12 | kernel outcome model | C |
| 8 | Idempotency and receipts | 1 | full | Where receipts are required, key derivation, fingerprint, conflict, expiry and tombstones, re-authorization before disclosure, admission after dedupe, thin receipts, client-generated IDs for creates; the receipts table | D6, D7; Law 4, 5; F5, F6, F13 | L1-3, L1-4, L1-5, L1-9 | pipeline | C |
| 9 | Tenancy and authority | 1 | full | Tenant scope on every record, command and query; actor vocabulary; grants as authoritative data; namespaces; worker provenance; the trust boundary | D11; Law 5, 11; F11 | L1-6, L1-7, L1-8 | nothing | C |
| 10 | Command declaration and bindings | 1 to 2 | full | One declaration per command, static exports, the composition helper, generation later, one canonical schema | D12 | L2-4 | pipeline | C |
| 11 | Parent use cases | 2 | full | Contexts meet only in the parent, in one transaction; one receipt per use case; batch calls; too-large operations rejected | D1, D10; Law 1, 2, 9; F2, F3, F13 | L2-1 | context component, batch API, pipeline | D |
| 12 | Read models and projection contract | 2 | full | Reads inside the command; the read-need table; named, versioned, deterministic projections; versions in results | D8; Law 9; F7, F15 | L2-2 | context queries | D |
| 13 | Rebuild: generations, backfill, write pause | 2 | full | Online generation rebuild for per-entity and current-state views; write pause for cross-stream history views; the generation registry and gate | D9; Law 10; F1, F17 | L2-5, L2-6 | read models | D |
| 14 | Restore and baseline operations | 2 | full | Restore procedure; audit fails closed while diagnostics never abort; diagnosis by identifiers; metrics; release and recovery plan; retention policy; small events | D19; Law 8; F12 | L2-8, ALL-1 | nothing | D |
| 15 | First experiment and cost budgets | 2 | full | Orders and Inventory, the measurements, the eight budget constraints, the example-domain vocabulary | First experiment; D10; OQ1, OQ3, OQ4 | L2-3, L2-9 | everything in Layers 0 to 2 | D |
| 16 | Obligations | 3 | full where D13 rules, `[deferred]` elsewhere | The obligation record and lifecycle, local reactions, wrapper, sweeper, fan-out, retention, operator operations, restore, the do-nothing check | D13, D15, D19; Law 7, 8, 12; F3, F8, F9, F12, F16 | L3-1 to L3-4, L3-7, L3-8 | pipeline, retry ownership | E |
| 17 | External effects and retry ownership | 3 | full where D14, D15 rule | Claim, call, settle; the three repetition policies; fencing; one retry owner | D14, D15; Law 7, 12; F9, F10 | L3-5, L3-6 | obligations | E |
| 18 | Workflow processes and approvals | 4 | proportional | Workflow component as engine; business process record; approvals bound to the exact proposal; the StartCheckout example | D16, D15; Law 7, 12; S11 | L4-1 to L4-3 | obligations, effects | E |
| 19 | Agents | 5 | proportional | Proposal, policy, approval, ordinary command boundary; budgets; provider accounting; untrusted input | D17; Law 1, 5, 12 | L5-1 to L5-4 | pipeline, approvals | E |
| 20 | Advanced reads and deferred capabilities | 6 | proportional | The trigger table; coalesced recomputation, ordered consumer, cross-stream online rebuild as trigger plus core rules | D18 | L6-1 to L6-4 | rebuild | E |

Merges and splits against the task's list: idempotency and receipts stay one component because D6 defines both together; the rejection boundary is folded into the outcome model's boundary contract because D4 and D7 describe one mapping; tenancy and authority stay one component (D11); operations are split between Package D (what applies from Layer 1) and Package E (what applies to obligations), following the doc's sentence that security, bounded resource use and useful errors start in Layer 1.

## 3. SDP mapping

### 3.1 IDs, files, families

- Spec ID: `spec:<family>.<name>` or `spec:<family>.<parent-name>.<child-name>`. Segments are `[A-Za-z0-9][A-Za-z0-9-]*`; families are lowercase. Verified grammar: `src/ids.ts`.
- File: `design/specs/<family>/<everything after the family>.sdp.md`, dots kept. `spec:kernel.domain-kernel.evaluate-twice` lives at `design/specs/kernel/domain-kernel.evaluate-twice.sdp.md`. The mapping is deterministic in both directions.
- Families and their packages:

| Family | Directory | Package |
|---|---|---|
| `platform`, `laws`, `decisions`, `facts` | `specs/platform/`, `specs/laws/`, `specs/decisions/`, `specs/facts/` | A |
| `kernel`, `context` | `specs/kernel/`, `specs/context/` | B |
| `command` | `specs/command/` | C |
| `application`, `constraints`, `operations` | `specs/application/`, `specs/constraints/`, `specs/operations/` | D |
| `obligations`, `effects`, `processes`, `agents`, `advanced` | one directory each | E |

- Pack manifests live at `design/specs/<package>.pack.sdp.md` and already exist: `foundation`, `kernel-and-context`, `command-pipeline`, `application`, `durable-and-later`. Each package edits only its own manifest. Membership order: parents before children, in the order of the inventory tables below. Every manifest adds `modelRefs: [spec:platform.vocabulary]` once Package A has landed that Spec (a `modelRefs` entry must resolve, or validate fails).

The constructs used, and where SDP shows them: the Markdown envelope and body (`specs/carrier/envelope-contract.sdp.md`, `specs/carrier/prose-ownership-rule.sdp.md`, parser in `src/extract/markdown-body*.ts`); the eight kinds and their evidence (`specs/validation/kind-evidence.sdp.md`); the readiness floor (`specs/validation/readiness-floor.sdp.md`, table in `src/validate/readiness-floor.ts`); relations (`specs/model/relations.sdp.md`); example spaces and bound points (`specs/carrier/slot-notation.sdp.md`, `src/graph/example-space.ts`, `specs/decisions/point-per-example.sdp.md`); promotion (`specs/decisions/content-only-sections.sdp.md`); packs (`specs/carrier/markdown-pack-authoring.sdp.md`, `specs/validation/pack-coherence.sdp.md`); the Design section as an open keyed bag (`src/extract/markdown-body-owner-sections.ts`, `mapOpen`; worked examples `specs/extraction/derive-graph.sdp.md`, `specs/carrier/markdown-pack-authoring.sdp.md`); a workflow Spec (`specs/extraction/build-pipeline.sdp.md`); a constraint (`specs/extraction/determinism.sdp.md`); a contract (`specs/carrier/envelope-contract.sdp.md`); the worked adopter corpus (`examples/checkout-v1/specs/`).

### 3.2 Kinds, altitudes, readiness

| Doc construct | kind | altitude | Stated readiness |
|---|---|---|---|
| The platform thesis | `behavior` | `epic` | `defined` |
| A law | `rule` | `feature` | `defined` |
| A decision | `decision` | `feature` | `defined` |
| A fact-ledger row | `constraint` | `story` | `defined`; `scoped` while the fact is assumed |
| The probe plan, the first experiment, the command pipeline, rebuild, restore, the checkout example | `workflow` | `feature` or `story` | see inventory |
| A component with rules and an example space | `behavior` | `feature` | `defined` (Layers 0 to 3), `scoped` (Layers 4 to 6) |
| A pinned interface, table schema or wire shape | `contract` | `story` | `defined` |
| A cost target or bound | `constraint` | `story` | `defined` |
| A vocabulary | `model` | `feature` or `story` | `defined` |
| A ruling the design makes beyond the doc | `decision` | `story` | `defined` |
| An acceptance scenario | `example` | `story` | `defined` |

Readiness policy. No agent writes `readiness: ready`; SDP reserves that statement for a human after review, and the doc says the owner has ruled on nothing. `defined` is the ceiling and is stated only when the floor clears: outcome present, at least one relation, the kind's evidence complete, no blocking open question. Layer 4 to 6 component Specs state `scoped`; their examples may still state `defined` because readiness is independent across refinement. A Spec that needs a ruling before it can be designed records a `[blocking]` open question and stays at `scoped`; that is the honest signal, not a defect. Two more uses of a blocking question follow the Protocol's authoring skill. A deferred Spec carries one that names its trigger. An assumed fact carries one that names its probe, so the `ready` floor refuses every Spec that rests on it until the probe has run.

Facts as constraints: the doc's own open question 5 proposes that ledger facts become constraints. The plan adopts it. A fact's `target` is its evidence status in the form `evidence.status:documented`, `evidence.status:rechecked`, `evidence.status:probed` or `evidence.status:assumed`, and `measurableBy` names the source and, for assumed facts, the probe. Every Spec that relies on a fact points `constrainedBy` at it, so the graph answers "which designs rest on an assumption".

### 3.3 Relations

- Component Spec: `refines` its parent (the epic for feature altitude, the feature for story altitude); `decidedBy` every decision it carries (mandatory); `constrainedBy` every law, fact and constraint it cites (mandatory when cited in a rule); `dependsOn` other component Specs it needs, cross-package allowed within the brief's list.
- Contract: `refines` the behavior Spec whose surface it pins; `dependsOn` the contracts it composes.
- Example: `refines` and `verifies` its parent. Both edges. Nothing else.
- Decision (the nineteen): `refines` the epic; `dependsOn` the decisions it presupposes (defaults in the inventory; adjust with a one-line reason in the narrative).
- Design-extension decision: `refines` the component it extends; `dependsOn` the doc decision it extends.
- Law: `refines` the epic. Law 4 additionally `decidedBy` D6, since the doc says it was reworded there.
- Fact: `refines: spec:facts.fact-ledger`.
- Constraint (budget): `refines` the Spec it bounds first (`spec:application.first-experiment` for the six cost targets, `spec:operations.baseline-operations` for the two D19 bounds).
- `supersedes` is unused. Nothing in the corpus replaces anything.

A relation to a missing ID is a validate error. The cross-package list in each brief is the set of foreign IDs a package may name; while a foreign target is not yet authored, the only tolerated error is `conformance/referential-integrity` naming that target. The merged corpus must have none.

### 3.4 Spec inventory

Relations shown are the minimum. `epic` means `spec:platform.transactional-domain-platform`. Scenario tokens name the examples each parent owns; section 4 gives the example IDs.

#### Package A: foundation

| ID | kind | alt | readiness | relations | Content from the doc |
|---|---|---|---|---|---|
| `spec:platform.transactional-domain-platform` (exists as a stub) | behavior | epic | defined | constrainedBy Law 1 to 12 | Thesis: ownership, atomicity, asynchrony; the default operation; "succeeds when adding domain sophistication does not add infrastructure"; doc-level open questions OQ5 (answered by this corpus) as narrative |
| `spec:platform.layers-and-profiles` | rule | feature | defined | refines epic; decidedBy D18 | Layers 0 to 6 with contents; profiles; lower never imports higher; what starts in Layer 1; build one thin use case first; first stopping point; the three "done when" criteria |
| `spec:platform.decision-method` | rule | feature | defined | refines epic | The seven rules of "How decisions are made" |
| `spec:platform.vocabulary` | model | feature | defined | refines epic | CMS, journal, stream version, receipt, obligation, effect, attempt, generation, operation, baseline event, do-nothing option, plus: context, parent, use case, read model, projection, tenant scope, actor, request key, effect key, needs attention, write pause, layer, profile. OQ6 clashes (receipt, generation) as `[non-blocking]` open questions |
| `spec:platform.acceptance-contract` | rule | feature | defined | refines epic | Scenarios test behavior; layer = first layer making it available; the four tiers; fixture app separate from example app; test-only functions never ship; disposable backend per test; the evidence record; readiness stated as specified, implemented, tested under named conditions, operationally accepted |
| `spec:platform.native-harness` | rule | feature | defined | refines acceptance-contract | E-13 and E-15, which the doc does not state: the fixture issuer and ordinary clients, the admin key for setup and reading only, two compositions, faults and assertions, the four controls, the run's record. Added by slice S0 with four examples |
| `spec:platform.existing-systems` | rule | feature | defined | refines epic | No deletion or migration authorized; the five bullets |
| `spec:laws.law01-sanctioned-writes-only` ... `spec:laws.law12-one-retry-owner` | rule | feature | defined | refines epic (Law 4 also decidedBy D6) | One law each, the sentence verbatim in `## Rule`, the reworded note in narrative |
| `spec:decisions.d01-one-mutation-per-operation` ... `spec:decisions.d19-operations-travel-with-capability` | decision | feature | defined | refines epic; dependsOn per table below | Provenance line in narrative; `context` = the concern and the do-nothing option; first `alternative` = the do-nothing option; further `alternative`s = the doc's rejected options; `decision` = the ruling; `rationale`; `consequence` = costs, gaps, open items; the doc's "Probe" lines as `[non-blocking]` open questions naming the probe number |
| `spec:facts.fact-ledger` | rule | feature | defined | refines epic | Statuses; the probes that have run; sources support facts not the design; each fact names its decisions |
| `spec:facts.probe-plan` | workflow | feature | defined | refines fact-ledger; dependsOn F14 to F17 | Seven flows, one per probe, each ending with the decisions it serves |
| `spec:facts.f01-serializable-mutations-under-occ` ... `spec:facts.f17-migrations-fits-generation-backfill` | constraint | story | defined | refines fact-ledger | statement = the fact; `flavor: convex-fact`; `target` per 3.2; `measurableBy` = source and probe |

Law slugs: `law01-sanctioned-writes-only`, `law02-state-and-events-commit-together`, `law03-events-only-source-of-state`, `law04-server-scoped-idempotency-key`, `law05-authorization-before-execution-and-disclosure`, `law06-technical-failure-never-a-rejection`, `law07-deferred-work-never-reported-early`, `law08-durable-capability-ships-operations`, `law09-no-invariant-on-late-read-model`, `law10-replay-never-runs-commands-or-effects`, `law11-tenant-scope-named`, `law12-one-retry-owner`.

Decision slugs and default `dependsOn`:

| ID | dependsOn |
|---|---|
| `d01-one-mutation-per-operation` | none |
| `d02-context-owns-state-and-journal` | none |
| `d03-events-only-source-of-next-state` | d02 |
| `d04-four-outcomes` | none |
| `d05-rebuildable-history-with-baselines` | d03 |
| `d06-idempotency-client-and-receipts` | d04, d07 |
| `d07-rejections-thrown-not-stored` | d04 |
| `d08-read-models-in-command` | d02 |
| `d09-rebuild-online-by-default` | d08 |
| `d10-contexts-meet-in-parent-use-cases` | d01, d02 |
| `d11-tenant-scope-and-authority` | none |
| `d12-one-declaration-per-command` | none |
| `d13-deferred-work-is-an-obligation` | d01 |
| `d14-external-effects-declare-safe-repetition` | d13 |
| `d15-one-retry-owner-per-obligation` | d13, d14 |
| `d16-processes-use-workflow` | d13, d15 |
| `d17-agents-use-the-command-path` | d11, d16 |
| `d18-everything-else-waits-for-trigger` | d09, d13 |
| `d19-operations-travel-with-capability` | d13 |

Fact slugs: `f01-serializable-mutations-under-occ`, `f02-component-calls-commit-with-caller`, `f03-nested-run-mutation-partial-rollback`, `f04-nested-calls-cost-more-than-helpers`, `f05-react-client-retries-until-confirmed`, `f06-client-mutations-run-in-order`, `f07-queries-reactive-not-durable-delivery`, `f08-scheduling-commits-with-mutation`, `f09-scheduled-mutation-and-action-retry-semantics`, `f10-action-mutation-calls-are-separate-transactions`, `f11-components-have-no-ctx-auth`, `f12-backups-exclude-pending-scheduled-functions`, `f13-transactions-have-limits`, `f14-convex-error-survives-nested-and-component-boundary`, `f15-parent-query-over-component-query-stays-reactive`, `f16-scheduled-functions-table-shows-failed-runs`, `f17-migrations-fits-generation-backfill`. F13's Design section carries the numeric limits from section 9.

#### Package B: kernel and context

| ID | kind | alt | readiness | relations | Content |
|---|---|---|---|---|---|
| `spec:kernel.domain-kernel` | behavior | feature | defined | refines epic; decidedBy D3, D4; constrainedBy Law 3, Law 10; dependsOn `spec:kernel.outcome-model` | Purity (no database, network, scheduler, environment, ambient auth); time and outside facts as inputs; historically significant facts captured in events and never re-fetched; commands load current state and apply only new events; rebuild equality is a test; small state machines and invariants. Example space for L0-1, L0-2 |
| `spec:kernel.decider-contract` | contract | story | defined | refines domain-kernel; decidedBy D3; dependsOn initial-state | `Decider<S, C, E, R>` with `initial`, `decide`, `evolve`; `DecisionContext` (now, actor, captured facts); `DecideResult<E, R>`; `fold`; the state-machine helper shape |
| `spec:kernel.outcome-model` | rule | feature | defined | refines epic; decidedBy D4; constrainedBy Law 6 | The four outcomes; business failure commits like success; rejection commits nothing; technical failure rolls back and stores nothing; transient refusal is a retryable error; refused-as-fact is a per-command business policy. Design: the `Outcome` union |
| `spec:kernel.initial-state` | decision | story | defined | refines domain-kernel; dependsOn D3 | E-1: `initial()` versus evolve-from-empty; the ruling, its consequence for rebuild from the creation event |
| `spec:kernel.state-document-mapping` | decision | story | defined | refines domain-kernel; dependsOn D3 | E-2: one document per stream by default within the size budget; when state spans documents, one mapping per context derives writes from folded state; OQ3 |
| `spec:context.context-component` | behavior | feature | defined | refines epic; decidedBy D2, D5, D11; constrainedBy Law 1, 2, 3, 11, F2, F11; dependsOn domain-kernel, `spec:command.actor-and-scope` | Ownership table; journal code as shared library; no central store; "state never changes without its events" enforced in the API; no deployment-wide counter; no `ctx.auth`, actor and scope as arguments; DTOs and application IDs out; cross-context reference `(tenantId, contextId, eventId)`; audit-only history as explicit choice; OQ1 `[non-blocking]`. Example space for L1-1, L1-10, L1-11 |
| `spec:context.journal` | behavior | feature | defined | refines context-component; decidedBy D2, D5; constrainedBy Law 3, 10, F1 | Append names expected version; indexed read in the same transaction; order only within a stream; no global token; cross-stream relation by `operationId` and `causedBy`; starting indexes; baseline events (written by migration, rebuild starts at the latest baseline, earlier events readable, never rewritten, old reducers not kept); representation change is a schema migration. Example space for L2-7 |
| `spec:context.event-envelope` | contract | story | defined | refines journal; decidedBy D2; dependsOn `spec:command.actor-and-scope` | The fifteen envelope fields as a validator and a type; bounds on payload |
| `spec:context.tables` | contract | story | defined | refines context-component; decidedBy D2; constrainedBy F13; dependsOn state-document-mapping | E-3: `streams` and `events` tables, indexes for replay, identity, enumeration and operation, the deleted-subject marker, size budgets |
| `spec:context.persistence-adapter` | contract | story | defined | refines context-component; decidedBy D3; constrainedBy F1; dependsOn decider-contract, state-document-mapping, tables | `execute` inside the component: load, decide, fold, append with version check, save, return DTO and versions; version conflict versus rejection versus throw; one authority |
| `spec:context.queries` | contract | story | defined | refines context-component; decidedBy D8; constrainedBy Law 11, F15 | Authorized component queries returning DTOs; tenant and scope arguments; pagination across the boundary (Probe 5) |
| `spec:context.batch-shaped-api` | rule | story | defined | refines context-component; decidedBy D10; constrainedBy F13 | Lists in and out; one call per context per use case; O(N) business work allowed, O(N) component calls not |

#### Package C: command pipeline

| ID | kind | alt | readiness | relations | Content |
|---|---|---|---|---|---|
| `spec:command.command-pipeline` | workflow | feature | defined | refines epic; decidedBy D1, D4, D6, D7, D11, D12; constrainedBy Law 1, 2, 4, 5, 6, F1, F2, F3; dependsOn `spec:context.context-component`, idempotency-and-receipts, tenancy-and-authority, outcome-boundary | The step sequence of one mutation: parse against the canonical schema; authenticate and establish actor and tenant scope; authorize; receipt lookup (duplicate, conflict, new); rate admission for new intent; context calls as sub-transactions; essential read models; receipt insert; return with affected stream versions. Failure is a throw. Example space for L1-2 |
| `spec:command.outcome-boundary` | contract | story | defined | refines command-pipeline; decidedBy D4, D7; constrainedBy Law 6, F3, F14; dependsOn `spec:kernel.outcome-model` | E-5: applied and business failure as results; rejection as `ConvexError` with a closed code list; technical failure as a plain throw; transient as retryable `ConvexError`; the generic internal dispatcher for boundaries that must record a refusal, gated on OQ2 `[non-blocking]`. Example space for L1-12 |
| `spec:command.idempotency-and-receipts` | behavior | feature | defined | refines command-pipeline; decidedBy D6, D7; constrainedBy Law 4, 5, F5, F6 | Where receipts are required and where the client guarantee reaches; server-built key; fingerprint over business input and contract version; conflict; re-authorization before disclosure; explicit expiry and tombstones; read-check-insert in one transaction; admission after dedupe; thin receipts; rejected stores nothing; UI double submit via client-generated ID and uniqueness. Probe 1 `[non-blocking]`. Example space for L1-3, L1-4, L1-5, L1-9 |
| `spec:command.receipt-table` | contract | story | defined | refines idempotency-and-receipts; constrainedBy F13 | E-4: the `receipts` table, key fields, indexes, the tombstone shape, expiry defaults |
| `spec:command.tenancy-and-authority` | behavior | feature | defined | refines epic; decidedBy D11; constrainedBy Law 5, 11, F11 | Tenant on everything; absent tenant never a wildcard; parent authenticates and authorizes; one vocabulary for humans, services, agents, reviewers, operators; grants are authoritative data; worker provenance and its two modes; trust boundary; namespaces a client cannot claim. Example space for L1-6, L1-7, L1-8 |
| `spec:command.actor-and-scope` | contract | story | defined | refines tenancy-and-authority | E-6: `Actor`, `TenantScope`, `CallerNamespace`, the authorize signature, the grants table |
| `spec:command.command-declaration` | contract | feature | defined | refines epic; decidedBy D12; dependsOn command-pipeline | E-7: the declaration fields; static exports; the composition helper; generation after two modules, deterministic and CI-checked; no DI, decorators, reflection or lifecycle; one canonical schema, no lossy converter. Example space for L2-4 |

#### Package D: application

| ID | kind | alt | readiness | relations | Content |
|---|---|---|---|---|---|
| `spec:application.parent-use-cases` | behavior | feature | defined | refines epic; decidedBy D1, D10; constrainedBy Law 1, 2, 9, F2, F3, F13, `spec:constraints.one-call-per-context-per-use-case`; dependsOn `spec:context.context-component`, `spec:context.batch-shaped-api`, `spec:command.command-pipeline` | Contexts never read each other or call each other; cross-context rules in the parent, same transaction, or in an obligation; no handler issues commands; one receipt and outcome per use case; PlaceOrder is one command; grouping by flow; too-large operations rejected or a separate import command; OQ3 max lines `[non-blocking]`. Example space for L2-1 |
| `spec:application.read-models` | behavior | feature | defined | refines epic; decidedBy D8; constrainedBy Law 9, F7, F15, `spec:constraints.zero-core-projection-jobs`; dependsOn `spec:context.queries` | The read-need table; zero projection jobs; projection properties; committed-or-later visibility; versions in results; reactive queries replace event-to-socket layers; CQRS as separate contracts. Example space for L2-2 |
| `spec:application.projection-contract` | contract | story | defined | refines read-models | E-9: the projection signature shared by live update and rebuild; row conventions (tenant, generation, key, source version) |
| `spec:application.rebuild` | workflow | feature | defined | refines read-models; decidedBy D9; constrainedBy Law 10, F1, F17 | The four online steps; the missing-row rule for incremental updates; version-compare backfill; verify, switch, keep old; per-entity markers for counts and sums; the write pause for cross-stream history views (gate, fence, resume, abort); never commands or effects. Probe 6 `[non-blocking]`. Example space for L2-5, L2-6 |
| `spec:application.generation-registry` | contract | story | defined | refines rebuild; constrainedBy F13 | E-8: the generations table and states, the marker document, the migrations-component binding |
| `spec:application.write-pause` | contract | story | defined | refines rebuild | E-8: the maintenance gate document, the writer check, fencing of background writers, operator resume and abort |
| `spec:application.restore` | workflow | story | defined | refines `spec:operations.baseline-operations`; decidedBy D19; constrainedBy F12 | Restore with matching code and configuration; invariant checks for domain, journal and read models; what the recovery plan contains; restore is tested, not only backup. Example space for L2-8 |
| `spec:application.first-experiment` | workflow | feature | defined | refines epic; constrainedBy the six cost-target constraints; dependsOn the Layer 0 to 2 component Specs | Build Layers 0 to 2 in Orders and Inventory; pass criterion; measurements; healthy-path and retry costs separately; targets are product decisions; results feed OQ1 and Layer 3; OQ4 `[non-blocking]`. Example space for L2-3, L2-9 |
| `spec:application.orders-inventory-example` | model | story | defined | refines first-experiment | The example domain's terms: order, line, inventory, allocation, PlaceOrder, the second lifecycle command, the essential summary |
| `spec:operations.baseline-operations` | rule | feature | defined | refines epic; decidedBy D19; constrainedBy Law 8, `spec:constraints.events-stay-small`, `spec:constraints.bulk-operations-bounded` | Logging and metrics never cancel a valid write; mandatory audit inside the transaction fails closed; diagnosis by request key, operation ID, tenant, subject, causation; stored receipts are the authority; the metric list; release preserves, migrates or drains pending work; retention and deletion policy before production data; diagnostics hold no raw prompts or credentials. Example space for ALL-1 |
| `spec:constraints.one-commit-per-successful-command` | constraint | story | defined | refines first-experiment | target `commits.top-level.per-successful-command.eq:1` |
| `spec:constraints.zero-core-projection-jobs` | constraint | story | defined | refines first-experiment | target `projection-jobs.core-path.eq:0` |
| `spec:constraints.one-call-per-context-per-use-case` | constraint | story | defined | refines first-experiment | target `component-calls.per-context.per-use-case.eq:1` |
| `spec:constraints.one-public-execution-per-intent` | constraint | story | defined | refines first-experiment | target `public-command-executions.per-business-intent.eq:1` |
| `spec:constraints.no-application-wide-counter` | constraint | story | defined | refines first-experiment | target `application-wide-counters.in-write-path.eq:0` |
| `spec:constraints.no-queue-recovery-for-essential-reads` | constraint | story | defined | refines first-experiment | target `queue-recovery.required-for-essential-reads.eq:0` |
| `spec:constraints.events-stay-small` | constraint | story | defined | refines baseline-operations | target a payload byte bound the author states with an `[extension]` marker and E-number |
| `spec:constraints.bulk-operations-bounded` | constraint | story | defined | refines baseline-operations | target `bulk-operations.without-stated-bound.eq:0` and the rule that limits are ceilings, not batch sizes |

#### Package E: durable and later layers

| ID | kind | alt | readiness | relations | Content |
|---|---|---|---|---|---|
| `spec:obligations.obligation-module` | behavior | feature | defined | refines epic; decidedBy D13, D15, D19; constrainedBy Law 7, 8, 12, F3, F8, F9, F12, F16; dependsOn `spec:command.command-pipeline`, `spec:effects.retry-ownership` | Trigger; one promise per obligation; commits with the business change; first scheduling joins the transaction; not a copy of every event; the six states; the record's fields; scheduler IDs are metadata; local reaction as scheduled mutation with wrapper and nested body; completion semantics per outcome; no `onComplete` decides; reactive query for completion; one bounded sweeper per module; specialized records only for distinct evidence; full pool delays; partitioning and fairness; static and dynamic fan-out; derived commands; chain bound; the do-nothing check as a `[non-blocking]` open question naming Probe 7. Example space for L3-1 to L3-4 |
| `spec:obligations.lifecycle-transitions` | rule | story | defined | refines obligation-module | E-10: the allowed transitions between the six states and who may cause each |
| `spec:obligations.record-contract` | contract | story | defined | refines obligation-module; constrainedBy F13 | E-10: the `obligations` table, every D13 field as a validator, indexes for effect key, status and next attempt, operation |
| `spec:obligations.local-reaction-wrapper` | contract | story | defined | refines obligation-module; constrainedBy F3, F8, F9 | The scheduled-mutation wrapper: fence on attempt, run the body as a nested mutation, settle per outcome in the same transaction, schedule the next attempt, leave nothing partial |
| `spec:obligations.sweeper` | contract | story | defined | refines obligation-module; constrainedBy F16, `spec:constraints.bulk-operations-bounded` | Bounded batch; what counts as failed or missing dispatch; backlog left alone; rearm; escalation when recovery keeps failing; how it is scheduled |
| `spec:obligations.operator-operations` | contract | story | defined | refines obligation-module | inspect, retry, reconcile, cancel, abandon; the repair record; no success without evidence |
| `spec:obligations.fan-out-and-chains` | rule | story | defined | refines obligation-module; constrainedBy F13 | Static subscription fan-out in the publishing transaction and its budget; dynamic fan-out as a separate task with snapshotted routing; causation and server namespace on derived commands; the cycle bound |
| `spec:obligations.retention-and-restore` | rule | story | defined | refines obligation-module; decidedBy D19; constrainedBy F12 | TTL never deletes unresolved work; completed work kept past every repeat horizon; bulky diagnostics expire first; restore with dispatch off, reconcile the gap, rebuild schedules from obligations, provider keys survive; handler key and version; shims; unsupported version to needs attention. Example space for L3-7, L3-8 |
| `spec:obligations.do-nothing-check` | decision | story | defined | refines obligation-module; dependsOn F12, F16, `spec:facts.probe-plan` | The activation check: plain scheduled mutation plus `_scheduled_functions` scan versus the obligation table; the four reasons the table earns its cost; what Probe 7 must confirm |
| `spec:effects.external-effects` | behavior | feature | defined | refines obligation-module; decidedBy D14, D15; constrainedBy Law 7, 12, F9, F10 | Claim, call, settle; the three repetition policies; ambiguity to needs attention; a fresh random key is not a retry; stale worker cannot overwrite but its evidence is kept and reconciled; fencing writes does not stop a sent call; compensation is a new operation. Example space for L3-5, L3-6 |
| `spec:effects.claim-call-settle` | contract | story | defined | refines external-effects; constrainedBy F9, F10 | E-11: the claim mutation (lease, attempt, provider key), the action (no retries of its own, classification of results), the settle mutation (fence, evidence); the `RepetitionPolicy` union |
| `spec:effects.retry-ownership` | rule | story | defined | refines external-effects; decidedBy D15; constrainedBy Law 12 | The obligation module owns retries; Workpool with retries off or ownership passed deliberately with attempts shown the same way; workflows wait and never retry; engine retries are not attempts |
| `spec:processes.workflow-processes` | behavior | feature | scoped | refines epic; decidedBy D16, D15; constrainedBy Law 7, 12; dependsOn obligation-module, external-effects | `[deferred]`. Trigger; Workflow as engine; process record independent of step names; local steps as one mutation; only waits and effects as steps; definition version at start; deploy keeps, migrates or blocks; two contexts are not a reason. Examples L4-1, L4-3 (free-form steps, no example space) |
| `spec:processes.approvals` | rule | story | scoped | refines workflow-processes | `[deferred]`. Binding to the exact proposal; input change voids; two checks; explicit transitions for rejection, expiry, concurrent execution. Example L4-2 |
| `spec:processes.start-checkout-example` | workflow | story | scoped | refines workflow-processes | `[deferred]`. The worked example as flows, including the three late-payment policies |
| `spec:agents.agent-runs` | behavior | feature | scoped | refines epic; decidedBy D17; constrainedBy Law 1, 5, 12; dependsOn `spec:command.command-pipeline`, approvals | `[deferred]`. Proposal, policy, approval, boundary; what an agent cannot do; untrusted input; module ownership; bounds per run; records kept; confidence advisory; risk policy inputs. Examples L5-1, L5-2 (two), L5-4 |
| `spec:agents.budget-accounting` | rule | story | scoped | refines agent-runs | `[deferred]`. Reserve before dispatch, settle once from evidence; slots and money separate; timed-out lease proves nothing; unknown cost never zero; reconciliation and operator exit; provider retry may cost. Example L5-3 |
| `spec:advanced.trigger-table` | rule | feature | scoped | refines epic; decidedBy D18 | `[deferred]`. The twelve capability and trigger rows as rules; the activation record; the not-standing-requirements list |
| `spec:advanced.coalesced-recomputation` | behavior | story | scoped | refines trigger-table | `[deferred]`. The core rules. Example L6-1 |
| `spec:advanced.ordered-consumer` | behavior | story | scoped | refines trigger-table | `[deferred]`. The core rules. Examples L6-2, L6-3 |
| `spec:advanced.cross-stream-online-rebuild` | behavior | story | scoped | refines trigger-table; dependsOn `spec:application.rebuild` | `[deferred]`. Rebuild classes; a position vector is bookkeeping; needs a dependency protocol or consistent cut; until then the write pause. Example L6-4 |

## 4. Scenarios to examples

Every row of the doc's acceptance table becomes at least one `example` Spec. When a row enumerates cases (three injection points, three order sizes, two broken subsystems), each case is one sibling example binding a different point, per SDP's point-per-example law. An "or" in the scenario's text enumerates cases the same way (a worker or agent namespace, rate or capacity refusal). An "or" in the pass condition does not: the example binds the alternative its design produces. A verification bullet adds assertions to a case and never stands in for one. Titles are the doc's scenario text. The tier comes from the acceptance contract: domain (pure), simulator, native, or end to end.

| Sc | Scenario (doc text) | Parent Spec | Example ID | Tier | Pkg |
|---|---|---|---|---|---|
| L0-1 | Evaluate a decision twice with identical inputs | `spec:kernel.domain-kernel` | `.evaluate-twice` | domain | B |
| L0-2 | Run commands incrementally, then rebuild the stream from its events | `spec:kernel.domain-kernel` | `.incremental-then-rebuild` | domain | B |
| L1-1 | A command asks for an invalid state transition | `spec:context.context-component` | `.invalid-transition` | native | B |
| L1-2 | Inject a failure after the state write, after the journal append, and before the receipt | `spec:command.command-pipeline` | `.failure-after-state-write`, `.failure-after-journal-append`, `.failure-before-receipt` | native | C |
| L1-3 | A non-UI caller sends the same command concurrently, and again after a lost response | `spec:command.idempotency-and-receipts` | `.concurrent-non-ui-calls`, `.retry-after-lost-response` | native | C |
| L1-4 | The UI submits the same create twice | `spec:command.idempotency-and-receipts` | `.ui-double-submit` | native | C |
| L1-5 | Reuse a key with changed business input | `spec:command.idempotency-and-receipts` | `.key-reuse-changed-input` | native | C |
| L1-6 | Two tenants use the same request key and local ID | `spec:command.tenancy-and-authority` | `.same-key-two-tenants` | native | C |
| L1-7 | A client claims a worker or agent namespace | `spec:command.tenancy-and-authority` | `.client-claims-system-namespace`, `.client-claims-agent-namespace` | native | C |
| L1-8 | Authorization is revoked, then a successful command is retried | `spec:command.tenancy-and-authority` | `.revoked-then-retried` | native | C |
| L1-9 | Rate or capacity refusal, then a retry of the same intent | `spec:command.idempotency-and-receipts` | `.rate-refusal-then-retry`, `.capacity-refusal-then-retry` | native | C |
| L1-10 | A command names a stale, explicitly reviewed version | `spec:context.context-component` | `.stale-version-rejected` | native | B |
| L1-11 | Two commands compete for the same stock or unique value | `spec:context.context-component` | `.competing-commands`, `.competing-unique-value` | native | B |
| L1-12 | A rejected command's response is lost, and it is retried after state changed | `spec:command.outcome-boundary` | `.rejected-then-retried-after-change` | native | C |
| L2-1 | The first context writes, then the second rejects or throws | `spec:application.parent-use-cases` | `.second-context-rejects` | native | D |
| L2-2 | A successful command, then a query or subscription | `spec:application.read-models` | `.committed-state-visible` | native | D |
| L2-3 | Orders of 1 line, 10 lines and the maximum | `spec:application.first-experiment` | `.order-of-1-line`, `.order-of-10-lines`, `.order-of-max-lines` | native | D |
| L2-4 | Rename a typed handler or break its argument contract | `spec:command.command-declaration` | `.renamed-handler-fails-build` | build | C |
| L2-5 | Rebuild a per-entity read model online while commands run; interrupt and resume | `spec:application.rebuild` | `.online-rebuild-interrupt-resume` | native | D |
| L2-6 | Rebuild a cross-stream history view under a write pause; interrupt | `spec:application.rebuild` | `.write-pause-rebuild-interrupt` | native | D |
| L2-7 | Rebuild a stream that has a baseline event | `spec:context.journal` | `.rebuild-from-baseline` | native | B |
| L2-8 | Restore a representative dataset with matching code and configuration | `spec:application.restore` | `.restore-representative-dataset` | end to end | D |
| L2-9 | Run native acceptance with production configuration | `spec:application.first-experiment` | `.native-acceptance-production-configuration` | end to end | D |
| L3-1 | Duplicate a local worker and lose any completion callback | `spec:obligations.obligation-module` | `.duplicate-worker-lost-callback` | native | E |
| L3-2 | Kill a dispatch before work, or fail the scheduled wrapper | `spec:obligations.obligation-module` | `.dispatch-killed-rearmed` | native | E |
| L3-3 | Legitimate backlog builds up | `spec:obligations.obligation-module` | `.backlog-left-alone` | native | E |
| L3-4 | Exhaust retries, including failures of recovery itself | `spec:obligations.obligation-module` | `.exhausted-needs-attention` | native | E |
| L3-5 | The provider succeeds but the reply is lost | `spec:effects.external-effects` | `.provider-success-reply-lost` | native | E |
| L3-6 | An old worker reports after a new attempt or a cancellation | `spec:effects.external-effects` | `.stale-worker-late-evidence` | native | E |
| L3-7 | Restore while provider state has moved past the backup | `spec:obligations.retention-and-restore` | `.restore-behind-provider` | end to end | E |
| L3-8 | Retention runs while retries or redelivery are still possible | `spec:obligations.retention-and-restore` | `.retention-keeps-unresolved` | native | E |
| L4-1 | Restart a process after an external step completed | `spec:processes.workflow-processes` | `.restart-after-external-step` | native | E |
| L4-2 | Race approval, expiry, revocation and execution | `spec:processes.approvals` | `.approval-races` | native | E |
| L4-3 | Deploy while an old process is in flight | `spec:processes.workflow-processes` | `.deploy-with-process-in-flight` | end to end | E |
| L5-1 | An agent proposes a valid-looking unauthorized command | `spec:agents.agent-runs` | `.unauthorized-proposal-rejected` | native | E |
| L5-2 | Proposal input changes after approval, or the run exceeds its budget | `spec:agents.agent-runs` | `.changed-input-voids-approval`, `.budget-exceeded-blocks-execution` | native | E |
| L5-3 | A paid call times out and usage arrives later | `spec:agents.budget-accounting` | `.timed-out-paid-call-settles-once` | native | E |
| L5-4 | A retrieved document or prompt tries to widen the agent's rights | `spec:agents.agent-runs` | `.untrusted-input-cannot-widen` | native | E |
| L6-1 | Source changes during a coalesced recompute | `spec:advanced.coalesced-recomputation` | `.source-changes-during-recompute` | native | E |
| L6-2 | Duplicate and out-of-order events reach a noncommutative consumer | `spec:advanced.ordered-consumer` | `.duplicate-out-of-order-applied-once` | native | E |
| L6-3 | One ordered partition fails | `spec:advanced.ordered-consumer` | `.partition-failure-isolated` | native | E |
| L6-4 | A cross-stream backfill races live writes and new subjects, then cuts over | `spec:advanced.cross-stream-online-rebuild` | `.backfill-races-live-writes` | native | E |
| ALL-1 | Break metrics and logging; separately, break mandatory audit | `spec:operations.baseline-operations` | `.broken-metrics-never-abort`, `.broken-audit-aborts` | native | D |

Example IDs are the parent ID plus the suffix shown. Layer 0 to 2 parents declare an example space and every child binds points in it. Layer 3 parents declare one too. Layer 4 to 6 parents declare none, so their children write free-form steps.

## 5. Work packages

Five packages, disjoint by directory. Sequence: A first, because every other package's relations resolve against A's IDs. B, C, D and E then run in parallel. Each package edits only its own directories and its own pack manifest. A also owns `design/README.md`.

Definition of done, every package:

1. `npx sdp validate` exits 0 on the merged corpus. While a foreign ID from the package's cross-package list is not yet authored, the only tolerated error is `conformance/referential-integrity` naming that ID.
2. No warning. An example with no test bound is data below `ready`, not a warning.
3. Every Spec in the package's inventory exists with the stated kind, altitude, readiness and minimum relations; every scenario assigned to the package has its example(s).
4. The pack manifest lists every Spec of the package in inventory order.
5. Recipe 7 (readiness divergence) returns an empty array for the package's IDs.
6. Every rule, flow, contract bullet and Design bullet carries a citation or an `[extension]` marker with an E-number (section 6.4, 6.5).
7. The section templates in 6.1 are followed; the carrier rules in 6.2 hold (validate proves most of them).

### Package A: foundation

Scope: `specs/platform/`, `specs/laws/`, `specs/decisions/`, `specs/facts/`, `specs/foundation.pack.sdp.md`, `design/README.md`.

Deliverables: the inventory in 3.4 under Package A: 6 platform Specs (the epic exists as a stub; enrich it in place), 12 laws, 19 decisions, the fact ledger rule, the probe plan, 17 facts. README.md per section 8.

Brief. This package is transcription, not design. Carry the doc's sentences in substance, keep its wording where it is already precise, and do not improve it. A decision Spec's `context` states the concern and what Convex already gives (decision method, rule 1); the first `alternative` is always the do-nothing option (rule 2), including for decisions where the doc chose it; each rejected option in the doc is its own `alternative`; the standing cost goes in `consequence` and, as `- risk:`, in Intent. The doc's "Probe" paragraphs become `[non-blocking]` open questions that name the probe number. Provenance (carried, changed, new) is the first narrative line. For facts, `statement` is the ledger row, `flavor: convex-fact`, `target` per 3.2, and `measurableBy` names the source URL and the probe. Section 9 records what the lead rechecked on 2026-09-30; a fact whose status changes records the recheck in its narrative and keeps the doc's status in `measurableBy` so the difference is visible. The laws are twelve one-sentence rules; their `## Rule` holds the sentence verbatim and, for Law 4, the sentence plus the note that D6 reworded it. The vocabulary carries every term the doc defines and the ones the other packages need (listed in the inventory); the two clashes are `[non-blocking]` open questions.

Cross-package IDs A may reference: none. A is referenced by everyone.

### Package B: kernel and context

Scope: `specs/kernel/`, `specs/context/`, `specs/kernel-and-context.pack.sdp.md`.

Deliverables: 5 kernel Specs, 7 context Specs, 7 examples (L0-1, L0-2, L1-1, L1-10, L1-11 as two, L2-7).

Brief. Layer 0 and Layer 1, full detail. The kernel is a pure TypeScript module and its Design section says so; the decider contract pins `Decider<S, C, E, R>`, `DecisionContext`, `DecideResult<E, R>` and `fold`, one Design bullet per declaration. The outcome model's `Outcome` union is the single type the boundary (Package C) maps to the wire; write it once here. E-1 and E-2 are decision Specs with the do-nothing option first. The context component describes one Convex component (`convex.config.ts` with `defineComponent`, mounted per context by the parent's `app.use`), its function surface (`execute` as a mutation, queries), and states explicitly that the parent calls it through `ctx.runMutation` on the component API so each call is an isolated sub-transaction that commits with the caller (F2, S2 wording in section 9). The tables contract carries `streams` and `events` as pasteable `defineTable` expressions with every index the doc names (replay, identity, enumeration) plus the operation index the doc implies, and states the document size budget for one-document-per-stream. The persistence adapter is the step sequence load, decide, fold, append with expected-version check, save, and it names the three outcomes at its boundary: version conflict (an indexed read finds a newer version), rejection (from `decide`), throw. Distinguish a version conflict, which is a logical answer the caller sees, from an engine OCC retry, which is invisible (F1); scenario L1-11 turns on that distinction. The journal Spec carries the baseline-event rules and its example space holds L2-7. Batch-shaped API is a rule Spec: one call per context per use case.

Cross-package IDs B may reference: `spec:command.actor-and-scope` (dependsOn from context-component and event-envelope), all Package A IDs. B must not reference anything else.

### Package C: command pipeline

Scope: `specs/command/`, `specs/command-pipeline.pack.sdp.md`.

Deliverables: 7 Specs, 15 examples (L1-2 as three, L1-3 as two, L1-4, L1-5, L1-6, L1-7 as two, L1-8, L1-9 as two, L1-12, L2-4).

Brief. The parent-side Layer 1 path, full detail. The pipeline is a `workflow` Spec whose flows are the steps in order, each with its citation, and whose Design bullets state the transaction boundary (one top-level mutation; component calls as sub-transactions; no nested `runMutation` on the happy path), the parent's `ctx.auth` use, and what the mutation returns (result, operation ID, affected stream versions). The outcome boundary pins the `ConvexError` data shape and a closed error-code list as one Design bullet per code, and records OQ2 with the dispatcher design as a conditional. Receipts: derive the key exactly as D6 says (tenant, caller namespace, command type, request key), state the fingerprint's inputs and its exclusions, give the conflict semantics, expiry and tombstone rules, and put the read-check-insert in one mutation; the receipts table is a pasteable `defineTable` with the key index. Tenancy: the actor type covers human, service, agent, reviewer and operator; grants are a table read in the transaction, never a read model; namespaces are server-assigned and a client cannot supply one. Declaration: the composition helper takes the declaration and returns a static Convex `mutation` export; say what code generation would emit and that it waits for two real modules.

Cross-package IDs C may reference: `spec:context.context-component`, `spec:context.persistence-adapter`, `spec:context.queries`, `spec:kernel.outcome-model`, all Package A IDs.

### Package D: application

Scope: `specs/application/`, `specs/constraints/`, `specs/operations/`, `specs/application.pack.sdp.md`.

Deliverables: 9 application Specs, 1 operations Spec, 8 constraints, 11 examples (L2-1, L2-2, L2-3 as three, L2-5, L2-6, L2-8, L2-9, ALL-1 as two).

Brief. Layer 2, full detail. Parent use cases: the sequence of a use case that calls two contexts and updates read models in one mutation, how a component's rejection propagates (a `ConvexError` from the sub-transaction rolls that sub-transaction back and, uncaught, the whole mutation; the use case never catches it), the one-receipt rule, and the too-large rule with the honest partial-progress import command. Read models: transcribe the read-need table as rules; the projection contract pins a signature shared by live update and rebuild. Rebuild: the four steps as flows, the missing-row rule, the version-compare rule, the marker rule for counts, and the write pause as a separate contract with the gate document every writer reads; bind to `@convex-dev/migrations` for batching and say what a batch is (one mutation, one cursor, a size below the limits in F13). Restore: a procedure with the invariant checks. Operations: D19's bullets as rules, with the metric list as Design bullets. Constraints: eight, one per Spec, targets as in the inventory; the events-stay-small bound is an `[extension]`. The first experiment: flows for build, run, measure; the example-domain model; OQ4 open.

Cross-package IDs D may reference: `spec:context.context-component`, `spec:context.batch-shaped-api`, `spec:context.queries`, `spec:context.journal`, `spec:kernel.domain-kernel`, `spec:command.command-pipeline`, `spec:command.idempotency-and-receipts`, `spec:command.command-declaration`, all Package A IDs.

### Package E: durable and later layers

Scope: `specs/obligations/`, `specs/effects/`, `specs/processes/`, `specs/agents/`, `specs/advanced/`, `specs/durable-and-later.pack.sdp.md`.

Deliverables: 9 obligation Specs, 3 effect Specs, 3 process Specs, 2 agent Specs, 4 advanced Specs, 20 examples (L3-1 to L3-8, L4-1 to L4-3, L5-1, L5-2 as two, L5-3, L5-4, L6-1 to L6-4).

Brief. Layer 3 at the detail D13 to D15 give, which is most of the way to full: the obligation record as a pasteable table with every field the doc lists, the lifecycle transitions as an `[extension]` rule Spec, the wrapper as a step sequence with the outcome table (success commits effect and completion together; known rejection settles; retryable rolls the body back and records the next attempt; wrapper failure leaves nothing and the sweeper rearms), the sweeper's bound and its scheduling, operator operations with the repair record, retention and restore rules, and the do-nothing check as a decision that names what Probe 7 must show. External effects: claim, call, settle as three functions with signatures; the action runs with no retries of its own (F9) and every retry is the obligation module's (D15); the repetition policy is a closed union. Layers 4 to 6 get trigger, promise, rules, and scenarios only. Every Layer 4 to 6 Spec opens its narrative with `Layer N · Detail: deferred until <trigger>` and its first rule is a `[deferred]` rule naming what the build will write. Do not design the Workflow component's step signatures, the agent module's tables, or the ordered consumer's sequence allocation; name them as deferred.

Cross-package IDs E may reference: `spec:command.command-pipeline`, `spec:command.outcome-boundary`, `spec:command.tenancy-and-authority`, `spec:command.actor-and-scope`, `spec:application.rebuild`, `spec:application.parent-use-cases`, `spec:operations.baseline-operations`, `spec:constraints.bulk-operations-bounded`, all Package A IDs.

## 6. Conventions

### 6.1 Section templates

The templates give the sections each kind must contain. Sections in square brackets are optional. The carrier accepts exactly these headings; section 6.2 lists what it refuses.

Component design Spec (`behavior` or `workflow`, feature altitude):

````md
---
id: spec:<family>.<name>
kind: behavior
altitude: feature
readiness: defined
relations:
  refines: spec:platform.transactional-domain-platform
  dependsOn:
    - spec:...
  constrainedBy:
    - spec:laws....
    - spec:facts....
  decidedBy:
    - spec:decisions....
---
# <Title, plain words, sentence case>

Layer <n> · Detail: <full | proportional | deferred until <trigger>> · Traces: D<n>, Law <n>, F<n>, Sc L<n>-<m>.

<One paragraph: what the component is, what it owns, where its boundary sits.>

## Intent
- actor: <who calls or owns it>
- problem: <the concrete failure it prevents, as a scenario>
- outcome: <the promise, one sentence>
- value: <why the standing cost is worth paying>
- risk: <a standing cost, per decision method rule 2>
- assumption: <a fact or probe it rests on>

### Open questions
- [non-blocking] Extension E-<n>: <what the doc does not rule, and the option taken here>
- [non-blocking] Probe <n> pending: <what it must show>

## Behavior
- rule: <one claim> (D<n>, Law <n>)
- flow: <one step, in order> (D<n>)

## Design
<Paragraphs first: the transaction boundary in words, dependencies, what is deferred.>

- transactionBoundary: <one top-level mutation | component sub-transaction | scheduled mutation | action plus two mutations> (D<n>)
- convexSurface: <the registered functions, one phrase each> (D<n>)
- type<Name>: `<one-line TypeScript>` (D<n>)
- table<Name>: `<one-line defineTable expression>` (D<n>, F13)
- index<Name>: `<.index("name", [...])>` (D<n>)
- errorCode<Name>: <when it is thrown, what it carries> (D<n>)
- limit<Name>: <a number and what it bounds> (F13)
- step<n>: <for sequences that are not flows>
- deferred: <what the build will write, Layers 3 to 6 only>

## Example space
```gwt-vocabulary
Given <step with {slot:type}>
When <exactly one step>
Then <step with {outcome:"a"|"b"}>
```

## Verification — reviewed
- <what a reviewer confirms, one bullet each>
````

`workflow` kind: replace `## Behavior` with `## Workflow`; plain bullets are flows in order; `- rule:` bullets are allowed there too; no `- flow:` key.

Contract Spec (`contract`, story):

```md
## Intent
- outcome: Pin <the surface>.

## Contract
- <one plain bullet per pinned statement> (D<n>)
- [extension] <a statement the doc does not make> (E-<n>)

## Design
- type<Name>: `...`
- fn<Name>: `export const <name> = mutation({ args: { tenantId: v.string(), ... }, returns: ..., handler })`
- table<Name>: `...`
```

Rule Spec (`rule`): `## Intent` with outcome; `## Rule` with plain bullets, one rule each, citation at the end. Bullets never begin with a single word followed by a colon (6.2).

Decision Spec (`decision`): `## Intent` with outcome; `## Decision` with `- context:` once, `- alternative:` repeated (do-nothing first), `- decision:` once, `- rationale:` repeated, `- consequence:` repeated. Provenance as the first narrative line.

Constraint Spec (`constraint`): `## Intent` with outcome; `## Constraints` with exactly one `- statement:`, `- flavor:`, `- target:`, `- measurableBy:`. One constraint per Spec; the carrier accepts no second entry.

Model Spec (`model`): `## Intent` with outcome; `## Model` with `- **term** — definition` bullets, the em dash and the bold required by the carrier, terms unique.

Example Spec (`example`, story):

````md
---
id: spec:<parent>.<slug>
kind: example
altitude: story
readiness: defined
relations:
  refines: spec:<parent>
  verifies: spec:<parent>
---
# <The doc's scenario text>

Sc L<n>-<m> · <domain | simulator | native | end to end> tier.

## Intent
- outcome: <The doc's pass condition, verbatim.> (Sc L<n>-<m>)

```gwt
Given <a vocabulary step with {slot: value}>
When <the vocabulary's When step>
Then <a vocabulary Then step with {outcome: "value"}>
```

## Verification — executable
- Runs in the <tier> tier; every test owns its disposable backend.
- <what the test asserts beyond the Then steps, if anything>
````

The `gwt` fence must sit directly after the Intent bullets and open questions; it is the last thing under `## Intent`.

### 6.2 Carrier rules that bite

Validate enforces these. They were each tried against the CLI on 2026-09-30; the probe corpora are not kept, the findings are.

1. Frontmatter is exactly `id`, `kind`, `altitude`, `readiness`, `relations`. Write `relations: {}` when empty. A relation value is one string or a YAML list.
2. First body line is `# Title`. Everything before the first `##` is narrative and must be plain paragraphs.
3. Recognized `##` headings: `Intent`, one of `Behavior` | `Rule` | `Workflow` | `Contract`, `Example space`, `Constraints`, `Model`, `Design`, `Decision`, `UI`, and `Verification — <manual|reviewed|contract|executable>` with an em dash and spaces. Each at most once. Any other heading is an error, as is a second `#` H1 or a `###` anywhere except `### Open questions` under Intent.
4. Fenced code blocks are refused everywhere except the single ```` ```gwt-vocabulary ```` under `## Example space` and the single ```` ```gwt ```` under an example's `## Intent`. TypeScript and Convex code therefore go in inline code inside a bullet.
5. Tables, blockquotes, ordered lists, `*` or `+` bullets, horizontal rules, indented lines and nested lists are refused in every section. Raw HTML is refused outside inline code, and the guard treats any `<word...>` as HTML. Inside an inline code span angle brackets are content, so write generics as they are in TypeScript: `Promise<AppendResult>`. A code span opens and closes on one line, and an unmatched backtick shields nothing. Comparison operators with spaces around them (`a < b`, `n <= 1000`) are safe anywhere.
6. One bullet is one physical line, however long. A wrapped continuation is a refused nested line. Never run Prettier or another Markdown formatter over `.sdp.md` files.
7. `Intent` bullets are keyed and closed: `actor`, `problem`, `outcome`, `value` once each; `risk` and `assumption` repeatable. Open questions are `- [blocking] text` or `- [non-blocking] text` under `### Open questions`, after the keyed bullets.
8. `Behavior` accepts only `- rule:` and `- flow:` bullets. `Workflow` accepts plain bullets (flows) and `- rule:`. `Rule` and `Contract` accept plain bullets only; a keyed bullet is refused. A plain bullet that begins with one word followed by a colon and a space (`Applied: ...`, `Note: ...`) is parsed as keyed and refused; write `Applied means ...` or `[applied] ...`.
9. `Design` and `UI` take optional paragraphs first, then `- lowerCamelKey: value` bullets with unique keys. A plain bullet, a paragraph after the first bullet, or a fence there is an error.
10. `Constraints` accepts one entry: `statement` (required), `flavor`, `target` (required for `defined`), `measurableBy`. No prose.
11. `Model` accepts `- **term** — definition` only. `Decision` accepts `context`, `decision` once and `rationale`, `alternative`, `consequence` repeated. `Verification — mode` accepts a paragraph plus plain bullets.
12. `Example space` is exactly one `gwt-vocabulary` fence. Slot types are `number`, `string`, `boolean`, or a union of two or more quoted literals: `{outcome:"commits"|"rolls back"}`. A fence has Given steps, exactly one When, and Then steps; `And` continues the previous phase. No blank or indented lines inside a fence.
13. An example's `gwt` fence binds one scalar per slot: `{n: 2}`, `{reason: "empty cart"}`, `{ok: true}`. When the parent owns a space, every step in the example must equal a vocabulary step after slot normalization, phase by phase; an unmatched step or an unbound slot keeps the example below `defined`. When the parent owns no space, steps are free-form but every slot must still be bound.
14. Step text holds no braces other than slots and no `<`. A Convex validator object in a step is a malformed slot.
15. An ID segment is `[A-Za-z0-9][A-Za-z0-9-]*`; a reference to a missing ID is an error; pack `specs` and `modelRefs` must resolve and `modelRefs` must name `model`-kind Specs.

### 6.3 Notation for TypeScript and Convex

One declaration per Design bullet, in inline code, on one line, using the real `convex/server` and `convex/values` syntax so a reader can paste it into `schema.ts` or a function file.

- Types: `- typeOutcome: \`type Outcome<R> = { kind: "applied"; result: R; versions: StreamVersion[] } | { kind: "businessFailure"; result: R; versions: StreamVersion[] }\``
- Interfaces: members separated by `;` inside one pair of braces.
- Functions: `- fnAppend: \`append(ctx: MutationCtx, input: AppendInput): Promise<AppendResult>\``
- Convex functions: `- fnExecute: \`export const execute = mutation({ args: { tenantId: v.string(), scope: scopeValidator, actor: actorValidator, command: v.any() }, returns: outcomeValidator, handler })\``. Name the `args` validators; `handler` alone stands for the body.
- Tables: `- tableEvents: \`events: defineTable({ tenantId: v.string(), contextId: v.string(), streamType: v.string(), streamId: v.string(), streamVersion: v.number(), eventId: v.string(), eventType: v.string(), eventSchemaVersion: v.number(), operationId: v.string(), correlationId: v.optional(v.string()), causedBy: causedByValidator, actor: actorValidator, recordedAt: v.number(), occurredAt: v.optional(v.number()), payload: v.any() }).index("by_stream", ["tenantId", "streamType", "streamId", "streamVersion"]).index("by_event_id", ["tenantId", "eventId"]).index("by_operation", ["tenantId", "operationId"])\``. A long table may be split into `tableX`, `validatorXDoc` and `indexXByY` bullets.
- Index fields are listed in query order: equality fields first, then the range field. State which query uses each index in a following bullet (`indexEventsByStreamUse: replay and expected-version check (D2)`).
- Limits: `- limitOrderLines: <n> lines per PlaceOrder, chosen so one order reads under <m> documents (F13, OQ3)`; a placeholder is written `<product decision>` when the doc says the number is a product decision.
- Sequences that are not flows (inside a contract): `step1`, `step2`, ... keys.

### 6.4 Citing the doc

Every rule, flow, contract bullet and Design bullet ends with a parenthetical citation using the tokens of section 1: `(D6)`, `(Law 4)`, `(F5)`, `(Sc L1-3)`, `(Probe 1)`, `(S9)`, `(OQ2)`, `(Vocab: receipt)`, or several separated by commas. A bullet that carries no citation carries an `[extension]` marker and an E-number instead. The narrative's first line lists the Spec's traces. Relations repeat the traces as graph edges (`decidedBy`, `constrainedBy`), so a query can list which Specs rest on D7 or on an assumed fact.

Quote the doc where its sentence is the rule; paraphrase only to fit one bullet. Do not restate a decision's rationale in a component Spec; the decision Spec carries it and `decidedBy` links it.

### 6.5 Marking extensions and deferrals

An extension is a design claim the doc does not make. Three things, always together: the bullet's text starts with `[extension]` (after the `rule:` or Design key), the citation names the E-number, and the Spec's Intent carries `- [non-blocking] Extension E-<n>: <the ruling needed and the option taken here>`. Rulings the design cannot take provisionally use `[blocking]` and the Spec states `scoped`. Section 10 assigns E-numbers to the extension points the lead already sees; each package owns a numeric range for new ones.

A deferral is detail the doc says the build will write (Layers 3 to 6). Mark it with `[deferred]` at the start of the bullet, add a `deferred:` Design bullet naming what is deferred and the trigger, and open the narrative with `Detail: deferred until <trigger>`. The Spec carries one `[blocking]` open question that names the trigger, which is the Protocol's home for a deferral and what holds the Spec at `scoped`.

The design never resolves an inconsistency it finds in the doc. It records the two readings as a `[non-blocking]` open question on the Spec where it surfaced and picks the reading the acceptance scenarios need, marked `[extension]`.

### 6.6 Vocabulary

Use the doc's terms as `spec:platform.vocabulary` fixes them. Stream version, never revision. Obligation for the record, effect for the change it makes, attempt for one try. Receipt for the stored idempotency outcome. Generation for a numbered read-model build. Where a Convex term and a doc term differ, the doc's word names the design concept and the Convex word names the mechanism (`obligation` is the record, `scheduled function` is the dispatch).

## 7. Review rubric

Reviewers judge the merged corpus. Each item is checkable; an item that fails names the Spec and line.

Fidelity to the decisions document:

1. Every decision (D1 to D19), law, fact, probe, scenario and open question of the doc appears in the corpus, and a recipe-6 concept search for its number finds it.
2. Every rule in a component Spec traces to a citation that says what the rule says; spot-check ten citations per package against the doc's text.
3. No Spec overrules the doc. Every claim beyond it is marked `[extension]` with an E-number and an open question; the register in section 10 (or README) lists it.
4. Rejected options in the doc are not silently reintroduced (sagas between local contexts, a command bus, a lock protocol, a nested mutation per command, full-result receipts, a global event position, a central event store, telemetry that vetoes writes).
5. Detail follows the build: Layers 0 to 2 have signatures, tables, indexes, boundaries, error taxonomy, sequences and limits; Layer 3 has what D13 to D15 give; Layers 4 to 6 have trigger, promise, rules and scenarios and are marked deferred.
6. The do-nothing option appears first among alternatives in every decision Spec, and the cost line (writes per command, registered functions, tables, lifecycle states, operator duties) is present.

SDP conformance:

7. `validate` exits 0 with zero errors and zero warnings.
8. Recipe 7 returns an empty array; every stated readiness is earned by the floor. No Spec states `ready`.
9. Every example `refines` and `verifies` its parent; Layer 0 to 3 examples bind points in the parent's space; recipe 3 on a sample of parents shows the expected verifiers.
10. Packs list every Spec of their package in order, carry `modelRefs: [spec:platform.vocabulary]`, and recipe 5 shows no unresolved members.
11. The section templates hold: keyed Design bullets, one constraint per Spec, model terms in the required form, decisions with context, alternatives, decision, rationale, consequences.
12. IDs match the inventory in 3.4. Renamed or added IDs are recorded in README's ID changes list.

Internal consistency:

13. One type per concept: the `Outcome` union is defined once (kernel) and referenced elsewhere; the event envelope once (context); the actor once (command); the obligation record once (obligations). Duplicated definitions with different fields are a failure.
14. The tables named in one Spec are the tables read in another: the receipts index supports the pipeline's lookup; the streams and events indexes support the adapter's version check and the rebuild's fold; the obligations indexes support the sweeper's scan.
15. Vocabulary is consistent across packages (6.6) and no Spec uses a term the vocabulary rejects.
16. Every `dependsOn` is a real dependency the text uses; every cited law and fact appears in `constrainedBy`.
17. The step sequences agree: the pipeline's steps call the adapter's steps at the documented point; the wrapper's steps call the pipeline's nested-body form D7 allows.

Completeness:

18. All 43 scenario rows of the doc have examples per section 4, with the enumerated cases split into siblings.
19. Every component in section 2 has its Specs; every Spec in 3.4 exists.
20. Every open question of the doc (OQ1 to OQ6) is recorded on the Spec section 3.4 assigns it to.
21. Every assumed fact (F17; F14 and F15 until their probes ran in slice S0) states `scoped` behind a `[blocking]` question that names its probe, is named as an `assumption` or open question on each Spec that relies on it, and has its probe in the probe plan. F16 was found documented and states `defined`.

Convex correctness, checked against the sources the doc lists (S1 to S15) and the recheck in section 9, never from memory:

22. Every write the design describes happens inside a mutation; actions only call mutations, and each such call is its own transaction (F10). No design step assumes an action's writes are atomic with anything.
23. Component calls are `ctx.runMutation` or `ctx.runQuery` on the component's API; the design states that each is an isolated sub-transaction that commits with the caller and rolls back on throw (S2). Helpers are used inside a boundary, nested calls only across it or for deliberate partial rollback (S10).
24. No component function reads `ctx.auth` or environment variables; actor and scope arrive as arguments (F11).
25. Every function on tenant data has `tenantId` in its `args` validators (Law 11), and every index on tenant data leads with `tenantId`.
26. Indexes: at most 32 per table and 16 fields each (S9); field order matches the described query; no ordering claim rests on `_creationTime` (D2).
27. The expected-version check is an indexed read inside the mutation; the design distinguishes a logical version conflict from an engine OCC retry, and scenario L1-11's example encodes that distinction.
28. Document size: one-document-per-stream state and read-model rows state a budget under 1 MiB and name the fallback (E-2).
29. Every batch (backfill, sweeper, fan-out, retention) states a bound below the transaction limits (32,000 documents scanned, 16,000 written, 16 MiB read and written, 4,096 index ranges) and treats those limits as ceilings (D19).
30. Scheduling: `ctx.scheduler` calls from a mutation commit with it (F8); at most 1000 per mutation; a scheduled action is never retried by Convex (F9), so external calls are claim, call, settle with retries owned by the obligation module; scheduled functions carry no auth, so the obligation record carries authority (D13).
31. `_scheduled_functions`: the design uses only the documented states (Pending, InProgress, Success, Failed, Canceled) and the 7-day retention, and never assumes `cancel` stops an in-flight action.
32. Restore: backups exclude pending scheduled functions (F12), so restore rebuilds dispatch from obligations and starts with dispatch off (D19).
33. `ConvexError`: rejection data uses values the `v` validators accept; the design states that a throw in a mutation prevents the commit and that data intact across a component boundary is F14, probed by Probe 2.
34. Reactivity of a parent query over a component query is stated as F15, documented and probed by Probe 5.
35. Workflow component: only waits and external effects are steps; per-step retries are off or ownership is passed deliberately; the definition version is saved at start; deploy behavior is stated as trigger and promise (D16). `@convex-dev/migrations`: a batch is a checkpointed mutation, so backfill versus live commands is an OCC race per batch (D9, Probe 6).
36. Timeouts: queries and mutations have 1 second; the max-lines limit and every per-command bound respect it; actions have 30 minutes (Convex runtime) or 10 minutes (Node).

Polish:

37. Titles in sentence case and plain words; one claim per bullet; no bullet without a citation or marker.
38. Prose uses the doc's vocabulary and no synonyms for locked terms; no filler; no em dashes in prose (carrier syntax excepted).
39. `sdp view` renders every page; the Design Review index reads as a component map; README matches the corpus (IDs, tables, the expected validate output).
40. A reader who knows Convex can implement Layer 0 to 2 from the Specs alone; a reviewer who knows the doc can find every decision in the graph in one query.

## 8. README.md template

Package A writes `design/README.md` with these sections, in this order, and updates it after the final review round if IDs changed:

1. What this is: one paragraph; the doc is the source of truth for content, the corpus is the design, the Design Review is the rendering.
2. How to read: run `view`, open `generated/design-review/index.md`; the recipes to run for questions.
3. How to validate: the commands from section 0 and the expected output.
4. The component map: section 2's table with each component linked to its Spec file(s).
5. The layers and packages: which families and packs carry each layer.
6. The numbering key (section 1) and the scenario table (section 4) with links to example files.
7. The extension register (section 10) as maintained by the packages.
8. Open questions for the owner: the doc's open questions and section 11 with their provisional readings. The full register, by Spec, is recipe 20 of the Protocol's catalog and is derived, not kept.
9. ID changes: any inventory ID that was renamed, split or added, with the reason.

## 9. Convex facts rechecked on 2026-09-30

The lead read these pages during planning. Authors cite them through the F-tokens and re-verify before citing a number; reviewers check item 22 to 36 against them. Wording in quotes is the page's.

- Limits (S9, `docs.convex.dev/production/state/limits`): document 1 MiB, 1024 fields, nesting 16, arrays 8192 elements; per transaction 16 MiB read, 16 MiB written, 32,000 documents scanned, 4,096 index ranges read, 16,000 documents written; function argument and return 16 MiB; query and mutation timeout 1 second; action timeout 30 minutes in the Convex runtime and 10 minutes in Node; scheduling 1000 functions per mutation, 4 MiB per scheduled argument set, 16 MiB total per mutation, 1,000,000 outstanding; 32 indexes per table, 16 fields per index, 10,000 tables. The page states no limit on nested `runQuery` or `runMutation` calls per function, so Probe 4 stands.
- Scheduling (S6): "if the mutation succeeds, the scheduled function is guaranteed to be scheduled. On the other hand, if the mutations fails, no function will be scheduled." Scheduled mutations "are guaranteed to be executed exactly once. Convex will automatically retry any internal Convex errors, and only fail on developer errors." Actions "are not automatically retried by Convex. Thus, actions will be executed at most once, and permanently fail if there are transient errors." `_scheduled_functions` has `name`, `args`, `scheduledTime`, `completedTime`, `state`; states Pending, InProgress, Success, Failed, Canceled; "Scheduled function results are available for 7 days after they have completed." "The auth is not propagated from the scheduling to the scheduled function." Cancel: "If it hasn't started running, it won't run. If it already started, it will continue to run, but any functions it schedules will not run." F16 therefore moves from assumed to documented; Package A records the recheck on `spec:facts.f16-...`.
- Backup and restore (S8): backups exclude code and configuration, pending scheduled functions and environment variables; restore "is a destructive operation that wipes your existing data and replaces it with that from the backup." The page does not say what restore does to component data or to the scheduler; Probe 7 keeps that question.
- Application errors (`docs.convex.dev/functions/error-handling/application-errors`): `ConvexError` carries `data` of any value the validators accept; "In mutations, throwing an error will prevent the mutation transaction from committing"; the exception bubbles through `runQuery`, `runMutation` and `runAction`; the client reads `error.data`. Data intact across a component boundary is not stated on the page, so F14 stays assumed and Probe 2 stands.
- Components (S2): "Each mutation call to a component is a sub-transaction isolated from other calls, allowing you to safely catch errors thrown by components"; a thrown exception "will always roll back the component's sub-transaction"; "Data changes commit transactionally across calls to components"; "Code inside a component can't read data that is not explicitly provided to it. This includes database tables, file storage, environment variables, scheduled functions, etc."
- Best practices (S10): nested calls in a mutation "have extra overhead compared to plain TypeScript functions"; "If you want partial rollback on an error, you will want `ctx.runMutation` instead of a plain TypeScript function"; components require `ctx.runQuery` or `ctx.runMutation`; from an action, "Each `ctx.runMutation` or `ctx.runQuery` runs in its own transaction."
- Workflow component (S11, product page): "Workflow state is persisted to the Convex database after each step completes successfully"; on interruption "the workflow will resume from the last successfully completed step"; retry behavior is configurable per step with a default policy; workflows can be cancelled and delayed. The product page says nothing about determinism, deploy behavior, or journal limits; Package E names those as deferred and the reviewer of item 35 checks the component's README before accepting any claim about them.
- Migrations component (product page): batches with saved progress, resumes "from the last checkpoint if a timeout occurs", runs on all documents of a table or a specified subset, exposes state through queries. Batch size configuration is not on the product page; Package D states the batch bound as a design choice under F13.

## 10. Extension register

Extension points the lead already sees. Each package adds new ones inside its range and records them in README section 7.

| E | Spec | What the doc leaves open | Package |
|---|---|---|---|
| E-1 | `spec:kernel.initial-state` | `initial()` versus evolve from an empty state (D3, gap 1) | B |
| E-2 | `spec:kernel.state-document-mapping` | the mapping when state spans documents; the size budget (D3 gap 2, OQ3) | B |
| E-3 | `spec:context.tables` | concrete tables, indexes beyond the three the doc names, the deleted-subject marker | B |
| E-4 | `spec:command.receipt-table` | concrete receipt fields, expiry defaults, tombstone shape (D6) | C |
| E-5 | `spec:command.outcome-boundary` | the error-code list and `ConvexError` data shape (D4, D7) | C |
| E-6 | `spec:command.actor-and-scope` | the actor and scope types, the grants table (D11) | C |
| E-7 | `spec:command.command-declaration` | the composition helper's signature (D12) | C |
| E-8 | `spec:application.generation-registry`, `spec:application.write-pause` | the registry, marker and gate documents (D9) | D |
| E-9 | `spec:application.projection-contract` | the projection signature and row conventions (D8) | D |
| E-10 | `spec:obligations.lifecycle-transitions`, `spec:obligations.record-contract` | allowed transitions; the concrete table (D13) | E |
| E-11 | `spec:effects.claim-call-settle` | the three function signatures and the policy union (D14) | E |
| E-12 | `spec:constraints.events-stay-small` | the payload byte bound (D19) | D |

Ranges for new extensions: B uses E-20 to E-29, C uses E-30 to E-39, D uses E-40 to E-49, E uses E-50 to E-59. A adds none.

## 11. Ambiguities that need a human ruling

Recorded here and in README section 8. The corpus proceeds on the provisional reading shown; nothing is silently decided.

1. Vocabulary clashes (OQ6). The doc says to pick one meaning of "receipt" and "generation" before code names them. Provisional: receipt is the stored idempotency outcome; the row that proves an effect happened is "completion evidence"; generation is a numbered read-model build; an attempt number is "attempt".
2. Facts as constraints (OQ5). The plan maps ledger rows to `constraint` Specs with an evidence-status target. Confirm, or choose `rule` Specs instead; the change is mechanical.
3. Plan-imposed numbering. F1 to F17, Sc L0-1 to ALL-1, OQ1 to OQ6 and E-numbers exist only in this plan. The doc should adopt them or the citations stay plan-relative.
4. Refused-command records (OQ2). Whether security audit or agent proposals need a record of refusals decides whether the generic internal dispatcher of D7 exists. The design carries it as a conditional.
5. Trivial contexts as plain tables (OQ1). The design assumes a component per context everywhere; the experiment decides.
6. One document per stream and the maximum order size (OQ3). The design assumes one document per stream and leaves the maximum lines as a product number with a placeholder.
7. Where the experiment lives (OQ4). Not decided by the corpus.
8. Readiness. No agent states `ready`. After consensus the owner may state it on Layer 0 to 2 Specs whose floor clears; recipe 9 lists the floor per Spec.
9. `verifies` on examples before tests exist. Settled by the Protocol on 2026-10-01: an unbound example below `ready` no longer warns, so the trace is kept at no cost.
10. Layer 3 depth. The doc says Layer 3 is written from what the experiment shows; the plan lets D13 to D15 be carried at `defined` now because the doc is specific there. Confirm that this does not pre-empt the experiment.
11. F16 changes status. The lead read S6 on 2026-09-30 and found the states and the 7-day retention documented. The doc itself is not edited by this effort; the corpus records the recheck. The owner decides whether the doc follows.
12. The doc's fact F4 says the size of the nested-call overhead is unknown, and Probe 3 measures it. Layer 1's design puts every context read behind a component call. If the probe shows a cost that breaks the read budgets, OQ1's answer changes the context component's shape; the design flags the dependency on `spec:context.context-component` and does not pre-decide it.
