# Run evidence

Every native run writes one JSON record to `evidence/runs/`. Git ignores that directory. CI uploads the record of every push as an artifact of its run, and a claim that a tier passed names the commit and that run. No record is copied into the repository: the seven records beside this file are from before that rule and stay as history.

A record that backs a claim says `"clean": true`. It was made on a tree with no uncommitted and no untracked file, at the commit it names. A kept record names the commit it ran on, which is the parent of the commit that adds the record. That commit changes only `evidence/`. A record that says `"clean": false` backs no claim.

## What a record holds

- `commit` and `clean`: the commit that was checked out when the run started, and whether the tree was clean then.
- `command`, `startedAt`, `finishedAt` and `result`.
- `versions`: Node and the packages the tiers depend on, read from the installed packages.
- `tests`: one entry per test, with its result, its error messages, its backends and its measurements. A run that includes the native project records the tests of every project it ran, each with its `project`: `types`, `pure`, `simulator` or `native`.

A test's `backends` has one entry per backend that became ready. The harness writes the entry from the backend that ran:

- `executable`: the SHA-256 of the executable, where it came from and its release. The release is named only when the hash is the one `harness/backend-release.json` pins. Otherwise it is `null`.
- `identitySource`: the fixture issuer that the backend's environment variables named. The fixture issuer is the one difference from production in how a caller gets an identity. It is not adjusted configuration.
- `composition` and `installedLayers`: what the harness deployed.
- `environment`: the names of the environment variables the harness set.
- `dataset`: every backend starts on empty storage, so a test's data is what the test wrote.

## Measurements

A test records a measurement with `measure(name, value)` from `harness/native.ts`. The measurement is stored on the test that was running and appears under that test's entry. A value is plain JSON. A test that records a 64-bit integer or bytes writes it as text.

A probe records sizes such as timings and counts, and asserts only what its example binds. A size in a record is one machine's reading on one run.
