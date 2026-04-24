@architect
@architect-release:vNEXT
@architect-pattern:Tranche0ReadinessHarness
@architect-status:roadmap
@architect-phase:24
@architect-quarter:Q2-2026
@architect-effort:1w
@architect-product-area:Platform
@architect-business-value:establish-non-negotiable-readiness-before-remediation-runtime-work
@architect-priority:high
Feature: Tranche 0 Readiness Harness and Dependency Hardening

  **Problem:** The remediation program cannot safely begin security or correctness migrations
  while `platform-store` lacks a real backend integration harness, `platform-bus` relies on
  thin backend coverage, and package validation posture still permits configuration drift.

  **Solution:** Land the tranche-0 readiness packet first so later packets inherit a trustworthy
  backend test surface, aligned package scripts, and strict validation baselines.

  **Release authority:** `libar-platform/architect/decisions/pdr-002-release-management-architecture.feature`
  remains the sole release-governance source for this packet and every downstream remediation PR.

  Background: Deliverables
    Given the following deliverables:
      | Deliverable | Status | Location | Tests | Test Type |
      | Dependency delta memo | pending | .full-review/04a-dependency-delta.md | No | - |
      | Store backend integration harness | pending | libar-platform/packages/platform-store/tests/integration/store-harness.integration.test.ts | Yes | integration |
      | Bus backend integration harness | pending | libar-platform/packages/platform-bus/tests/integration/command-bus-harness.integration.test.ts | Yes | integration |
      | Typecheck and Vitest config alignment | pending | libar-platform/packages/platform-*/package.json | Yes | unit |
      | Strict TS and ESLint hardening | pending | libar-platform/packages/platform-*/ | Yes | unit |

  Rule: Tranche 0 readiness is a hard gate

    The readiness packet completes before any wave-3 runtime packet starts. Store and bus backend
    harnesses are part of one readiness surface and may not be split into separate remediation work.

    @acceptance-criteria
    Scenario: Store and bus readiness harnesses exist before tranche 1 implementation
      Given the tranche-0 readiness packet is planned
      When implementation begins
      Then store and bus backend integration harnesses are both in scope
      And later security and correctness packets treat them as prerequisites

  Rule: Validation posture must fail closed

    This packet aligns typecheck, Vitest, and linting surfaces so no package can present a false-green
    readiness state. Evidence for the packet follows `.sisyphus/evidence/task-2-readiness-harness.{ext}`.

    @acceptance-criteria
    Scenario: Readiness validation remains machine-verifiable
      Given the readiness packet deliverables
      When the packet is validated
      Then `pnpm typecheck` and `pnpm lint` remain required gates
      And `pnpm test:integration` includes the new store and bus harnesses
