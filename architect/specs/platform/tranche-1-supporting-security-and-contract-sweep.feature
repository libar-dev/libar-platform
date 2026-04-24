@architect
@architect-release:vNEXT
@architect-pattern:Tranche1SupportingSecurityContractSweep
@architect-status:roadmap
@architect-phase:28
@architect-quarter:Q2-2026
@architect-effort:1w
@architect-product-area:Platform
@architect-business-value:close-supporting-security-and-contract-gaps-after-the-auth-keystone
@architect-priority:high
@architect-risk:high
@architect-depends-on:Tranche0ReadinessHarness,Tranche0ReleaseCiDocsProcessGuardrails
Feature: Tranche 1 Supporting Security and Contract Sweep

  **Problem:** Several tranche-1 gaps remain after the auth keystone: test-mode checks fail open,
  correlation IDs can be fabricated, reviewer authorization still needs default-deny cleanup, lifecycle
  stubs leak placeholder behavior, and `platform-store` still lacks a recorded decision for its constrained
  `platform-core` runtime dependency.

  **Solution:** Plan P12, P13, P15, P16, P19, P20, and P21 as one supporting packet that executes
  after the component-boundary auth convention is established, but stays distinct from the P11 and
  event-correctness packets.

  Background: Deliverables
    Given the following deliverables:
      | Deliverable | Status | Location | Tests | Test Type |
      | ensureTestEnvironment fail-closed | pending | libar-platform/packages/platform-core/ | Yes | unit |
      | correlationId required at validator boundary | pending | appendToStream validators and callers | Yes | integration |
      | Full-length UUIDv7 helper centralization | pending | ids/generator.ts and callers | Yes | unit |
      | Reviewer authorization default-deny migration | pending | authorization middleware and call sites | Yes | unit |
      | Approval expiration ordering fix | pending | approveAction and rejectAction surfaces | Yes | integration |
      | Lifecycle stubs throw or are removed | pending | public lifecycle surfaces | Yes | unit |
      | platform-store dependency decision + guardrails | pending | libar-platform/architect/decisions/pdr-021-platform-store-runtime-dependency-on-platform-core.feature and libar-platform/architect/remediation/REMEDIATION_PLAN.md | Yes | architect/docs |

  Rule: Supporting tranche-1 work follows the auth convention

    This packet does not redefine the proof model from P11. It consumes the component-boundary auth
    convention once PDR-014 and its implementation packet establish the canonical contract.

    @acceptance-criteria
    Scenario: Supporting cleanup does not bypass the auth keystone
      Given the supporting tranche-1 packet is planned
      When implementation begins
      Then it assumes the component-boundary auth convention already exists
      And it does not introduce alternate trust or correlation shortcuts

  Rule: Legacy shortcuts are removed, not documented as acceptable debt

Default-allow reviewer logic, fabricated correlation IDs, truncated UUID helpers, and earlier no-op hardening debt
    lifecycle stubs are all remediation targets. Evidence follows `.sisyphus/evidence/task-6-supporting-security-contracts.{ext}`.

    @acceptance-criteria
    Scenario: Supporting contract gaps fail closed after remediation
      Given the supporting tranche-1 packet is implemented
      When legacy shortcut paths are exercised
      Then each path fails with the expected error or rejection
      And `pnpm test:packages` plus `pnpm test:integration` remain required gates
