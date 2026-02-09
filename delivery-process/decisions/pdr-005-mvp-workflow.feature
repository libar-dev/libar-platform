@libar-docs
@libar-docs-adr:005
@libar-docs-adr-status:accepted
@libar-docs-adr-category:process
@libar-docs-release:v0.1.0
@libar-docs-pattern:PDR005MvpWorkflow
@libar-docs-status:roadmap
Feature: PDR-005 - MVP Workflow State Machine

  Rule: Context - Previous status values had overlapping semantics

    Previous status values (implemented, partial, roadmap, completed, active)
    had overlapping semantics and no programmatic enforcement. Work items could
    transition between states without validation, leading to inconsistent process state.

  Rule: Decision - Phase-state-machine FSM with Decider-based enforcement

    Adopt the phase-state-machine FSM with Decider-based enforcement:

    | State | Meaning | Protection | Entry Criteria |
    |-------|---------|------------|----------------|
    | roadmap | Planned work | None | File created with problem/solution |
    | active | In progress | Scope-locked | Work started, deliverables defined |
    | completed | Done | Hard-locked | All deliverables done, tests pass |
    | deferred | On hold | None | Explicitly parked for later |

    Valid Transitions:
    ```
    roadmap ──→ active ──→ completed
       │          │
       │          ↓
       │       roadmap (blocked/regressed)
       │
       ↓
    deferred ──→ roadmap
    ```

    - roadmap to active: Work begins
    - roadmap to deferred: Explicitly parked
    - active to completed: All deliverables done
    - active to roadmap: Blocked or scope changed
    - deferred to roadmap: Reactivated for planning

    Invalid Transitions:
    - roadmap to completed: Cannot skip active phase
    - completed to any: Terminal state (requires explicit unlock)
    - deferred to active: Must go through roadmap first

    Enforcement:
    The process-guard-linter validates transitions via Decider pattern:
    - State derived from libar-docs-status annotations
    - Protection levels prevent accidental modifications
    - Taxonomy changes blocked if they affect protected specs

    Required tags: libar-docs-pattern, libar-docs-status
    Optional tags: phase, effort, completed, release, unlock-reason

  Rule: Consequences - Trade-offs of FSM enforcement

    Positive outcomes:
    - Consistent with phase-state-machine.feature
    - Decider-based enforcement catches invalid transitions
    - Protection levels prevent accidental scope creep
    - Aligns with platform Decider/FSM patterns (dogfooding)

    Negative outcomes:
    - Requires lint:process in pre-commit/CI
    - Supersedes legacy status values in tag-registry.json
