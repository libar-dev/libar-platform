---
id: spec:platform.acceptance-contract
kind: rule
altitude: feature
readiness: defined
relations:
  refines: spec:platform.transactional-domain-platform
---
# The acceptance contract

Feature · Detail: full transcription · Traces: Acceptance scenarios (table, tiers, evidence), First experiment, S13, Sc L2-4, Sc L2-9, E-13, E-14, E-15.

The doc's acceptance table is the contract. It lists forty-three scenario rows by layer with a pass condition each, and states how each row is tested (the tier), what a test run must record (the evidence) and how readiness is stated. This Spec carries those rules. The rows themselves become example Specs under the component that first provides the capability, one example per row and one sibling example per enumerated case, so that each pass condition is a bound point in that component's example space; the plan's section 4 gives the assignment and the example IDs.

## Intent

- outcome: Every acceptance scenario is tested as behavior on the tier that can prove it, with recorded evidence, and readiness is stated in plain terms that a run can back (Acceptance scenarios)
- value: The scenarios are the spine of the decision method: a mechanism is justified only by a scenario the do-nothing option fails, so the contract is also the refutation surface for every mechanism (Decision method rule 3)
- risk: A native tier costs a disposable backend per test and a production-configuration run; skipping it leaves component, nested-mutation, scheduling and contention behavior proven only in a simulator, which is not native proof (Acceptance scenarios)
- assumption: Native tests run against a local Convex backend as S13 describes; the testing guide S13 links obtains a test's identity through the backend's admin key acting as that identity, which the harness does not use for a caller under test (S13, E-13)

### Open questions

- [non-blocking] Extension E-13: the doc says native acceptance runs with production authority and a disposable backend per test and does not say how a test obtains a signed identity, which a production issuer cannot mint for a throwaway backend; the option taken here is a fixture issuer: the composition's `auth.config.ts` reads its issuer, application ID and key set from the deployment's environment variables, the harness sets them to an issuer name and a data-URI key set whose private key it holds, and each caller under test is an ordinary client carrying a token the harness signs, so the actor mapping, grants, namespaces, entry points and Convex's own visibility check run as in production and the issuer named by the environment is the one difference; the option first taken, the local backend's admin key acting as an identity, was dropped on 2026-10-01 because such a caller passes the visibility check for internal functions, which `spec:platform.acceptance-contract.admin-key-acting-as-identity-reaches-internal-function` shows on a native backend; the owner confirms (E-13, S13, Sc L2-9)
- [non-blocking] Extension E-14: the doc's four tiers, domain, simulator, native and end to end, name no compile-time check, while Sc L2-4's pass condition is a build, type or registration check that fails before any traffic; the option taken here is a fifth tier, the build tier, a compile of the fixture app with the change applied that asserts a non-zero `tsc` exit or a failed registration check, run as a step of the fixture app's build before the native suite and recorded like any run; the alternative, folding it into the native tier as a compile step that precedes the native run, was not taken because a native run needs a backend and the check needs none; the owner confirms (E-14, Sc L2-4, Acceptance scenarios)
- [non-blocking] Extension E-15: the doc says the kernel's fixture app is separate from the example app, that test-only functions never ship and that every test owns its disposable backend, and does not say what the fixture app contains, how a fault enters a run, what a test may observe, or what a test controls on a backend that offers no clock and no scheduler switch; the option taken here is the harness rules below: two compositions, faults only through parts the fixture composition supplies, assertions only on what a client or the harness's admin access can read, and four controls, the backend process, the clients, the environment variables and fixture functions; it reads the production-configuration run of Sc L2-9 as the scenarios routed to the production composition, where the corpus earlier asked for the full suite on a release build; whether the durations Layer 3 pins become configuration, so that a test can outwait them, is left to Layer 3; the owner confirms (E-15, Acceptance scenarios, Sc L2-9)

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
- [extension] Parity with a release for Sc L2-9 means the same code path, schema, concurrency and authority model: the grants, namespaces, entry points and actor mapping, and Convex's own visibility check on every call a caller under test makes; a native run authenticates each caller with a token signed by the fixture issuer that the deployment's environment variables name, and its evidence record names that issuer as the one difference from production (E-13, S13, Sc L2-9)
- [extension] The harness holds the disposable backend's admin key and uses it to deploy, to set environment variables, to read stored data and the function log, and to run fixture functions; a caller under test never carries it, because a call made with the admin key passes Convex's visibility check, and every assertion about authority, identity or visibility is made through an ordinary client (E-15, E-13)
- [extension] A native scenario runs on one of two compositions: the fixture composition, which mounts the shared libraries with fixture contexts, fixture functions and fixture-supplied parts, or the production composition, which is the example application with no test-only function registered; an example names its composition, and it runs on the production composition unless it needs a fixture-only state or operation, a fault or a fixture function (E-15, Acceptance scenarios)
- [extension] The shared libraries carry no test hook and read no test flag; a fault enters a native run only through a part the fixture composition supplies: a fixture context's own declaration, a fixture function, or a replaceable part it wires in place of the production one, such as the audit destination and the diagnostic sink (E-15, Acceptance scenarios)
- [extension] A native assertion reads only what a client or the harness's admin access can read: a returned value, the data of a thrown error, stored documents and the backend's function log; where a scenario asserts that something did not run, the fixture composition supplies a part that fails the call if it runs (E-15)
- [extension] The native tier controls a run through the backend process, which it starts on fresh storage, stops and restarts on the same storage; through its clients, which may close or discard a response; through the deployment's environment variables; and, on the fixture composition, through fixture functions; it cannot move the backend's clock or switch its scheduler off, so a scenario that needs time to pass waits in real time or shortens a duration that its owning Spec makes configurable, and that run is adjusted configuration (E-15, S13, Acceptance scenarios)
- [extension] The production-configuration run of Sc L2-9 is the scenarios routed to the production composition, deployed with no test-only function and no adjusted configuration; a scenario on the fixture composition runs the same libraries, schemas and authority model and is native evidence for its own row (E-15, Sc L2-9, First experiment)
- [extension] A build-tier scenario passes when a compile of the fixture app with the change applied fails at `tsc` or at the registration check before any deployment; the build tier is the fifth tier, named by Sc L2-4 alone, and needs no backend (E-14, Sc L2-4)

