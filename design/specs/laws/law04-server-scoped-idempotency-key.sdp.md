---
id: spec:laws.law04-server-scoped-idempotency-key
kind: rule
altitude: feature
readiness: defined
relations:
  refines: spec:platform.transactional-domain-platform
  decidedBy: spec:decisions.d06-idempotency-client-and-receipts
---
# A retryable command carries a server-scoped idempotency key

Law 4 · Detail: verbatim · Traces: Law 4; detailed by D6.

The twelve laws of v0.1, one reworded, are the review surface; the decisions give the detail. This is the one law the review reworded. v0.1 required a client request key and a receipt on every public command; D6 narrows the requirement to callers the Convex client's exactly-once guarantee does not reach, because the React client retries a mutation until it is confirmed and the backend executes each call once. Component Specs that cite this law point `constrainedBy` at it, so the graph answers which designs it bounds.

## Intent

- outcome: Every command that a caller can retry outside the Convex client's own retry carries an idempotency key the server builds and scopes (Law 4)
- value: Retries from HTTP actions, webhooks, workers, workflow steps and agents produce one business effect and one stored outcome, while UI commands lean on the client guarantee Convex already gives (Law 4, D6)

## Rule

- Every command a caller can retry outside the Convex client's own retry carries a server-scoped idempotency key. Reworded, see decision 6. (Law 4)
- D6 reworded this law: the Convex React client already retries a mutation until it is confirmed and the backend executes each call once, so the key is required only where that guarantee does not reach, and the wording above is the reworded sentence (Law 4, D6, F5)
