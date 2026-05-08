# FSM Transitions

This document defines the workflow state machine used by Process Guard and clarifies how workflow state differs from acceptance-gate maturity.

## Core workflow

The architect workflow state machine is:

`roadmap -> active -> completed`

Optional deferral sits outside the main path:

`deferred -> roadmap`

## State meanings

### roadmap

- work is planned
- editing is open
- deliverables may still change

### active

- implementation is underway
- scope is locked against casual deliverable growth
- process guard should reject scope creep

### completed

- the source is treated as a terminal record
- edits require an unlock reason
- the repo is asserting that deliverables and acceptance criteria are done

### deferred

- work is intentionally postponed
- editing is allowed because the source is not claiming active execution

## Acceptance maturity is a separate question

Workflow state and evidence quality are related, but they are not the same thing.

- A source can be `completed` in workflow terms because the governed deliverable set is considered finished.
- A separate audit may still note that a carrier is transitional, stubbed, or awaiting deeper wiring.

Keep those claims explicit. Do not blur them.

## Unlock-reason rule

Changes to completed feature files require `@architect-unlock-reason:<text>`.

The reason should be specific enough to explain why the terminal record is being reopened. Placeholder text is not acceptable.

Practical house rule:

- use a real explanation
- keep it longer than trivial filler
- tie it to the remediation or governance reason for the edit

## What Process Guard enforces

Process Guard focuses on workflow truth.

- valid state transitions
- scope lock while active
- protection for completed records
- session-scope boundaries when configured

It does not, by itself, guarantee that behavioral evidence is rich enough for deletion. That remains a value-transfer judgment.

## Common mistakes

- skipping `active` and jumping from `roadmap` to `completed`
- editing completed records without an unlock reason
- treating a maturity note such as `MINIMAL_STUB` as if it were a workflow state
- assuming a passed FSM transition means a spec is safe to delete
