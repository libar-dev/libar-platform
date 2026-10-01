---
id: spec:platform.acceptance-contract
kind: rule
altitude: feature
readiness: defined
relations:
  refines: spec:platform.transactional-domain-platform
---
# The acceptance contract

Feature · Detail: full transcription · Traces: Acceptance scenarios (table, tiers, evidence), First experiment, S13, Sc L2-4, E-14.

The doc's acceptance table is the contract. It lists forty-three scenario rows by layer with a pass condition each, and states how each row is tested (the tier), what a test run must record (the evidence) and how readiness is stated. This Spec carries those rules. The rows themselves become example Specs under the component that first provides the capability, one example per row and one sibling example per enumerated case, so that each pass condition is a bound point in that component's example space; the plan's section 4 gives the assignment and the example IDs. How a native test obtains an identity, what the fixture app contains and what a test controls are the rules of `spec:platform.native-harness`, which refines this Spec.

## Intent

- outcome: Every acceptance scenario is tested as behavior on the tier that can prove it, with recorded evidence, and readiness is stated in plain terms that a run can back (Acceptance scenarios)
- value: The scenarios are the spine of the decision method: a mechanism is justified only by a scenario the do-nothing option fails, so the contract is also the refutation surface for every mechanism (Decision method rule 3)
- risk: A native tier costs a disposable backend per test and a production-configuration run; skipping it leaves component, nested-mutation, scheduling and contention behavior proven only in a simulator, which is not native proof (Acceptance scenarios)
- assumption: Native tests run against a local Convex backend as S13 describes (S13)

### Open questions

- [non-blocking] Extension E-14: the doc's four tiers, domain, simulator, native and end to end, name no compile-time check, while Sc L2-4's pass condition is a build, type or registration check that fails before any traffic; the option taken here is a fifth tier, the build tier, a compile, with no backend, of a typed caller that states the change, which asserts that `tsc` refuses it, run with every type check and recorded like any run; the alternative, folding it into the native tier as a compile step that precedes the native run, was not taken because a native run needs a backend and the check needs none; the owner confirms (E-14, Sc L2-4, Acceptance scenarios)

## Rule

- Scenarios test behavior, not package names or the number of layers (Acceptance scenarios)
- A scenario's layer is the first layer that makes the capability available (Acceptance scenarios)
- Every scenario carries a pass condition, and the run passes only when that condition holds on the scenario's tier (Acceptance scenarios)
- Domain tests are pure (Acceptance scenarios)
- Simulator tests cover outcome combinations, serialization and classification (Acceptance scenarios)
- Native tests prove component and nested-mutation behavior, scheduling, contention and deployment (Acceptance scenarios, S13)
- A small end-to-end path runs the production composition (Acceptance scenarios)
- The kernel's fixture app is separate from the example app (Acceptance scenarios)
- Test-only functions never ship in production (Acceptance scenarios)
- Every test owns its disposable backend (Acceptance scenarios)
- A run records the commit, installed layers, backend and dependency versions, configuration, dataset, command and result (Acceptance scenarios)
- A simulator pass is not native proof (Acceptance scenarios)
- A link between source and test is not a passing run (Acceptance scenarios)
- A run with adjusted configuration states how it differs from production (Acceptance scenarios)
- Readiness is stated plainly as specified, implemented, tested under named conditions, or operationally accepted (Acceptance scenarios)
- The first experiment passes when every Layer 0, 1 and 2 scenario passes on a native backend (First experiment)
- The one all-layer scenario, breaking metrics and logging and separately breaking mandatory audit, applies to every installed layer (Sc ALL-1)
- [extension] A build-tier scenario passes when a typed caller that states the change fails `tsc` before any deployment; the build tier is the fifth tier, named by Sc L2-4 alone, and needs no backend (E-14, Sc L2-4)

## Design

The corpus maps the doc's readiness words onto SDP's rungs without collapsing them: a Spec at `defined` is specified; implemented, tested and operationally accepted are delivery facts and run evidence that the graph derives from anchors and that no author states by hand.

- tierDomain: pure tests of `decide`, `evolve` and the fold with no I/O; Sc L0-1 and L0-2 (Acceptance scenarios)
- tierSimulator: outcome combinations, serialization and classification of the four outcomes and the error codes (Acceptance scenarios, D4)
- tierNative: a disposable local backend per test, proving component and nested-mutation behavior, scheduling, contention and deployment (Acceptance scenarios, S13)
- tierEndToEnd: the production composition on a representative dataset; Sc L2-8, L2-9, L3-7, L4-3 (Acceptance scenarios)
- tierBuild: [extension] a type test of a composition's generated `api`: a reference to a name the module does not export, and a call that breaks the argument contract, each marked with the compiler's expected-error directive, so the compile fails when either stops being an error; run by the type check with no backend; Sc L2-4 (E-14, Sc L2-4)
- evidenceRecord: commit, installed layers, backend and dependency versions, configuration, dataset, command and result, plus the difference from production when configuration was adjusted (Acceptance scenarios)
- readinessWords: specified, implemented, tested under named conditions, operationally accepted; never a percentage or a score (Acceptance scenarios)

## Verification — reviewed

- A reviewer confirms that all forty-three scenario rows have example Specs, that each case a row enumerates and each alternative a scenario's text joins with "or" has its own sibling example, that a verification bullet adds assertions to a case and never stands in for one, and that each example names its tier and states the doc's pass condition as its outcome.
- A reviewer confirms that no example claims a passing run; the graph records a verifier's existence, never its result.
