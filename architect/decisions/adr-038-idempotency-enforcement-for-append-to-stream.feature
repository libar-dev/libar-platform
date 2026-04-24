@architect
@architect-adr:038
@architect-adr-status:accepted
@architect-adr-category:architecture
@architect-pattern:ADR038IdempotencyEnforcementForAppendToStream
@architect-status:completed
@architect-completed:2026-04-22
@architect-release:vNEXT
@architect-quarter:Q2-2026
@architect-product-area:Platform
Feature: ADR-038 - Idempotency Enforcement for appendToStream

  Background: Deliverables
    Given the following deliverables:
      | Deliverable | Status | Location |
      | Decision spec (this file) | accepted | libar-platform/architect/decisions/adr-038-idempotency-enforcement-for-append-to-stream.feature |
      | Enforced append semantics | complete | libar-platform/packages/platform-store/src/component/lib.ts |
      | Durability helper alignment | complete | libar-platform/packages/platform-core/src/durability/idempotentAppend.ts |
      | Audit trail for rejected key reuse | complete | libar-platform/packages/platform-store/src/component/schema.ts and lib.ts |
      | Integration coverage | complete | libar-platform/packages/platform-store/tests/integration/event-correctness.integration.test.ts |

  Rule: Context - Persisting an idempotencyKey without enforcement is a broken contract

    The old contract exposed `events[].idempotencyKey`, indexed it, and documented idempotent behavior, but
    the append path still treated the key as write-only metadata. That left callers with an advertised contract
    that could silently create duplicate or conflicting rows.

    Constraints the decision must satisfy:

    | Constraint | Why it matters |
    | Same key plus same payload must converge | Retries need a stable original result |
    | Same key plus different payload must not be silently deduplicated | Conflicting business intent must be rejected visibly |
    | Rejection must be auditable | Operators need evidence of the conflicting append attempt |
    | Core helper and direct component append must agree | `idempotentAppendEvent()` and `appendToStream()` cannot diverge |

  Rule: Decision - appendToStream enforces idempotency by semantic fingerprint

    For every incoming event that carries an `idempotencyKey`, the Event Store computes a semantic fingerprint over:

    | Fingerprint field |
    | streamType |
    | streamId |
    | boundedContext |
    | tenantId (or null) |
    | eventType |
    | category |
    | schemaVersion |
    | payload |

    Decision matrix:

    | Case | Behavior |
    | same key + same semantic fingerprint | Return `duplicate` with the original `eventIds`, `globalPositions`, and `newVersion` |
    | same key + different semantic fingerprint | Return `idempotency_conflict` and persist an audit record |
    | partial duplicate batch or mixed duplicate/non-duplicate batch | Reject as `idempotency_conflict` and audit |
    | no key match | Continue with normal append + OCC behavior |

    The audit record is stored in `idempotencyConflictAudits` with the conflicting key, existing event identity,
    incoming and existing fingerprints, payload snapshots, and the attempt timestamp.

  Rule: Helper alignment - idempotentAppendEvent follows the same decision

    `idempotentAppendEvent()` must not implement a softer rule than the store.

    Alignment policy:

    | Path | Behavior |
    | `idempotentAppendEvent()` sees same key + same fingerprint on pre-check | Return `duplicate` immediately |
    | `idempotentAppendEvent()` sees same key + different fingerprint | Delegate to the store path so the rejection is audited, then throw a conflict error |
    | Direct `appendToStream()` caller gets `idempotency_conflict` | Treat as a rejected append, not a successful duplicate |

    This keeps the helper and the direct component path consistent: duplicates converge, conflicts reject, and
    both routes preserve an auditable trail for mismatched payload reuse.

    @acceptance-criteria @happy-path
    Scenario: Same key plus same payload returns the original append result
      Given an event already exists with idempotency key "payment:ord-123"
      And a retry submits the same semantic payload for that key
      When `appendToStream` evaluates the request
      Then it returns `duplicate`
      And the returned eventIds, globalPositions, and newVersion match the original append result

    @acceptance-criteria @validation
    Scenario: Same key plus different payload is rejected and audited
      Given an event already exists with idempotency key "payment:ord-123"
      And a second append reuses that key with a different semantic payload
      When `appendToStream` evaluates the request
      Then it returns `idempotency_conflict`
      And an audit record is persisted with both payload fingerprints and the existing event identity

  Rule: Consequences - callers must distinguish duplicate replay from rejected key reuse

    Positive outcomes:
    - Retries with the same intent converge to one durable event row and one stable result
    - Conflicting key reuse is visible instead of being silently swallowed
    - Operators can inspect rejected attempts through a durable audit trail

    Negative outcomes:
    - Callers that use `appendToStream` directly must handle `duplicate` and `idempotency_conflict` distinctly instead of assuming only `success` or `conflict`
    - Batch appenders cannot rely on partial duplicate behavior; mixed duplicate batches are rejected to avoid ambiguous replay semantics
