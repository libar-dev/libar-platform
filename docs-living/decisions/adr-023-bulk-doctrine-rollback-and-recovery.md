# ADR-023: PDR 023 Bulk Doctrine Rollback And Recovery

**Purpose:** Architecture decision record for PDR 023 Bulk Doctrine Rollback And Recovery

---

## Overview

| Property | Value    |
| -------- | -------- |
| Status   | accepted |
| Category | process  |

## Context

The doctrine cleanup branch deleted 19 standard gate-passing design specs, applied two
    narrative-only deletion exemptions, kept three specs blocked, and left four carve-out
    executable carriers completed but transitional. The branch also ended with 23 unrelated or
    pre-existing dangling edges still outside this packet.

    That made two governance gaps visible.

    1. Review finding CI10 showed there was no in-repo protocol for undoing part of a bulk doctrine packet.
    2. Review findings CI7, CI9, and CI12 showed that deferred follow-up work and reviewer duties were still mostly implicit.

## Decision

| Situation                                                                   | Required recovery path                                                                                                                                              | Notes                                                                                       |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Entire packet is wrong                                                      | Revert the doctrine packet as a single git change set, then rerun `pnpm docs:all` and the standard validation lanes                                                 | Use when the branch-level premise failed and the repo should return to the pre-packet state |
| Only a subset of deleted specs must return                                  | Restore only the affected source spec files and any paired carrier or annotation edits, then remove or retarget the corresponding continuity tags before validation | This is a selective recovery, not a whole-branch revert                                     |
| Transitional carve-out carrier is wrong but the semantic delete stays valid | Repair the carrier, provenance, backlog references, or unlock state in place without restoring the deleted design spec                                              | Use when the semantic transfer was right but the carrier truthfulness was not               |

| Recovery target                      | Must be restored or updated together                                                                                                           |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| A deleted standard gate-passing spec | The deleted spec, its forward-link pointer, the matching carrier continuity text, and any cleanup-report row that claimed the delete was final |
| A narrative-only exemption           | The deleted narrative spec and any report wording that classified it as a zero-transfer deletion                                               |
| A carve-out executable carrier       | The carrier file, its unlock reason if completed, its `@stub` truthfulness, and its backlog references                                         |

Recovery protocol:


    Required recovery steps for any doctrine rollback:

    1. Identify the semantic pattern set first, not just the touched files. Rollback decisions are made per pattern group.
    2. If restoring a deleted spec, restore the matching forward-link truth as well. The repo must not keep a live `@architect-implements` edge that points at a transfer that no longer claims to exist.
    3. If undoing only part of the packet, restore the deleted spec and revert only the paired carrier text, continuity tags, or report rows for that same semantic pattern. Do not blindly restore all 21 deleted specs.
    4. After the file restore or revert, rerun `pnpm docs:all`, then re-check docs parity, graph health, and doctrine validation before treating the recovery as complete.
    5. If the recovery keeps a carve-out carrier in place, preserve the bare semantic pattern name from PDR-022 and keep any transitional backlog reference honest.

    Subset recovery protocol:


    Whole-packet recovery protocol:

    1. Revert the packet commit or commit range in order.
    2. Rebuild generated docs with `pnpm docs:all`.
    3. Run the normal hard gates in `test.yml` owned lanes, not in release governance.
    4. Review the resulting cleanup report and dangling output to confirm the repo returned to the intended baseline.

## Consequences

| Deferred item                                            | Current disposition                                | Why it stays deferred here                                                                                                                                                      |
| -------------------------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `T5-009` carve-out harness wiring                        | Deferred                                           | This branch preserves the four foundational carriers as truthful `@stub` records, but it does not wire them to real step harnesses                                              |
| `T5-010` post-wiring concurrency and edge-case expansion | Deferred                                           | Expansion only becomes honest after `T5-009` lands and the carriers are runnable                                                                                                |
| Saga fixture extraction or relocation                    | Deferred unless later review work proves otherwise | No separate fixture-extraction packet is implemented here; the branch only records the need if saga carrier support still depends on broad order-management fixtures            |
| Commitlint adoption                                      | Deferred                                           | CI7 remains an explicit process follow-up. This branch does not add a new commit-msg gate because the safer fix set is documentation, checklisting, and existing CI enforcement |

Deferred follow-up work intentionally left out of this branch:


    Reviewer governance consequences:

    1. Pull requests touching doctrine transfers must confirm docs parity, dangling-regression status, and unlock or carrier compliance explicitly in the PR template.
    2. Release governance may report doctrine posture in a summary, but it must not become a second hard gate that can drift away from `test.yml`.
    3. Deferred work is not silent. If a later branch keeps any of the deferred items open, it must keep naming them in the durable records or backlog references.

    Positive outcomes:
    - Maintainers now have a named protocol for restoring one pattern, one carve-out carrier, or the full doctrine packet.
    - Reviewers get explicit checklist prompts for the doctrine-specific regressions this branch exposed.
    - Deferred work stays visible as backlog and governance debt instead of being mistaken for completed doctrine adoption.

    Negative outcomes:
    - Selective recovery still requires careful paired edits because git cannot infer semantic pattern boundaries by itself.
    - The repo keeps living with transitional carve-out carriers and missing commitlint enforcement until later follow-up work lands.

---

[← Back to All Decisions](../DECISIONS.md)
