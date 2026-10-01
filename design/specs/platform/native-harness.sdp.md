---
id: spec:platform.native-harness
kind: rule
altitude: feature
readiness: defined
relations:
  refines: spec:platform.acceptance-contract
---
# The native harness

Feature · Detail: extension · Traces: Acceptance scenarios (tiers, evidence), S13, Sc L2-9, D11, E-13, E-15.

The doc says that native tests prove component and nested-mutation behavior, scheduling, contention and deployment, that the kernel's fixture app is separate from the example app, that test-only functions never ship and that every test owns its disposable backend. It does not say how a test obtains an identity, what the fixture app contains, how a fault enters a run, what a test may read or what it controls. This Spec carries those rules as two extensions, E-13 and E-15. Every rule here is the corpus's provisional reading until the owner rules. The doc's own rules on tiers and evidence stay in `spec:platform.acceptance-contract`.

## Intent

- outcome: A native test runs on a backend it owns, as an ordinary caller, on a named composition, and asserts only what a client or the harness's admin access can read (Acceptance scenarios)
- value: Every later slice builds its native tests on this harness, so a harness that is more privileged or more lenient than production lowers the worth of every native pass (Sc L2-9)
- risk: One backend per test costs a process start, a deploy and a teardown per test, and a harness that leaks a process or a port fails tests that did nothing wrong (Acceptance scenarios)
- assumption: Native tests run against a local Convex backend as S13 describes; the testing guide S13 links obtains a test's identity through the backend's admin key acting as that identity, which this harness does not use for a caller under test (S13, E-13)

### Open questions

- [non-blocking] Extension E-13: the doc says native acceptance runs with production authority and a disposable backend per test and does not say how a test obtains a signed identity, which a production issuer cannot mint for a throwaway backend; the option taken here is a fixture issuer: a composition that runs natively reads its issuer, application ID and key set from the deployment's environment variables, the harness sets the key set to a data URI whose private key it holds, and each caller under test is an ordinary client carrying a token the harness signs; the option first taken, the backend's admin key acting as an identity, was dropped on 2026-10-01 because such a caller passes Convex's visibility check for internal functions, which `spec:platform.native-harness.admin-key-acting-as-identity-reaches-internal-function` shows; this reading reaches into production, because running the production composition natively with no changed file means the example application's `auth.config.ts` is a `customJwt` provider whose trust root is whatever the deployment's environment names, and a provider that fetches its keys from an issuer's own endpoint cannot be run on a disposable backend this way; the owner rules on both halves, the test identity and the production provider (E-13, S13, Sc L2-9, D11)
- [non-blocking] Extension E-15: the doc does not say what the fixture app contains, how a fault enters a run, what a test may observe, or what a test controls on a backend that offers no clock and no scheduler switch; the option taken here is the rules below; two of them read the doc for the owner: the production-configuration run of Sc L2-9 is taken as the scenarios routed to the production composition, where the corpus earlier asked for the full Layer 0 to 2 suite on a release build, and evidence records that back a pass claim are kept in the repository; whether the durations Layer 3 pins become configuration, so that a test can outwait them, is left to Layer 3 (E-15, Acceptance scenarios, Sc L2-9)

## Rule

