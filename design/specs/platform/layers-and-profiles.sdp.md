---
id: spec:platform.layers-and-profiles
kind: rule
altitude: feature
readiness: defined
relations:
  refines: spec:platform.transactional-domain-platform
  decidedBy: spec:decisions.d18-everything-else-waits-for-trigger
---
# Layers and profiles

Feature · Detail: full transcription · Traces: Thesis (layers, profiles, first stopping point, done-when criteria), D13, D16, D17, D18.

Seven layers, numbered 0 to 6, each usable before the next exists. Profiles group them so that an application installs only the machinery its capabilities need. The rules below carry the doc's list of layers, its profile groupings, the isolation rule between profiles, the order of building, the first stopping point and the three criteria that say when a profile is done. The layer number is also the first coordinate of every acceptance scenario, because a scenario's layer is the first layer that makes its capability available.

In this corpus the families map to layers as follows: kernel is Layer 0; context and command are Layer 1; application, constraints and operations are Layer 2; obligations and effects are Layer 3; processes is Layer 4; agents is Layer 5; advanced is Layer 6. The platform, laws, decisions and facts families apply to every layer.

## Intent

- outcome: Each layer is usable before the next exists, profiles group the layers, and a lower profile never imports, mounts or configures a higher profile's machinery (Thesis)
- value: A transactional application ships with Layers 0 to 2 only, and the durable, workflow and agent profiles are added when their triggers appear rather than carried from the start (Thesis, D18)
- risk: The layering is only as honest as the build keeps it; a lower layer that quietly imports a higher one turns the profile rule into a document that names a mechanism nobody retained (Thesis, Existing systems)

## Rule

- Layer 0 is the domain: commands, events, `decide` and `evolve`, invariants, small state machines (Thesis)
- Layer 1 is one context: a component with its state and journal, authorized commands, idempotency, queries (Thesis)
- Layer 2 is the composed application: a second context, atomic use cases, read models, rebuild (Thesis)
- Layer 3 is obligations: local reactions, external effects, recovery, operator exits (Thesis)
- Layer 4 is processes: Workflow, time and human waits, approvals, compensation (Thesis)
- Layer 5 is agents: proposals, policy, budgets, provider accounting (Thesis)
- Layer 6 is advanced reads, each installed on its own trigger (Thesis, D18)
- Each layer is usable before the next exists (Thesis)
- The transactional profile is Layers 0 to 2, the durable profile adds Layer 3, and the workflow or agent profile adds the parts of Layers 4 and 5 it needs; Layer 6 is optional for all (Thesis)
- A lower profile never imports, mounts or configures a higher profile's machinery (Thesis)
- Security, bounded resource use, useful errors and tests start in Layer 1 (Thesis)
- Build one thin use case through a layer before making the layer generic (Thesis)
- The first stopping point is Layer 2: a two-context application whose core correctness and essential screens need no background job (Thesis)
- A profile is done when growth stays cheap (Thesis)
- The transactional profile is done when a new feature needs only its domain input, events and decision, one command or use-case binding, and the read model it actually uses, and a maintainer can trace its success and failure without unrelated queue, agent or governance registries (Thesis)
- The durable profile is done when adding an effect means supplying its policy and handler, while the module supplies dispatch, recovery, inspection and retention (Thesis)
- The agent profile is done when the reasoning can be replaced while authority, command correctness and provider accounting stay deterministic (Thesis)
- Layers 3 to 6 are installed only when their trigger appears; their detail today is as deep as the design needs, and the build that triggers a layer writes the rest (D13, D16, D17, D18)
- A scenario's layer is the first layer that makes the capability available (Acceptance scenarios)

## Verification — reviewed

- A reviewer confirms with a graph query that no Layer 0 to 2 Spec declares `dependsOn` toward a Layer 3 to 6 Spec, and that no kernel Spec declares `dependsOn` toward a context or command Spec.
- A reviewer confirms that every Layer 4 to 6 Spec opens with a deferral line and states `scoped`.
