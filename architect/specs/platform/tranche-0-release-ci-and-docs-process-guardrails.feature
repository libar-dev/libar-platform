@architect
@architect-release:vNEXT
@architect-pattern:Tranche0ReleaseCiDocsProcessGuardrails
@architect-status:roadmap
@architect-phase:25
@architect-quarter:Q2-2026
@architect-effort:1w
@architect-product-area:Platform
@architect-business-value:prevent-governance-and-docs-only-work-from-bypassing-validation
@architect-priority:high
Feature: Tranche 0 Release, CI, and Docs/Process Guardrails

  **Problem:** `test.yml` ignores markdown and docs-only changes, release automation is not yet
  normalized around architect release metadata, and new remediation contracts need an explicit
  advertised-vs-enforced convention before runtime fixes start landing.

  **Solution:** Ship a tranche-0 governance packet that mirrors release metadata from
  `pdr-002-release-management-architecture.feature`, adds docs/process CI coverage, and makes
  contract-status and rename-guard policy enforceable before behavior-changing remediation work.

  Background: Deliverables
    Given the following deliverables:
      | Deliverable | Status | Location | Tests | Test Type |
      | Release automation aligned to architect releases | pending | .github/ and package manifests | Yes | workflow |
      | Dependency scanning in CI | pending | .github/ | Yes | workflow |
      | Contract-status convention and linting | pending | libar-platform/architect/ and lint config | Yes | workflow |
      | @convex-es rename guard | pending | lint config and docs checks | Yes | workflow |
      | Docs/process validation workflow | pending | .github/workflows/docs-process-validation.yml | Yes | workflow |

  Rule: PDR-002 is the only release authority

    Release tooling mirrors architect metadata and does not replace it. Roadmap-versus-package-spec
    separation stays intact, but release authority is recorded only against PDR-002.

    @acceptance-criteria
    Scenario: Release governance points to PDR-002
      Given a remediation packet under tranche 0
      When its release-governance source is documented
      Then it points to `libar-platform/architect/decisions/pdr-002-release-management-architecture.feature`
      And no alternate release authority is introduced

  Rule: Docs and process changes must have a non-skipped CI lane

    The dedicated docs/process workflow exists because `.github/workflows/test.yml` skips markdown
    and docs-only changes. Evidence for this packet follows `.sisyphus/evidence/task-3-release-ci-guardrails.{ext}`.

    @acceptance-criteria
    Scenario: Docs-only changes still run architect guard and docs generation
      Given a docs-or-spec-only remediation change
      When CI evaluates the change
      Then a dedicated workflow runs `pnpm architect-guard --all --strict`
      And the same workflow runs `pnpm docs:all`