- [extension] Parity with a release for Sc L2-9 means the same code path, schema, concurrency and authority model: the grants, namespaces, entry points and actor mapping, and Convex's own visibility check on every call a caller under test makes (E-13, S13, Sc L2-9)
- [extension] A caller under test is an ordinary client that carries a token signed by the fixture issuer, or no token (E-13)
- [extension] A composition that runs natively reads its issuer, its application ID and its key set from the deployment's environment variables, and the harness sets the key set to a data URI that holds the fixture issuer's public key (E-13, S13)
- [extension] No caller under test carries the admin key, alone or acting as an identity, because a call made with it passes Convex's visibility check (E-13)
- [extension] The fixture issuer is the identity source of a native run and its one named difference from production; it is recorded as the identity source and is not an adjusted configuration (E-13, Sc L2-9)
- [extension] The harness uses the admin key to deploy, to set environment variables, to read stored data and the function log, and to run fixture functions (E-15)
- [extension] An assertion about authority, identity or visibility is made through an ordinary client (E-15, E-13)
- [extension] A native scenario runs on one of two compositions, the fixture composition or the production composition, and its example names which (E-15)
- [extension] The fixture composition mounts the shared libraries beside fixture contexts and fixture functions; the production composition is the example application with no test-only function registered (E-15, Acceptance scenarios)
- [extension] A scenario runs on the production composition unless it needs a fixture-only state or operation, a fault or a fixture function (E-15)
- [extension] The production-configuration run of Sc L2-9 is the scenarios routed to the production composition, deployed with no test-only function and no adjusted configuration (E-15, Sc L2-9)
- [extension] A scenario on the fixture composition is native evidence for its own row; it runs the shared libraries with their own tables and the same authority model, beside fixture contexts whose state is the fixture's own (E-15, First experiment)
- [extension] The shared libraries carry no test hook: they read no flag and take no callback that exists only for a test (E-15)
- [extension] A fault enters a native run only through something the fixture composition supplies: a fixture context's declaration, a fixture function, or a dependency the libraries take from every composition (E-15)
- [extension] A native assertion reads only what a client or the harness's admin access can read: a returned value, the data of a thrown error, stored documents and the function log (E-15)
- [extension] Where a scenario asserts that something did not run, the test shows the refusal's own error, shows that nothing the thing writes is stored, and shows on the same deployment that the thing exists and runs when called with admin access; where no error tells a refusal from a failure, the fixture composition supplies a part that fails the call if it runs (E-15)
- [extension] The native tier controls a run through four things: the backend process, its clients, the deployment's environment variables and, on the fixture composition, fixture functions (E-15)
- [extension] The harness starts the backend on fresh storage, stops it, kills it, and restarts it on the same storage (E-15, S13)
- [extension] A client under test may close, and may lose a response (E-15)
- [extension] The native tier cannot move the backend's clock and cannot switch its scheduler off (E-15, S13)
- [extension] A scenario that needs time to pass waits in real time or shortens a duration that its owning Spec makes configuration, and a run with a shortened duration is adjusted configuration (E-15, Acceptance scenarios)
- [extension] A native run's record names the backend that ran by its release and by the hash of the executable, the identity source, and the commit with whether the tree was clean (E-15, Acceptance scenarios)
- [extension] A claim that a tier passed cites a record that is kept in the repository and was made on a clean tree at the commit it names (E-15, Acceptance scenarios)

## Design

The harness is plain test support with no Convex function in it. The facts below were observed on 2026-10-01 on the backend release the repository pins, `precompiled-2026-09-28-5c7cb5b`, with `convex` 1.46.0.

- backend: [extension] the disposable backend is the `convex-local-backend` binary of one pinned release, checked against a recorded hash; the harness starts it on local ports with fresh storage, a generated instance secret and the admin key the binary derives from it, sets the environment variables, deploys the composition's function directory, and at the end of the test stops the process and removes the storage (E-15, S13)
- identity: [extension] a caller is a `ConvexHttpClient` or a `ConvexClient` whose `setAuth` carries a token the harness signs; `auth.config.ts` declares one `customJwt` provider whose `issuer`, `applicationID` and `jwks` are environment variables, so `ctx.auth.getUserIdentity()` in a public entry returns the shape a production token yields and `establishActor`, the grants read and the namespace rules run unchanged (E-13, S13, D11)
- adminReads: [extension] the harness reads a table of the app or of a component, and the function log's completion records, with the admin key; a table read returns every document with every Convex value intact or fails, never a sample, and a log read returns every completion record after a point the test marks (E-15)
- localWriteRate: [extension] the pinned local backend holds and then refuses writes past a rate, with `TooManyWrites` and the text "limited to 4 MiB bytes written per 1 second"; one transaction that writes 8.8 MiB commits, so the rate is not a bound on a transaction; a test that writes more than the rate paces its transactions, and a throughput measured on this backend states the limit (E-15, S13)
- evidenceKept: [extension] the record of the run a Spec or a commit cites is committed under `evidence/`; other runs' records are not kept (E-15, Acceptance scenarios)

## Verification — reviewed

- A reviewer confirms that every native example names its composition, and that no native test gives a caller under test the admin key except the one example that shows why not.
- A reviewer confirms that each example which asserts a refusal also shows, on the same deployment, that the refused thing exists.
