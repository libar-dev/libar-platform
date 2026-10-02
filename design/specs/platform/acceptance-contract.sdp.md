---
id: spec:platform.acceptance-contract
kind: rule
altitude: feature
readiness: defined
relations:
  refines: spec:platform.transactional-domain-platform
---
# The acceptance contract

Feature · Detail: full transcription · Traces: Acceptance scenarios (table, tiers, evidence), First experiment, S13, Sc L2-4, E-14, E-15, E-17.

The doc's acceptance table is the contract. It lists forty-three scenario rows by layer with a pass condition each, and states how each row is tested (the tier), what a test run must record (the evidence) and how readiness is stated. This Spec carries those rules. The rows themselves become example Specs under the component that first provides the capability, one example per row and one sibling example per enumerated case, so that each pass condition is a bound point in that component's example space; the plan's section 4 gives the assignment and the example IDs. How a native test obtains an identity, what the fixture app contains and what a test controls are the rules of `spec:platform.native-harness`, which refines this Spec.

## Intent

- outcome: Every acceptance scenario is tested as behavior on the tier that can prove it, with recorded evidence, and readiness is stated in plain terms that a run can back (Acceptance scenarios)
- value: The scenarios are the spine of the decision method: a mechanism is justified only by a scenario the do-nothing option fails, so the contract is also the refutation surface for every mechanism (Decision method rule 3)
- risk: A native tier costs a disposable backend per test and a production-configuration run; skipping it leaves component, nested-mutation, scheduling and contention behavior proven only in a simulator, which is not native proof (Acceptance scenarios)
- assumption: Native tests run against a local Convex backend as S13 describes (S13)

### Open questions

- [non-blocking] Extension E-14: the doc's four tiers, domain, simulator, native and end to end, name no compile-time check, while Sc L2-4's pass condition is a build, type or registration check that fails before any traffic; the option taken here is a fifth tier, the build tier, a compile, with no backend, of a typed caller that states the change, which asserts that `tsc` refuses it, run with every type check and recorded like any run; the alternative, folding it into the native tier as a compile step that precedes the native run, was not taken because a native run needs a backend and the check needs none; the owner confirms (E-14, Sc L2-4, Acceptance scenarios)
- [non-blocking] Extension E-17: the doc says that a link between source and test is not a passing run and that the first experiment passes when every Layer 0, 1 and 2 scenario passes, and it does not say how a pass of the whole is established from runs; the option taken here is the acceptance check: the required scenarios are generated from the graph, one per example of a required row with its tier, composition and verifiers, and read against one run's record, so that a scenario with no verifier, with no result or with a result other than passed keeps the whole from passing; the alternative, a list of scenarios and verifiers kept by hand beside the tests, was not taken because the graph already holds each example's row, tier, composition and verifiers; the owner confirms (E-17, Acceptance scenarios, First experiment)

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
- [extension] Three statements about a scenario stay apart: it is bound when a verifier of its example resolves in the graph, it passed when a run's record holds a passing result of that verifier, and a set of scenarios is accepted only when the acceptance check finds every one of them passed in one record (E-17, Acceptance scenarios)
- [extension] No example and no test stands for another scenario: a bound step names what its own test runs, and a statement about every scenario of a layer is the acceptance check's to make (E-17, Acceptance scenarios)
- [extension] The acceptance check takes the rows a Spec requires and one run's record, derives its required scenarios from the graph, and passes only when every required scenario passed (E-17, First experiment)
- [extension] A required scenario is missing when its row has no example or its example has no enabled verifier, absent when the record holds no result of a verifier it has, failed when a result of a verifier is not passed or came from another tier or another composition than the example names, and passed otherwise; when its verifiers differ, failed wins over absent, so a scenario with one verifier failed and another absent is failed (E-17, Acceptance scenarios)
- [extension] The acceptance check passes only on a record whose run passed and whose tree was clean, and its answer names the record's commit (E-17, Acceptance scenarios)
- [extension] The corpus keeps no list of the scenarios that have a verifier or that passed: the first is read from the graph and the second from a record, each time the check runs (E-17)

## Design

The corpus maps the doc's readiness words onto SDP's rungs without collapsing them: a Spec at `defined` is specified; implemented, tested and operationally accepted are delivery facts and run evidence that the graph derives from anchors and that no author states by hand.

