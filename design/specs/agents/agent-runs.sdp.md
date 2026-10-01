---
id: spec:agents.agent-runs
kind: behavior
altitude: feature
readiness: scoped
relations:
  refines: spec:platform.transactional-domain-platform
  dependsOn:
    - spec:command.command-pipeline
    - spec:command.tenancy-and-authority
    - spec:processes.approvals
    - spec:effects.external-effects
  constrainedBy:
    - spec:laws.law01-sanctioned-writes-only
    - spec:laws.law05-authorization-before-execution-and-disclosure
    - spec:laws.law12-one-retry-owner
  decidedBy: spec:decisions.d17-agents-use-the-command-path
---
# Agent runs

Layer 5 · Detail: deferred until a model's judgment is part of a product capability · Traces: D17, D11, D16, Law 1, Law 5, Law 12, Sc L5-1, Sc L5-2, Sc L5-4.

Agent reasoning produces a structured proposal. A deterministic policy checks it, a human approves where policy says so, and the ordinary command boundary executes it. An agent cannot write state or journals, choose a system namespace, grant itself rights or create approvals, and untrusted input cannot widen its server-side capabilities. The agent module owns runs, proposals, provider attempts and its own audit, not the business objects it acts on. Each run is bounded. The module's tables, the proposal schema and the policy engine are written on the trigger; a paid provider call is an external effect under the obligation module.

## Intent

- actor: An agent run that proposes; the deterministic policy that checks; the human who approves where required; the command pipeline that executes (D17)
- problem: An agent proposes a valid-looking unauthorized command; proposal input changes after approval or the run exceeds its budget; a retrieved document or a hostile prompt tries to widen the agent's rights; a direct path from the model to a mutation would be a bypass (Sc L5-1, Sc L5-2, Sc L5-4, D17)
- outcome: Every agent action is a proposal checked by policy, approved where policy says so, and executed by the ordinary command boundary under the ordinary authority, with bounded runs and untrusted input that cannot widen capabilities (D17, Law 1, Law 5)
- value: The reasoning can be replaced while authority, command correctness and provider accounting stay deterministic (D17, Thesis)
- risk: The standing cost is an agent module with tables for runs, proposals, attempts and audit, budget reservation per paid call, and reconciliation as an operator duty (D17)
- assumption: A paid provider call is claimed, called and settled as an external effect, so its retry owner and its evidence are the obligation module's (D17, D14, D15)

### Open questions

- [non-blocking] The trigger has not fired; the run, proposal and attempt tables, the proposal schema, the policy engine's inputs and the provider adapters are deferred to the build (D17, Decision method rule 4)
- [non-blocking] OQ2 dependency: whether a rejected agent proposal must be recorded as a fact decides whether the generic internal dispatcher of D7 is needed at the agent boundary; the design carries it as a conditional (OQ2, D7)

## Behavior

- rule: [deferred] The build writes the agent module's tables, the proposal schema, the policy engine, the provider adapters and the run bounds on the trigger that a model's judgment is part of a product capability (D17, Decision method rule 4)
- rule: Agent reasoning produces a structured proposal; a deterministic policy checks it, a human approves where policy says so, and the ordinary command boundary executes it (D17)
- rule: An agent cannot write state or journals; every write it causes goes through a context's sanctioned operations by way of the command pipeline (D17, Law 1)
- rule: An agent cannot choose a system namespace; its commands carry the `agent` caller namespace the server assigns (D17, D11)
- rule: An agent cannot grant itself rights or create approvals; grants are authoritative data read by the parent and approvals are made by authorized people (D17, Law 5)
- rule: Untrusted input, such as a retrieved document or a hostile prompt, cannot widen the agent's server-side capabilities, because capabilities come from policy and grants, never from the input (D17, Sc L5-4)
- rule: The agent module owns runs, proposals, provider attempts and its own audit, not the business objects it acts on (D17)
- rule: Each run has bounds on spend, attempts, elapsed time and tool or command calls, and a run past any bound is blocked from further execution (D17, Sc L5-2)
- rule: A proposal whose input changed after approval is a different proposal and its approval is void (D17, D16)
- rule: Model confidence is advisory; risk policy depends on action kind, scope, value, reversibility, provenance and measured model performance, and no reported confidence overrides a human-only rule (D17)
- rule: A paid call is an external effect with one retry owner; a provider retry may cost money even when the domain command is idempotent, so database idempotency does not give exactly-once billing (D17, D15, Law 12)
- rule: A rejected proposal is refused through the outcome boundary; if the product needs the refusal on record it is a business fact written through the normal path (D17, D7, OQ2)

## Design

The agent boundary is the command pipeline. A proposal is data; executing it is a command with the agent's actor, the `agent` namespace, a receipt and an operation ID. Budgets are `spec:agents.budget-accounting`.

- transactionBoundary: proposal, policy check and approval are records; execution is one top-level mutation through the command pipeline; provider calls are external effects (D17, D1, D14)
- deferred: the run, proposal and attempt tables, the proposal schema, the policy engine, the provider adapters and the audit shape, written by the build on the trigger (D17)

## Verification — reviewed

- A reviewer confirms that no rule here gives an agent a write path other than the command pipeline, and that no table or schema is designed before the trigger (D17, Law 1).
- A reviewer confirms that every capability claim is decided by policy and grants and never by proposal content (Law 5, Sc L5-4).
