@architect
@architect-adr:040
@architect-adr-status:accepted
@architect-adr-category:architecture
@architect-pattern:ADR040EventsTableIndexPolicy
@architect-status:completed
@architect-completed:2026-04-22
@architect-release:vNEXT
@architect-quarter:Q2-2026
@architect-product-area:Platform
Feature: ADR-040 - events Table Index Policy

  Background: Deliverables
    Given the following deliverables:
      | Deliverable | Status | Location |
      | Decision spec (this file) | accepted | libar-platform/architect/decisions/adr-040-events-table-index-policy.feature |
      | Replacement compound index | complete | libar-platform/packages/platform-store/src/component/schema.ts |
      | `readFromPosition` consumer migration | complete | libar-platform/packages/platform-store/src/component/lib.ts and admin replay consumers |
      | Index audit regression coverage | complete | libar-platform/packages/platform-store/tests/unit/index-audit.test.ts |

  Rule: Context - Index cleanup is safe only after consumer verification

    The event store had accumulated indexes whose usage no longer matched the active read path. Removing them too
    early would be a breaking change; leaving them forever keeps append cost higher than necessary.

    Audit constraints:

    | Constraint | Implication |
    | New read path first | Consumers must be migrated before indexes are dropped |
    | Audit must be repo-backed | Removal depends on verified in-repo consumer usage, not guesswork |
    | Rollback must stay simple | Re-adding a removed index remains the fallback if a missed consumer appears |

  Rule: Decision - `readFromPosition` uses a replacement compound index and stale indexes are dropped only after audit

    Replacement policy:

    | Old index | Replacement / outcome |
    | `by_event_type` | Replaced by `by_event_type_and_global_position` |
    | `by_bounded_context` | Dropped after audit showed no remaining consumer |
    | `by_event_id` | Dropped after audit showed no remaining consumer on the `events` table |
    | `by_category` | Dropped after audit showed no remaining consumer |

    Consumer policy:

    | Surface | Decision |
    | `readFromPosition` event-type filtering | Query `by_event_type_and_global_position`, merge, sort, page |
    | Replay / catch-up consumers | Consume `{ events, nextPosition, hasMore }` from `readFromPosition` |
    | Missed consumer discovered post-merge | Re-add the required index in a follow-up patch and document it in changelog / remediation notes |

    @acceptance-criteria @happy-path
    Scenario: Event-type catch-up uses the replacement compound index
      Given the event store exposes `readFromPosition`
      When a caller filters by event type after a global position
      Then the query uses the `by_event_type_and_global_position` replacement index
      And it returns `{ events, nextPosition, hasMore }` for continued paging

    @acceptance-criteria @validation
    Scenario: Removed indexes stay absent after the audit-driven cleanup
      Given the index audit is complete
      When the events-table schema is inspected
      Then `by_event_type`, `by_bounded_context`, `by_event_id`, and `by_category` are absent
      And the replacement compound index remains present

  Rule: Consequences - Append cost drops only after the read path is updated first

    Positive outcomes:
    - The active event-type catch-up path gets an index aligned to its pagination key
    - Dropping dead indexes reduces write amplification on the `events` table
    - The cleanup rule is explicit and repeatable for future event-store index additions

    Negative outcomes:
    - Future event-table indexes now require an explicit consumer audit before they can be removed
    - Missed out-of-repo consumers still require a follow-up rollback/re-add path if discovered later
