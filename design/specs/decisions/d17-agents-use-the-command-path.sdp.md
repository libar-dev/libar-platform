---
id: spec:decisions.d17-agents-use-the-command-path
kind: decision
altitude: feature
readiness: defined
relations:
  refines: spec:platform.transactional-domain-platform
  dependsOn:
    - spec:decisions.d11-tenant-scope-and-authority
    - spec:decisions.d16-processes-use-workflow
---
# Agents call the same command path

Provenance: carried from v0.1. Feature · Trigger: a model's judgment is part of a product capability · Traces: D17, D11, D16, Law 1, Law 5, Law 12, Thesis, Sc L5-1, Sc L5-2, Sc L5-3, Sc L5-4.

Agent reasoning produces a structured proposal. A deterministic policy checks it, a human approves where policy says so, and the ordinary command boundary executes it. An agent cannot write state or journals, choose a system namespace, grant itself rights or create approvals. Untrusted input cannot widen its server-side capabilities. Each run is bounded, and a paid call reserves budget before dispatch and settles once from evidence. The decision depends on D11 for the authority vocabulary and on D16 for the approvals it reuses. Layer 5 stays at trigger, promise, rules and scenarios.

## Intent

- problem: An agent proposes a valid-looking unauthorized command; proposal input changes after approval or the run exceeds its budget; a paid call times out and usage arrives later; a retrieved document tries to widen the agent's rights (Sc L5-1, Sc L5-2, Sc L5-3, Sc L5-4)
- outcome: Agent reasoning produces a structured proposal that a deterministic policy checks, a human approves where policy says so, and the ordinary command boundary executes, with bounded runs and provider accounting that settles once from evidence (D17)
- value: The reasoning can be replaced while authority, command correctness and provider accounting stay deterministic (D17, Thesis)
- risk: The standing cost is an agent module that owns runs, proposals, provider attempts and its own audit, plus budget reservation and reconciliation as operator duties (D17)

## Decision

- context: The concern is a model's judgment inside a product capability; Convex gives the same command boundary, authority and obligations the rest of the platform uses, and nothing that makes an agent special (D17, D11, D13)
- alternative: Do nothing beyond Convex: let the agent call mutations directly under the user's rights; rejected, because an agent cannot write state or journals, choose a system namespace, grant itself rights or create approvals, and a direct path is a bypass path (D17, Law 1, Sc L5-1, Decision method rule 2)
- alternative: Let reported model confidence stand in for authorization; rejected, because model confidence is advisory and no reported confidence overrides a human-only rule (D17)
- alternative: Proposal, deterministic policy, human approval where required, and the ordinary command boundary; this is the option chosen (D17)
- decision: Agent reasoning produces a structured proposal; a deterministic policy checks it, a human approves where policy says so, and the ordinary command boundary executes it; an agent cannot write state or journals, choose a system namespace, grant itself rights or create approvals; untrusted input cannot widen its server-side capabilities; the agent module owns runs, proposals, provider attempts and its own audit, not the business objects it acts on (D17)
- rationale: Untrusted input, such as a retrieved document or a hostile prompt, cannot widen server-side capabilities because capabilities are decided by policy and grants, never by the input (D17, Law 5, Sc L5-4)
- rationale: A provider retry may cost money even when the domain command is idempotent, so database idempotency does not give exactly-once billing (D17, Law 12)
- consequence: Each run has bounds on spend, attempts, elapsed time and tool or command calls (D17, Sc L5-2)
- consequence: A paid call reserves budget before dispatch and settles once from evidence; concurrency slots and money are separate resources (D17, Sc L5-3)
- consequence: A timed-out lease proves nothing about the provider, unknown cost is never released as zero, and an uncertain call still gets reconciliation and an operator exit so its slot is not lost for good (D17, Sc L5-3)
- consequence: A paid call records provider and model, input artifact versions or a protected payload reference, request fingerprint, prompt and policy version, attempt identity and observed usage, within what the product's data policy allows (D17)
- consequence: Model confidence is advisory; risk policy depends on action kind, scope, value, reversibility, provenance and measured model performance (D17)
- consequence: The standing cost is the agent module's tables for runs, proposals, attempts and audit, budget reservation per call, and reconciliation duties (D17)
