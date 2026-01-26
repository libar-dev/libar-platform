# Planning + Design Session Prompts

> **Usage:** Copy a prompt into a fresh Claude Code session to complete all spec artifacts (Tier 1 + Tier 2) for a pattern.

---

## When to Use These Prompts

Use these prompts when:

- A skeleton roadmap spec already exists in `delivery-process/specs/platform/`
- You need BOTH enhanced roadmap spec AND executable spec stubs
- You want to prepare all artifacts before an implementation session

**For Tier 1 only (no stubs):** Use [PLANNING-SESSION-PROMPT-QUICK.md](./PLANNING-SESSION-PROMPT-QUICK.md) instead.

---

## Generic Template

```
Run a PLANNING + DESIGN SESSION to complete all spec artifacts for {PATTERN_NAME}.

INPUTS:
- Pattern brief: docs/project-management/aggregate-less-pivot/pattern-briefs/{PATTERN_FILE}
- Existing roadmap spec: delivery-process/specs/platform/{SPEC_NAME}.feature

OUTPUTS (Tier 1 - Enhanced Roadmap Spec):
- delivery-process/specs/platform/{SPEC_NAME}.feature
  - Add @libar-docs-executable-specs tag
  - Add Tests and Test Type columns to deliverables
  - Add DocStrings for code examples
  - Expand scenarios with validation cases
  - Add architecture tables from pattern brief

OUTPUTS (Tier 2 - Executable Spec Stubs):
- deps/libar-dev-packages/packages/{PACKAGE}/tests/features/behavior/{pattern-name}/*.feature
- deps/libar-dev-packages/packages/{PACKAGE}/tests/planning-stubs/{path}/{pattern}.steps.ts

NOTE: Step definition stubs go to tests/planning-stubs/ (excluded from vitest).
Move to tests/steps/ during implementation and replace throw statements.

CONSTRAINTS:
- PLANNING + DESIGN ONLY - do NOT create implementation code
- Enhance .feature spec using rich Gherkin (Rules, DataTables, DocStrings)
- Create Tier 2 stubs with @libar-docs-implements linking
- Create step definitions stub using Rule() + RuleScenario() pattern (NOT Scenario())
- Follow delivery-process/PLANNING-DESIGN-SESSION-GUIDE.md

REFERENCES:
- Tier 1 reference: delivery-process/specs/platform/projection-categories.feature
- Tier 2 reference: deps/libar-dev-packages/packages/platform-core/tests/features/behavior/projection-categories/
- Step defs reference: deps/libar-dev-packages/packages/platform-core/tests/steps/projections/categories.steps.ts
- Rule keyword PoC: deps/libar-dev-packages/packages/delivery-process/tests/steps/poc/rule-keyword-poc.steps.ts

VERIFICATION:
pnpm lint-process --staged
pnpm typecheck
pnpm docs:all
```

---

## Phase-Specific Prompts

### Reactive Projections - Phase 17

```
Run a PLANNING + DESIGN SESSION to complete all spec artifacts for Reactive Projections (Phase 17).

INPUTS:
- Pattern brief: docs/project-management/aggregate-less-pivot/pattern-briefs/04-reactive-projections.md
- Existing roadmap spec: delivery-process/specs/platform/reactive-projections.feature

OUTPUTS (Tier 1 - Enhanced Roadmap Spec):
- delivery-process/specs/platform/reactive-projections.feature
  - Add @libar-docs-executable-specs:platform-core/tests/features/behavior/reactive-projections
  - Add Tests and Test Type columns to deliverables
  - Add "Why It Matters" benefits table
  - Add Architecture diagram (ASCII)
  - Add Key Concepts table
  - Add DocStrings for useReactiveProjection API
  - Expand Rules 1-4 with validation scenarios
  - Add Rule 5: useReactiveProjection Hook API

OUTPUTS (Tier 2 - Executable Spec Stubs):
- deps/libar-dev-packages/packages/platform-core/tests/features/behavior/reactive-projections/
  - hybrid-model.feature (Rule 1)
  - shared-evolve.feature (Rule 2)
  - conflict-detection.feature (Rule 3)
  - reactive-eligibility.feature (Rule 4)
- deps/libar-dev-packages/packages/platform-core/tests/planning-stubs/projections/reactive.steps.ts

CONSTRAINTS:
- PLANNING + DESIGN ONLY - do NOT create implementation code
- Enhance .feature spec using rich Gherkin (Rules, DataTables, DocStrings)
- Create Tier 2 stubs with @libar-docs-implements:ReactiveProjections linking
- Create step definitions stub with TypeScript scaffold
- Follow delivery-process/PLANNING-DESIGN-SESSION-GUIDE.md

REFERENCES:
- Tier 1 reference: delivery-process/specs/platform/projection-categories.feature
- Tier 2 reference: deps/libar-dev-packages/packages/platform-core/tests/features/behavior/projection-categories/
- Step defs reference: deps/libar-dev-packages/packages/platform-core/tests/steps/projections/categories.steps.ts

VERIFICATION:
pnpm lint-process --staged
pnpm typecheck
pnpm docs:all
```

