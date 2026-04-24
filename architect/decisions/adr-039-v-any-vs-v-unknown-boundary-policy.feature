@architect
@architect-adr:039
@architect-adr-status:accepted
@architect-adr-category:architecture
@architect-pattern:ADR039VAnyVsVUnknownBoundaryPolicy
@architect-status:completed
@architect-completed:2026-04-22
@architect-release:vNEXT
@architect-quarter:Q2-2026
@architect-product-area:Platform
Feature: ADR-039 - v.any() vs v.unknown() Boundary Policy

  Background: Deliverables
    Given the following deliverables:
      | Deliverable | Status | Location |
      | Decision spec (this file) | accepted | libar-platform/architect/decisions/adr-039-v-any-vs-v-unknown-boundary-policy.feature |
      | Shared serialized-size guard | complete | libar-platform/packages/platform-core/src/validation/boundary.ts |
      | Bus / store / agent boundary migration | complete | libar-platform/packages/platform-bus/src/component/**, libar-platform/packages/platform-store/src/component/**, libar-platform/packages/platform-core/src/agent/component/** |
      | Oversize regression coverage | complete | libar-platform/packages/platform-bus/tests/integration/command-bus-harness.integration.test.ts and libar-platform/packages/platform-store/tests/integration/store-harness.integration.test.ts |

  Rule: Context - `v.any()` was too permissive for cross-component payload boundaries

    The tranche-2 validation packet targets payload-like component boundaries where the platform intentionally stores
    flexible values but must still reject malformed or unbounded inputs before they become a scalability problem.

    The old contract had two issues:

    | Issue | Consequence |
    | Validator used `v.any()` | Boundary type checks were weaker than necessary |
    | No serialized-size guard | Large payloads could cross the boundary until Convex or downstream code failed later |

  Rule: Decision - Flexible component boundaries use `v.unknown()` plus explicit size guards

    Boundary policy:

    | Rule | Decision |
    | Storage/transport validator for flexible values | Use `v.unknown()` instead of `v.any()` |
    | Default maximum serialized size | 64 KiB |
    | Rejection error | Throw `PAYLOAD_TOO_LARGE` with field-specific context |
    | Component configurability | Each component may set a local constant when it needs a different cap |

    In-scope flexible boundary fields include payload, result, customState, configOverrides, failed-command payload,
    and debug context surfaces where the structure remains intentionally open but bounded.

    @acceptance-criteria @happy-path
    Scenario: Payload below the configured cap passes the component boundary
      Given a boundary field is validated with `v.unknown()`
      And the serialized value stays below the configured byte cap
      When the component mutation validates the request
      Then the call proceeds
      And the stored value retains its original flexible structure

    @acceptance-criteria @validation
    Scenario: Oversized payload is rejected before persistence
      Given a boundary field is validated with `v.unknown()`
      And its serialized size exceeds the configured byte cap
      When the component mutation validates the request
      Then the mutation throws `PAYLOAD_TOO_LARGE`
      And no component state is written for that request

  Rule: Consequences - Flexible storage remains possible, but unbounded input is no longer allowed

    Positive outcomes:
    - The boundary contract is explicit: flexible value shape, bounded size
    - Oversized payload failures become deterministic and testable
    - Bus, store, and agent surfaces share one validation helper instead of ad hoc checks

    Negative outcomes:
    - Callers that previously relied on arbitrarily large payloads now receive explicit rejections
    - New flexible boundary fields must remember to opt into the shared size-guard policy