- tierDomain: pure tests of `decide`, `evolve` and the fold with no I/O; Sc L0-1 and L0-2 (Acceptance scenarios)
- tierSimulator: outcome combinations, serialization and classification of the four outcomes and the error codes (Acceptance scenarios, D4)
- tierNative: a disposable local backend per test, proving component and nested-mutation behavior, scheduling, contention and deployment (Acceptance scenarios, S13)
- tierEndToEnd: the production composition on a representative dataset; Sc L2-8, L2-9, L3-7, L4-3 (Acceptance scenarios)
- tierBuild: [extension] a type test of a composition's generated `api`: a reference to a name the module does not export, and a call that breaks the argument contract, each marked with the compiler's expected-error directive, so the compile fails when either stops being an error; run by the type check with no backend; Sc L2-4 (E-14, Sc L2-4)
- evidenceRecord: commit, installed layers, backend and dependency versions, configuration, dataset, command and result, plus the difference from production when configuration was adjusted (Acceptance scenarios)
- readinessWords: specified, implemented, tested under named conditions, operationally accepted; never a percentage or a score (Acceptance scenarios)
- typeRequiredScenario: [extension] `interface RequiredScenario { row: string; example: string | null; tier: "domain" | "simulator" | "native" | "end to end" | "build" | null; composition: "fixture" | "production" | null; verifiers: { id: string; file: string }[] }`; the check first reads every example Spec in the graph whose opening line begins with `Sc `, whether or not its row is required; an opening line it cannot read makes the check unable to answer, even when the row cannot be read; after all such opening lines can be read, the check makes one entry per example whose opening line names a required row, and one entry with no example for a required row that no example names (E-17)
- requiredScenarioSource: [extension] `row`, `tier` and `composition` are read from the opening line of the example's narrative, whose parts are separated by ` · `; every example Spec in the graph whose opening line begins with `Sc ` must have a readable row, tier and composition where one is named, whether or not its row is required or can be read; after removing a final full stop from a part, the first part is exactly the row, as in `Sc L2-3`, and the second is exactly a tier's name followed by the word `tier` and nothing else, as in `native tier`, so `native tierBROKEN` cannot be read; the third part, when it names a composition, must read exactly `fixture composition` or `production composition`; `composition` is `null` when the opening line names none, as it is for a domain, simulator or build example; `verifiers` are the example's enabled test anchors, each by its ID and its file (E-17, E-15)
- typeAcceptanceVerdict: [extension] `interface AcceptanceVerdict { result: "passed" | "not passed"; commit: string; clean: boolean; runResult: "passed" | "failed" | "interrupted"; scenarios: (RequiredScenario & { status: "passed" | "failed" | "absent" | "missing"; reason: string | null })[] }` (E-17)
- acceptanceRecord: [extension] the record the check reads is the run record of `spec:platform.native-harness`, made by one run of every test project together, so that it holds the results of the domain and build tiers beside the native ones (E-17, E-15)
- acceptanceJoin: [extension] a verifier's results are the record's test entries whose `file` is the verifier's file; a scenario passed when each of its verifiers has at least one result, every result is `passed` and of the project that runs the scenario's tier, `pure` for domain, `simulator` for simulator, `native` for native and end to end and `types` for build, and, for a native or end-to-end scenario, the example names a composition, the results between them name at least one backend, and every backend they name has that composition (E-17, E-15, E-14)
- acceptanceCommand: [extension] `npm run acceptance` checks the rows `acceptanceRows` of `spec:application.first-experiment` names against the newest record under `evidence/runs/` or against the record a path argument names; only a file that has the shape of a run record is a candidate for the newest record, which is the one whose own `startedAt` is the largest, with equal `startedAt` values resolved by choosing the file whose name sorts last; a record that cannot be parsed, or whose test entries do not have the shape of the record's type, is read as no record; it prints one line per required scenario with its row, example, tier, composition, verifier files, status and reason, and then one line, `acceptance: passed` or `acceptance: not passed`, with the count of each status, the run's result, whether the tree was clean and the record's commit (E-17)
- acceptanceExit: [extension] the command exits 0 when the check passes; 1 when a required scenario is failed or absent, the record's run did not pass or its tree was not clean; 3 when none of those holds and a required scenario is missing; and 2 when it cannot answer, which is no record, a graph that does not derive, a Spec that names no required row, an example Spec in the graph whose opening line begins with `Sc ` but whose row, tier or composition where named it cannot read, whether or not the row is required or can be read, or any other failure to answer; for every failure to answer it prints the one line `acceptance: cannot answer` with the reason and exits 2, so a failure to answer never ends without that line (E-17)

## Verification — reviewed

- A reviewer confirms that all forty-three scenario rows have example Specs, that each case a row enumerates and each alternative a scenario's text joins with "or" has its own sibling example, that a verification bullet adds assertions to a case and never stands in for one, and that each example names its tier and states the doc's pass condition as its outcome.
- A reviewer confirms that no example claims a passing run, and that no bound step speaks for a scenario its own test does not run; the graph records a verifier's existence, never its result.
