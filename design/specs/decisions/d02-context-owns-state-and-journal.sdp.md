---
id: spec:decisions.d02-context-owns-state-and-journal
kind: decision
altitude: feature
readiness: defined
relations:
  refines: spec:platform.transactional-domain-platform
  constrainedBy:
    - spec:facts.f02-component-calls-commit-with-caller
    - spec:facts.f04-nested-calls-cost-more-than-helpers
---
# Each bounded context owns its state and its journal

Provenance: carried from v0.1. Feature · Traces: D2, Law 1, Law 2, F2, F4, Probe 3, OQ1, Sc L1-1, Sc L1-10, Sc L1-11.

Each context is a component that owns its current state, its event journal and its stream metadata, all written by the context's own mutations. Journal code is a shared library each context includes; there is no central event-store component and no deployment-wide counter in every write's path. The rule that state never changes without its events is enforced inside the context API, so trusted parent code cannot break it by mistake. The event envelope and the order and identity rules are carried here as consequences; Package B pins them as contracts.

## Intent

- problem: A central event store with a global position puts a counter in every write's path, and a journal that any parent code can write lets state change without its events; the invalid-transition, stale-version and competing-commands scenarios need the context to be the only writer of its state (Sc L1-1, Sc L1-10, Sc L1-11)
- outcome: Each context owns its CMS, journal and stream metadata behind a component boundary, and every event carries the envelope that ties it to its stream, operation, cause and actor (D2)
- value: Isolation is the platform's defining property: a context's private schema stays private, cross-context references use application IDs, and no global feed or counter has to exist for the core path (D2)
- risk: Every read of context data from the parent is a component call, measured by the first experiment on the local backend with every cost target held; its function-call quota is a hosted usage reading (D2, F4, Probe 3, OQ1)
- risk: There is no global event order; cross-context history is merged through context APIs (D2)
- assumption: Component calls commit or roll back with the calling mutation (F2)
- assumption: Nested calls cost more than helper calls, by an amount not yet measured (F4)

### Open questions

- [non-blocking] Probe 3: the latency of one component call is measured and keeps every context a component; its function-call quota is a hosted usage reading, and isolation itself stays (Probe 3, D2, OQ1)
- [non-blocking] OQ1: a trivial context with no invariants of its own stays a component; the owner answered OQ1 on the first experiment's local measurement, and a measured workload that misses an agreed target, or a hosted usage reading above an agreed share, reopens it (OQ1, D2)

## Decision

- context: The concern is ownership of current state, events and stream metadata, and the order and identity of events; Convex gives components whose tables the parent cannot read except through the component's own functions, and gives a commit timestamp that orders committed transactions, whose reader's upper bound is outside the pinned public API, so this design keeps no global position (D2, F2, F18)
- alternative: Do nothing beyond Convex: plain tables in one deployment with a shared journal table any function may write; rejected as the default, because the rule that state never changes without its events cannot be enforced against trusted parent code, and OQ1 is answered with a component for every context (D2, Law 1, Law 2, OQ1, Decision method rule 2)
- alternative: A central event-store component with a global position; rejected, because it puts a deployment-wide counter in every write's path, and a global feed comes back only when a real consumer needs one total order (D2, D18)
- alternative: One journal library shared as code by every context, each context owning its own tables; this is the option chosen (D2)
- decision: Each context is a component that owns its CMS, its event journal and its stream metadata, all written by the context's own mutations; journal code is a shared library each context includes; there is no central event-store component (D2)
- rationale: The rule "state never changes without its events" is enforced inside the context API, so trusted parent code cannot break it by mistake (D2, Law 2)
- rationale: No deployment-wide counter sits in every write's path (D2)
- consequence: Ownership is fixed: CMS, journal events and stream metadata belong to the context, where the metadata may live in the CMS document while enumeration and deletion stay correct; command receipts belong to the parent; access grants belong to the parent or a dedicated access context (D2)
- consequence: Every event carries the envelope: `eventId` as stable application identity; `tenantId` and `contextId` as ownership scope; `streamType`, `streamId` and `streamVersion` as exact order within one subject's history; `eventType` and `eventSchemaVersion` as historical contract; `operationId` as the root command or use case that produced it; `correlationId` for diagnostic grouping across operations; `causedBy` as the immediate cause, a command or a triggering event; `actor` as the server-established actor kind, identity and delegation reference; `recordedAt` and optional `occurredAt`; `payload` as validated, bounded fact data (D2)
- consequence: An append names the stream version it expects; the check is an indexed read in the same transaction, because an index alone is not a unique constraint (D2, F1)
- consequence: Order within the platform exists only within a stream; Convex documents a commit timestamp that orders committed transactions across the deployment, which orders transactions and not the events of one, so `_creationTime`, `recordedAt` and UUID order never prove that a consumer has seen every committed event, and whether an ordered consumer takes the commit timestamp as its position is decided with D18's consumer (D2, D18, F18)
- consequence: Events in different streams relate through `operationId` and `causedBy`, and a receipt may list the stream versions one operation touched (D2)
- consequence: A reference that crosses a context boundary is `(tenantId, contextId, eventId)`, never a private document ID; context APIs return DTOs and application IDs (D2)
- consequence: The starting indexes are stream replay, event identity and stream enumeration; others are added when a real query needs them (D2)
- consequence: There is no global event order; cross-context history is merged through context APIs, and a global feed returns only when a real consumer needs one total order, with the commit timestamp as the candidate token (D2, D18, F18)
- consequence: The standing cost is one component per context with its own tables and functions, and one component call per parent read of context data, whose cost the first experiment measures (D2, F4, Probe 3)
