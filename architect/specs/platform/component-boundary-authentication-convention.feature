@architect
@architect-release:vNEXT
@architect-pattern:ComponentBoundaryAuthenticationConvention
@architect-status:roadmap
@architect-phase:26
@architect-quarter:Q2-2026
@architect-effort:1w
@architect-product-area:Platform
@architect-business-value:close-the-trust-vacuum-at-component-boundaries-before-later-security-work
@architect-priority:high
@architect-risk:high
@architect-depends-on:Tranche0ReadinessHarness,Tranche0ReleaseCiDocsProcessGuardrails
Feature: Atomic Component-Boundary Authentication Convention

  **Problem:** Identity-bearing component mutations still trust caller-provided actor fields
  without a canonical component-side proof contract. Fixing the affected mutations piecemeal would
  create drift and leave a mixed-trust window across approvals, audit, and event append flows.

  **Solution:** Plan P11 as one atomic remediation packet: PDR-014 defines the canonical
  `verificationProof` contract, the `verifyActor()` helper becomes the default component-side gate,
  and all listed mutation sites migrate in the same implementation session.

  Background: Deliverables
    Given the following deliverables:
      | Deliverable | Status | Location | Tests | Test Type |
      | PDR-014 placeholder | pending | libar-platform/architect/decisions/pdr-014-component-boundary-authentication-convention.feature | No | - |
      | Canonical verificationProof contract | pending | PDR-014 and platform-core security surfaces | Yes | integration |
      | verifyActor helper | pending | libar-platform/packages/platform-core/ | Yes | integration |
      | Identity-bearing mutation migration | pending | approve, reject, audit.record, agentCommands.record, appendToStream | Yes | integration |
      | Contract-status tagging for system-only exceptions | pending | mutated component surfaces | Yes | integration |
      | Component-boundary auth integration suite | pending | libar-platform/packages/platform-core/tests/integration/security/component-boundary-auth.integration.test.ts | Yes | integration |

  Rule: P11 ships as one atomic packet

    The auth convention is the tranche-1 keystone. Approve, reject, audit, agent command recording,
    and event append migration stay in one packet so no component mutation remains on the old trust model.

    @acceptance-criteria
    Scenario: Auth remediation is not split by mutation family
      Given the component-boundary auth packet is in roadmap state
      When implementation begins
      Then all identity-bearing mutation sites listed in the remediation plan are in the same packet
      And PDR-014 is committed before the packet can complete

  Rule: Verification is component-side and defaults to deny

    The proof contract is checked inside the component mutation boundary, not by parent-app trust alone.
    Evidence for this packet follows `.sisyphus/evidence/task-4-component-boundary-auth.{ext}`.

    @acceptance-criteria
    Scenario: Missing or forged proof is rejected by default
      Given a component mutation requiring actor identity
      When the proof is missing, expired, mismatched, or forged
      Then the mutation is rejected before any write occurs
