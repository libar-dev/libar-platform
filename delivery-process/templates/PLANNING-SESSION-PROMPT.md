# Planning Session Prompt Template

> **Usage:** Copy this prompt into a fresh Claude Code session to create a roadmap spec from a pattern brief.
> **Output:** A `.feature` file in `delivery-process/specs/platform/`

---

## Prompt (copy everything below this line)

---

I need you to run a **planning session** to create a roadmap spec from a pattern brief.

## Critical Constraints

This is a **PLANNING SESSION**, not an implementation session:

- ✅ DO read the pattern brief and related code
- ✅ DO create a `.feature` spec in `delivery-process/specs/platform/`
- ✅ DO use rich Gherkin (Rules, DataTables, DocStrings)
- ❌ DO NOT create implementation files (`.ts`, `.js`)
- ❌ DO NOT modify existing code
- ❌ DO NOT ask "Ready to implement?" - we are ONLY creating the spec

## Input

**Pattern Brief:** `docs/project-management/aggregate-less-pivot/pattern-briefs/{PATTERN_BRIEF_FILE}`

<!-- Replace {PATTERN_BRIEF_FILE} with one of:
- 03-dcb.md (Dynamic Consistency Boundaries)
- 04-reactive-projections.md
- 05-ecst-fat-events.md
- 06-reservation-pattern.md
- 07-integration-patterns.md
- 08-agent-as-bc.md
- production-hardening.md
-->

## Process

1. **Read the guides:**
   - `delivery-process/PLANNING-SESSION-GUIDE.md` - Planning session workflow
   - `delivery-process/templates/planning-session-spec.feature.template` - Template structure

2. **Read the pattern brief** specified above

3. **Check existing spec** (if any exists, enhance it):
   - Look in `delivery-process/specs/platform/` for existing spec

4. **Read reference implementation:**
   - `delivery-process/specs/platform/projection-categories.feature` - Shows rich Gherkin patterns

5. **Create/Update the roadmap spec** following the conversion checklist:

   **NOTE on Rule keyword:** Roadmap specs use `Rule:` for organizing scenarios.
   When Tier 2 executable specs are created, step definitions must use
   `Rule() + RuleScenario()` pattern in vitest-cucumber (NOT `Scenario()` directly).
   - [ ] Extract metadata (phase, dependencies, effort)
   - [ ] Structure Problem/Solution from pattern brief
   - [ ] Build deliverables table with Location, Tests, Test Type
   - [ ] Convert each major table to a Rule with DataTable
   - [ ] Create code example DocStrings
   - [ ] Add acceptance scenarios (at least one per Rule)
   - [ ] Set `@libar-docs-executable-specs` tag
   - [ ] Validate all required tags present

6. **Verify:** Run `pnpm docs:all` to ensure the spec is valid

## Expected Output

A file at `delivery-process/specs/platform/{pattern-name}.feature` that:

- Uses `@libar-docs-status:roadmap`
- Has `@libar-docs-executable-specs` pointing to future package spec location
- Contains 3-5 Rules covering major concepts from the pattern brief
- Includes DataTables for structured data (category tables, guidelines)
- Includes DocStrings for code examples
- Has at least one `@acceptance-criteria` scenario per Rule

## Session Complete When

- [ ] Spec file exists at correct location
- [ ] `pnpm docs:all` runs without errors for this spec
- [ ] All checklist items above are addressed
- [ ] Status is `roadmap` (NOT `active` or `completed`)

---

## Quick Reference: Pattern Brief → Phase Mapping

| Pattern Brief              | Phase | Existing Spec?          |
| -------------------------- | ----- | ----------------------- |
| 03-dcb.md                  | 16    | Yes - needs enhancement |
| 04-reactive-projections.md | 17    | Yes - needs enhancement |
| 05-ecst-fat-events.md      | 20    | Yes - needs enhancement |
| 06-reservation-pattern.md  | 20    | Yes - needs enhancement |
| 07-integration-patterns.md | 21    | Yes - needs enhancement |
| 08-agent-as-bc.md          | 22    | Yes - needs enhancement |
| production-hardening.md    | 18    | Yes - needs enhancement |
