---
id: spec:platform.transactional-domain-platform
kind: behavior
altitude: epic
readiness: defined
relations:
  constrainedBy:
    - spec:laws.law01-sanctioned-writes-only
    - spec:laws.law02-state-and-events-commit-together
    - spec:laws.law03-events-only-source-of-state
    - spec:laws.law04-server-scoped-idempotency-key
    - spec:laws.law05-authorization-before-execution-and-disclosure
    - spec:laws.law06-technical-failure-never-a-rejection
    - spec:laws.law07-deferred-work-never-reported-early
    - spec:laws.law08-durable-capability-ships-operations
    - spec:laws.law09-no-invariant-on-late-read-model
    - spec:laws.law10-replay-never-runs-commands-or-effects
    - spec:laws.law11-tenant-scope-named
    - spec:laws.law12-one-retry-owner
---
# Convex transactional domain platform

Epic · Detail: full transcription · Traces: Thesis, Law 1 to Law 12, D1 to D19, OQ5.

The platform is a greenfield redesign of a transactional domain platform on Convex. Its source of truth is the decisions document of 2026-09-29, working notes that record nineteen decisions, the reason for each, the Convex facts they rest on, the probes that would settle the assumed facts, and the acceptance scenarios that test the whole. The owner has ruled on none of the decisions; the corpus carries proposals. This Spec carries the thesis and the success criterion. Its children carry the layers and profiles, the decision method, the acceptance contract, the rules for existing systems and the vocabulary; the laws, the decisions and the fact ledger refine it as their own families.

Ownership follows bounded contexts. Atomicity follows the business operation. Asynchrony follows a concrete need to defer work. The default operation is one Convex mutation that authorizes a command, makes the domain decision, saves current state with its events, updates essential read models and records the outcome; a second transaction exists only to wait, to spread load, or to reach an external system. The design succeeds when adding domain sophistication does not add infrastructure.

Citations in this corpus use the tokens the plan fixes: D for a decision, Law for a law, F for a fact, Probe, S for a source, Sc for a scenario, OQ for an open question and E for a design extension. Parts of the doc the plan does not number are cited by section name: Thesis, Decision method, Fact ledger, Acceptance scenarios, First experiment, Existing systems, Vocabulary, Sources.

## Intent

- actor: The platform maintainers who build Layers 0 to 2 first, and the application teams who then add a bounded context, a command, a use case or a read model (Thesis)
- problem: Adding a domain capability to today's platform adds a queue, a projection job, a registry or a governance table before it adds a business rule, and each of those then needs its own recovery, inspection and retention; a maintainer cannot trace one command's success or failure without unrelated machinery (Thesis, Decision method rule 7)
- outcome: Adding domain sophistication does not add infrastructure: one mutation per business operation, contexts that own their state and journal, and layers each usable before the next exists (Thesis)
- value: A new feature needs only its domain input, events and decision, one command or use-case binding, and the read model it actually uses; a maintainer traces its success and failure without unrelated queue, agent or governance registries (Thesis)
- risk: Every read of context data from the parent is a component call whose cost the first experiment must measure; if it breaks the read budgets, the shape of the context component changes before Layer 3 is designed (D2, Probe 3, OQ1)
- risk: Nothing has run yet; the sources support the Convex facts, not the correctness or performance of the design (Sources)
- assumption: Mutations are serializable under optimistic concurrency, and component calls commit or roll back with the calling mutation (F1, F2)
- assumption: One ledger fact is still assumed, and three that the doc lists as assumed are rechecked or probed in the corpus; each Spec that rests on one names it and the probe plan names the probe (F14, F15, F16, F17)

### Open questions

- [non-blocking] OQ5 asks whether the decisions move into SDP carriers; this corpus is that move, with ledger facts as constraint Specs, decisions as decision Specs that list the do-nothing option first, and scenarios as example Specs under the component that provides the capability; the owner confirms the mapping or chooses rule Specs for facts, which is a mechanical change (OQ5)

## Behavior

- rule: Ownership follows bounded contexts (Thesis)
- rule: Atomicity follows the business operation (Thesis)
- rule: Asynchrony follows a concrete need to defer work (Thesis)
- rule: The default operation is one Convex mutation that authorizes a command, makes the domain decision, saves current state with its events, updates essential read models and records the outcome (Thesis, D1)
- rule: A second transaction exists only to wait, to spread load, or to reach an external system (Thesis, D13)
- rule: The design succeeds when adding domain sophistication does not add infrastructure (Thesis)
- rule: The twelve laws are the review surface; the decisions give the detail (Laws)
- rule: Every mechanism is a decision whose first option is the do-nothing option that relies on Convex as it is, and only a failing acceptance scenario justifies a mechanism (Decision method rule 2, Decision method rule 3)
- rule: Layers 0 to 2 get full detail now; Layer 3 is written from what the first experiment shows; Layers 4 to 6 stay as a trigger, a promise and their scenarios until something triggers them (Decision method rule 4)
- rule: The design authorizes no deletion or migration of existing data (Existing systems)

## Verification — reviewed

- A reviewer confirms that every decision D1 to D19, every law, fact, probe, scenario and open question of the doc appears in the corpus and that a concept search for its token finds it.
- A reviewer confirms that no Spec overrules the doc and that every claim beyond it carries an extension marker with an E-number and an open question.
- A reviewer confirms that the rejected options of the doc are not reintroduced anywhere: sagas between local contexts, a command bus, a lock protocol, a nested mutation per command, full-result receipts, a global event position, a central event store, telemetry that vetoes writes.
