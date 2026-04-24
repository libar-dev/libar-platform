@architect
@architect-release:vNEXT
@architect-pattern:EventCorrectnessMigration
@architect-status:roadmap
@architect-phase:27
@architect-quarter:Q2-2026
@architect-effort:2w
@architect-product-area:Platform
@architect-business-value:stabilize-idempotency-global-position-and-process-manager-correctness-as-one-packet
@architect-priority:high
@architect-risk:high
@architect-depends-on:Tranche0ReadinessHarness,Tranche0ReleaseCiDocsProcessGuardrails
Feature: Atomic Event Correctness Migration

  **Problem:** `appendToStream` idempotency semantics, `globalPosition` precision, and process-manager
  lifecycle parity are coupled correctness concerns. Splitting them would create inconsistent event-store
  guarantees and leave downstream consumers migrating against moving contracts.

  **Solution:** Plan P14, P17, and P18 as one correctness packet. Implementation starts with a full
  consumer inventory, lands ADR-038 and ADR-035 first, then migrates idempotency, `globalPosition`,
  and canonical process-manager transitions together.

  Background: Deliverables
    Given the following deliverables:
      | Deliverable | Status | Location | Tests | Test Type |
      | globalPosition consumer inventory | pending | packet artifacts and implementation notes | No | - |
      | ADR-038 placeholder | pending | libar-platform/architect/decisions/adr-038-idempotency-enforcement-for-append-to-stream.feature | No | - |
      | ADR-035 placeholder | pending | libar-platform/architect/decisions/adr-035-global-position-numeric-representation.feature | No | - |
      | appendToStream idempotency migration | pending | libar-platform/packages/platform-core/ and platform-store/ | Yes | integration |
      | globalPosition representation migration and compat reader | pending | libar-platform/packages/platform-store/ and downstream consumers | Yes | integration |
      | Canonical PM transition map parity | pending | processManager/lifecycle.ts and parity tests | Yes | unit |
      | Event correctness integration suite | pending | libar-platform/packages/platform-store/tests/integration/event-correctness.integration.test.ts | Yes | integration |

  Rule: P14, P17, and P18 remain one correctness packet

    Idempotency, `globalPosition`, and PM transition parity are reviewed as one correctness surface.
    Same-key/same-payload dedup returns the original event; same-key/different-payload is rejected and audited.

    @acceptance-criteria
    Scenario: Event correctness packet starts from decisions and inventory
      Given the correctness packet is planned
      When implementation begins
      Then ADR-038 and ADR-035 are committed before runtime changes complete
      And a consumer inventory exists before `globalPosition` migration work starts

  Rule: Compatibility and ordering remain explicit

    The packet carries its own compatibility reader, parity tests, and evidence trail.
    Evidence for this packet follows `.sisyphus/evidence/task-5-event-correctness.{ext}`.

    @acceptance-criteria
    Scenario: Old and new checkpoint formats are handled explicitly
      Given historical checkpoint formats exist
      When the new `globalPosition` representation lands
      Then old checkpoints are read through a compat path
      And new checkpoints cannot be misread as old
