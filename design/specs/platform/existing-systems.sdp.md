---
id: spec:platform.existing-systems
kind: rule
altitude: feature
readiness: defined
relations:
  refines: spec:platform.transactional-domain-platform
  constrainedBy: spec:laws.law03-events-only-source-of-state
---
# Existing systems

Feature · Detail: full transcription · Traces: Existing systems, D3, D5, D8, D9, D19, Law 3.

The existing system is the current platform in the convex-event-sourcing repository at commit `538314e8a`, with its glossary at `libar-platform/packages/CONTEXT.md`. The design authorizes no deletion or migration of its data. It keeps the current implementation and its evidence as a baseline and maps each existing contract to the decision that continues, changes or retires it. The five bullets of the doc's section are the rules below; each one names the decision that gives its detail.

## Intent

- outcome: The current implementation and its data survive as a baseline, and every existing contract maps to a decision that continues, changes or retires it (Existing systems)
- value: No business event is invented, no history is silently rewritten and no dual write to old and new stores appears while the redesign lands (Existing systems, Law 3)
- risk: Keeping the old system as a baseline means keeping its evidence readable and its dispatch shims in place until accepted work is drained, which is a standing cost until the last old job is settled (Existing systems, D19)

## Rule

- This design authorizes no deletion or migration of existing data (Existing systems)
- Keep the current implementation and its evidence as a baseline, and map each existing contract to the decision that continues, changes or retires it (Existing systems)
- A retained central journal stays behind an adapter, or moves by a verified one-way migration that keeps event identities, stream versions, tenant and context scope, and reader compatibility (Existing systems, D2)
- No dual writes to old and new stores (Existing systems)
- Incomplete history stays audit-only, or gets a baseline event that starts a rebuildable epoch (Existing systems, D5)
- Past business events are never invented to satisfy the rebuild law (Existing systems, Law 3)
- An old queue or handler retires only after its accepted work is drained, migrated or settled; its dispatch shim stays while vendor jobs refer to it (Existing systems, D19)
- A read model moved into the command transaction needs one correct rebuild; changing future writes alone does not repair it (Existing systems, D8, D9)
- A mechanism with no retained obligations and no consumer does not survive because a document named it (Existing systems)
- The two authorities of today's decider, a `stateUpdate` the handler saves beside a separate `evolve`, are replaced by the one-authority rule, and the pure deciders and state machines are reused where they fit under it (D3, First experiment)

## Verification — reviewed

- A reviewer confirms that no Spec in the corpus describes a dual write, a rewrite of old events or an invented business event.
- A reviewer confirms that the first experiment reuses pure deciders under D3 and leaves the current app's infrastructure behind.
