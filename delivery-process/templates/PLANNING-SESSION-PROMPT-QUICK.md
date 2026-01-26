# Quick Planning Session Prompts

> **Usage:** Copy one of these prompts into a fresh Claude Code session.

---

## DCB (Dynamic Consistency Boundaries) - Phase 16

```
Run a PLANNING SESSION to create a roadmap spec from the DCB pattern brief.

INPUT: docs/project-management/aggregate-less-pivot/pattern-briefs/03-dcb.md
OUTPUT: delivery-process/specs/platform/dynamic-consistency-boundaries.feature

CONSTRAINTS:
- PLANNING ONLY - do NOT create implementation files
- Create/enhance the .feature spec using rich Gherkin (Rules, DataTables, DocStrings)
- Follow delivery-process/PLANNING-SESSION-GUIDE.md
- Use delivery-process/templates/planning-session-spec.feature.template
- Reference delivery-process/specs/platform/projection-categories.feature for patterns

Run pnpm docs:all when done to verify.
```

---

## Reactive Projections - Phase 17

```
Run a PLANNING SESSION to create a roadmap spec from the Reactive Projections pattern brief.

INPUT: docs/project-management/aggregate-less-pivot/pattern-briefs/04-reactive-projections.md
OUTPUT: delivery-process/specs/platform/reactive-projections.feature

CONSTRAINTS:
- PLANNING ONLY - do NOT create implementation files
- Create/enhance the .feature spec using rich Gherkin (Rules, DataTables, DocStrings)
- Follow delivery-process/PLANNING-SESSION-GUIDE.md
- Use delivery-process/templates/planning-session-spec.feature.template
- Reference delivery-process/specs/platform/projection-categories.feature for patterns

Run pnpm docs:all when done to verify.
```

---

## Production Hardening - Phase 18

```
Run a PLANNING SESSION to create a roadmap spec from the Production Hardening pattern brief.

INPUT: docs/project-management/aggregate-less-pivot/pattern-briefs/production-hardening.md
OUTPUT: delivery-process/specs/platform/production-hardening.feature

CONSTRAINTS:
- PLANNING ONLY - do NOT create implementation files
- Create/enhance the .feature spec using rich Gherkin (Rules, DataTables, DocStrings)
- Follow delivery-process/PLANNING-SESSION-GUIDE.md
- Use delivery-process/templates/planning-session-spec.feature.template
- Reference delivery-process/specs/platform/projection-categories.feature for patterns

Run pnpm docs:all when done to verify.
```

---

## ECST/Fat Events + Reservation Pattern - Phase 20

```
Run a PLANNING SESSION to create roadmap specs from ECST/Fat Events and Reservation Pattern briefs.

INPUT:
- docs/project-management/aggregate-less-pivot/pattern-briefs/05-ecst-fat-events.md
- docs/project-management/aggregate-less-pivot/pattern-briefs/06-reservation-pattern.md
OUTPUT:
- delivery-process/specs/platform/ecst-fat-events.feature
- delivery-process/specs/platform/reservation-pattern.feature

CONSTRAINTS:
- PLANNING ONLY - do NOT create implementation files
- Create/enhance the .feature specs using rich Gherkin (Rules, DataTables, DocStrings)
- Follow delivery-process/PLANNING-SESSION-GUIDE.md
- Use delivery-process/templates/planning-session-spec.feature.template
- Reference delivery-process/specs/platform/projection-categories.feature for patterns

Run pnpm docs:all when done to verify.
```

---

## Integration Patterns - Phase 21

```
Run a PLANNING SESSION to create a roadmap spec from the Integration Patterns brief.

INPUT: docs/project-management/aggregate-less-pivot/pattern-briefs/07-integration-patterns.md
OUTPUT: delivery-process/specs/platform/integration-patterns.feature

CONSTRAINTS:
- PLANNING ONLY - do NOT create implementation files
- Create/enhance the .feature spec using rich Gherkin (Rules, DataTables, DocStrings)
- Follow delivery-process/PLANNING-SESSION-GUIDE.md
- Use delivery-process/templates/planning-session-spec.feature.template
- Reference delivery-process/specs/platform/projection-categories.feature for patterns

Run pnpm docs:all when done to verify.
```

---

## Agent as Bounded Context - Phase 22

```
Run a PLANNING SESSION to create a roadmap spec from the Agent as BC pattern brief.

INPUT: docs/project-management/aggregate-less-pivot/pattern-briefs/08-agent-as-bc.md
OUTPUT: delivery-process/specs/platform/agent-as-bounded-context.feature

CONSTRAINTS:
- PLANNING ONLY - do NOT create implementation files
- Create/enhance the .feature spec using rich Gherkin (Rules, DataTables, DocStrings)
- Follow delivery-process/PLANNING-SESSION-GUIDE.md
- Use delivery-process/templates/planning-session-spec.feature.template
- Reference delivery-process/specs/platform/projection-categories.feature for patterns

Run pnpm docs:all when done to verify.
```

---

## Generic Template (fill in the blank)

```
Run a PLANNING SESSION to create a roadmap spec from a pattern brief.

INPUT: docs/project-management/aggregate-less-pivot/pattern-briefs/{PATTERN_FILE}
OUTPUT: delivery-process/specs/platform/{SPEC_NAME}.feature

CONSTRAINTS:
- PLANNING ONLY - do NOT create implementation files
- Create/enhance the .feature spec using rich Gherkin (Rules, DataTables, DocStrings)
- Use Rule: keyword for grouping scenarios (required for vitest-cucumber compatibility)
- Follow delivery-process/PLANNING-SESSION-GUIDE.md
- Use delivery-process/templates/planning-session-spec.feature.template
- Reference delivery-process/specs/platform/projection-categories.feature for patterns

NOTE: Feature files with Rule: require step defs to use Rule() + RuleScenario() pattern.

Run pnpm docs:all when done to verify.
```
