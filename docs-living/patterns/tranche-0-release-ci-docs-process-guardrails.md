# 📋 Tranche0 Release Ci Docs Process Guardrails

**Purpose:** Detailed documentation for the Tranche0 Release Ci Docs Process Guardrails pattern

---

## Overview

| Property | Value   |
| -------- | ------- |
| Status   | planned |
| Category | DDD     |
| Phase    | 25      |
| Quarter  | Q2-2026 |

## Description

**Problem:** `test.yml` ignores markdown and docs-only changes, release automation is not yet
  normalized around architect release metadata, and new remediation contracts need an explicit
  advertised-vs-enforced convention before runtime fixes start landing.

  **Solution:** Ship a tranche-0 governance packet that mirrors release metadata from
  `pdr-002-release-management-architecture.feature`, adds docs/process CI coverage, and makes
  contract-status and rename-guard policy enforceable before behavior-changing remediation work.

## Acceptance Criteria

**Release governance points to PDR-002**

- Given a remediation packet under tranche 0
- When its release-governance source is documented
- Then it points to `libar-platform/architect/decisions/pdr-002-release-management-architecture.feature`
- And no alternate release authority is introduced

**Docs-only changes still run architect guard and docs generation**

- Given a docs-or-spec-only remediation change
- When CI evaluates the change
- Then a dedicated workflow runs `pnpm architect-guard --all --strict`
- And the same workflow runs `pnpm docs:all`

## Business Rules

**PDR-002 is the only release authority**

Release tooling mirrors architect metadata and does not replace it. Roadmap-versus-package-spec
    separation stays intact, but release authority is recorded only against PDR-002.

_Verified by: Release governance points to PDR-002_

**Docs and process changes must have a non-skipped CI lane**

The dedicated docs/process workflow exists because `.github/workflows/test.yml` skips markdown
    and docs-only changes. Evidence for this packet follows `.sisyphus/evidence/task-3-release-ci-guardrails.{ext}`.

_Verified by: Docs-only changes still run architect guard and docs generation_

---

[← Back to Pattern Registry](../PATTERNS.md)