## Design

The corpus maps the doc's readiness words onto SDP's rungs without collapsing them: a Spec at `defined` is specified; implemented, tested and operationally accepted are delivery facts and run evidence that the graph derives from anchors and that no author states by hand.

- tierDomain: pure tests of `decide`, `evolve` and the fold with no I/O; Sc L0-1 and L0-2 (Acceptance scenarios)
- tierSimulator: outcome combinations, serialization and classification of the four outcomes and the error codes (Acceptance scenarios, D4)
- tierNative: a disposable local backend per test, production schemas and authority, proving component and nested-mutation behavior, scheduling, contention and deployment (Acceptance scenarios, S13)
- tierNativeBackend: [extension] the disposable backend is the `convex-local-backend` binary of one pinned release, which the harness starts on free local ports with fresh storage, a generated instance secret and the admin key the binary derives from it; the harness sets the environment variables, deploys the composition's function directory and, when the test ends, stops the process and removes the storage (E-15, S13)
- tierNativeIdentity: [extension] each caller under test is an ordinary `ConvexHttpClient` or `ConvexClient` whose `setAuth` carries a token the harness signs; the composition's `auth.config.ts` declares one `customJwt` provider whose `issuer`, `applicationID` and `jwks` come from the deployment's environment variables, and the harness sets `jwks` to a data URI holding the fixture issuer's public key, so `ctx.auth.getUserIdentity()` in the public entry returns the shape a production token yields and `establishActor`, the grants read and the namespace rules run unchanged; no production issuer is asked to sign for a disposable backend (E-13, S13, D11)
- tierEndToEnd: the production composition on a representative dataset; Sc L2-8, L2-9, L3-7, L4-3 (Acceptance scenarios)
- tierBuild: [extension] a compile of the kernel's fixture app with the change under test applied, asserting a non-zero `tsc` exit naming the caller or a failed registration check, run as a build step before the native suite with no backend; Sc L2-4 (E-14, Sc L2-4)
- evidenceRecord: commit, installed layers, backend and dependency versions, configuration, dataset, command and result, plus the difference from production when configuration was adjusted, and the identity source, which on the native tier is the fixture issuer the deployment's environment names and is the one difference a production-configuration run names (Acceptance scenarios, E-13)
- readinessWords: specified, implemented, tested under named conditions, operationally accepted; never a percentage or a score (Acceptance scenarios)

## Verification — reviewed

- A reviewer confirms that all forty-three scenario rows have example Specs, that each case a row enumerates and each alternative a scenario's text joins with "or" has its own sibling example, that a verification bullet adds assertions to a case and never stands in for one, and that each example names its tier and states the doc's pass condition as its outcome.
- A reviewer confirms that no example claims a passing run; the graph records a verifier's existence, never its result.