---

### Production Hardening - Phase 18

```
Run a PLANNING + DESIGN SESSION to complete all spec artifacts for Production Hardening (Phase 18).

INPUTS:
- Pattern brief: docs/project-management/aggregate-less-pivot/pattern-briefs/production-hardening.md
- Existing roadmap spec: delivery-process/specs/platform/production-hardening.feature

OUTPUTS (Tier 1 - Enhanced Roadmap Spec):
- delivery-process/specs/platform/production-hardening.feature
  - Add @libar-docs-executable-specs:platform-core/tests/features/behavior/production-hardening
  - Add Tests and Test Type columns to deliverables
  - Add DocStrings for configuration examples
  - Expand scenarios with validation cases

OUTPUTS (Tier 2 - Executable Spec Stubs):
- deps/libar-dev-packages/packages/platform-core/tests/features/behavior/production-hardening/*.feature
- deps/libar-dev-packages/packages/platform-core/tests/planning-stubs/production/hardening.steps.ts

CONSTRAINTS:
- PLANNING + DESIGN ONLY - do NOT create implementation code
- Enhance .feature spec using rich Gherkin (Rules, DataTables, DocStrings)
- Create Tier 2 stubs with @libar-docs-implements:ProductionHardening linking
- Create step definitions stub with TypeScript scaffold
- Follow delivery-process/PLANNING-DESIGN-SESSION-GUIDE.md

REFERENCES:
- Tier 1 reference: delivery-process/specs/platform/projection-categories.feature
- Tier 2 reference: deps/libar-dev-packages/packages/platform-core/tests/features/behavior/projection-categories/

VERIFICATION:
pnpm lint-process --staged
pnpm typecheck
pnpm docs:all
```

---

### ECST/Fat Events - Phase 20

```
Run a PLANNING + DESIGN SESSION to complete all spec artifacts for ECST/Fat Events (Phase 20).

INPUTS:
- Pattern brief: docs/project-management/aggregate-less-pivot/pattern-briefs/05-ecst-fat-events.md
- Existing roadmap spec: delivery-process/specs/platform/ecst-fat-events.feature

OUTPUTS (Tier 1 - Enhanced Roadmap Spec):
- delivery-process/specs/platform/ecst-fat-events.feature
  - Add @libar-docs-executable-specs:platform-store/tests/features/behavior/ecst
  - Add Tests and Test Type columns to deliverables
  - Add event enrichment examples as DocStrings
  - Expand scenarios with validation cases

OUTPUTS (Tier 2 - Executable Spec Stubs):
- deps/libar-dev-packages/packages/platform-store/tests/features/behavior/ecst/*.feature
- deps/libar-dev-packages/packages/platform-store/tests/planning-stubs/ecst.steps.ts

CONSTRAINTS:
- PLANNING + DESIGN ONLY - do NOT create implementation code
- Enhance .feature spec using rich Gherkin (Rules, DataTables, DocStrings)
- Create Tier 2 stubs with @libar-docs-implements:ECSTFatEvents linking
- Create step definitions stub with TypeScript scaffold
- Follow delivery-process/PLANNING-DESIGN-SESSION-GUIDE.md

REFERENCES:
- Tier 1 reference: delivery-process/specs/platform/projection-categories.feature
- Tier 2 reference: deps/libar-dev-packages/packages/platform-core/tests/features/behavior/projection-categories/

VERIFICATION:
pnpm lint-process --staged
pnpm typecheck
pnpm docs:all
```

---

### Reservation Pattern - Phase 20

```
Run a PLANNING + DESIGN SESSION to complete all spec artifacts for Reservation Pattern (Phase 20).

INPUTS:
- Pattern brief: docs/project-management/aggregate-less-pivot/pattern-briefs/06-reservation-pattern.md
- Existing roadmap spec: delivery-process/specs/platform/reservation-pattern.feature

OUTPUTS (Tier 1 - Enhanced Roadmap Spec):
- delivery-process/specs/platform/reservation-pattern.feature
  - Add @libar-docs-executable-specs:platform-core/tests/features/behavior/reservation
  - Add Tests and Test Type columns to deliverables
  - Add reservation lifecycle examples as DocStrings
  - Expand scenarios with validation cases

OUTPUTS (Tier 2 - Executable Spec Stubs):
- deps/libar-dev-packages/packages/platform-core/tests/features/behavior/reservation/*.feature
- deps/libar-dev-packages/packages/platform-core/tests/planning-stubs/reservation.steps.ts

CONSTRAINTS:
- PLANNING + DESIGN ONLY - do NOT create implementation code
- Enhance .feature spec using rich Gherkin (Rules, DataTables, DocStrings)
- Create Tier 2 stubs with @libar-docs-implements:ReservationPattern linking
- Create step definitions stub with TypeScript scaffold
- Follow delivery-process/PLANNING-DESIGN-SESSION-GUIDE.md

REFERENCES:
- Tier 1 reference: delivery-process/specs/platform/projection-categories.feature
- Tier 2 reference: deps/libar-dev-packages/packages/platform-core/tests/features/behavior/projection-categories/

VERIFICATION:
pnpm lint-process --staged
pnpm typecheck
pnpm docs:all
```

---

### Integration Patterns - Phase 21

```
Run a PLANNING + DESIGN SESSION to complete all spec artifacts for Integration Patterns (Phase 21).

INPUTS:
- Pattern brief: docs/project-management/aggregate-less-pivot/pattern-briefs/07-integration-patterns.md
- Existing roadmap spec: delivery-process/specs/platform/integration-patterns.feature

OUTPUTS (Tier 1 - Enhanced Roadmap Spec):
- delivery-process/specs/platform/integration-patterns.feature
  - Add @libar-docs-executable-specs:platform-bus/tests/features/behavior/integration
  - Add Tests and Test Type columns to deliverables
  - Add integration event examples as DocStrings
  - Expand scenarios with validation cases

OUTPUTS (Tier 2 - Executable Spec Stubs):
- deps/libar-dev-packages/packages/platform-bus/tests/features/behavior/integration/*.feature
- deps/libar-dev-packages/packages/platform-bus/tests/planning-stubs/integration.steps.ts

CONSTRAINTS:
- PLANNING + DESIGN ONLY - do NOT create implementation code
- Enhance .feature spec using rich Gherkin (Rules, DataTables, DocStrings)
- Create Tier 2 stubs with @libar-docs-implements:IntegrationPatterns linking
- Create step definitions stub with TypeScript scaffold
- Follow delivery-process/PLANNING-DESIGN-SESSION-GUIDE.md

REFERENCES:
- Tier 1 reference: delivery-process/specs/platform/projection-categories.feature
- Tier 2 reference: deps/libar-dev-packages/packages/platform-core/tests/features/behavior/projection-categories/

VERIFICATION:
pnpm lint-process --staged
pnpm typecheck
pnpm docs:all
```

---

### Agent as Bounded Context - Phase 22

```
Run a PLANNING + DESIGN SESSION to complete all spec artifacts for Agent as Bounded Context (Phase 22).

INPUTS:
- Pattern brief: docs/project-management/aggregate-less-pivot/pattern-briefs/08-agent-as-bc.md
- Existing roadmap spec: delivery-process/specs/platform/agent-as-bounded-context.feature

OUTPUTS (Tier 1 - Enhanced Roadmap Spec):
- delivery-process/specs/platform/agent-as-bounded-context.feature
  - Add @libar-docs-executable-specs:platform-bc/tests/features/behavior/agent
  - Add Tests and Test Type columns to deliverables
  - Add agent integration examples as DocStrings
  - Expand scenarios with validation cases

OUTPUTS (Tier 2 - Executable Spec Stubs):
- deps/libar-dev-packages/packages/platform-bc/tests/features/behavior/agent/*.feature
- deps/libar-dev-packages/packages/platform-bc/tests/planning-stubs/agent.steps.ts

CONSTRAINTS:
- PLANNING + DESIGN ONLY - do NOT create implementation code
- Enhance .feature spec using rich Gherkin (Rules, DataTables, DocStrings)
- Create Tier 2 stubs with @libar-docs-implements:AgentAsBoundedContext linking
- Create step definitions stub with TypeScript scaffold
- Follow delivery-process/PLANNING-DESIGN-SESSION-GUIDE.md

REFERENCES:
- Tier 1 reference: delivery-process/specs/platform/projection-categories.feature
- Tier 2 reference: deps/libar-dev-packages/packages/platform-core/tests/features/behavior/projection-categories/

VERIFICATION:
pnpm lint-process --staged
pnpm typecheck
pnpm docs:all
```

---

## Related Documents

| Document                                                                           | Purpose                           |
| ---------------------------------------------------------------------------------- | --------------------------------- |
| [PLANNING-DESIGN-SESSION-GUIDE.md](../PLANNING-DESIGN-SESSION-GUIDE.md)            | Complete workflow with checklists |
| [PLANNING-SESSION-PROMPT-QUICK.md](./PLANNING-SESSION-PROMPT-QUICK.md)             | Tier 1 only prompts               |
| [planning-session-spec.feature.template](./planning-session-spec.feature.template) | Tier 1 spec template              |
| [executable-spec-stub.feature.template](./executable-spec-stub.feature.template)   | Tier 2 spec stub template         |
| [step-definitions-stub.ts.template](./step-definitions-stub.ts.template)           | Step definitions stub template    |
