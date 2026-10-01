# Feedback to the Software Delivery Protocol from this corpus

A running file, addressed to the Protocol's maintainers. Each `adopt` unit and each slice that learns something about the Protocol adds a dated section at the top. The first report, with its eight proposals, is [`sdp-development-from-application-platform.md`](sdp-development-from-application-platform.md).

Every number here was measured on this corpus on the date of its section. Re-run before relying on one.

## 2026-10-01, adopting pull request 26 at `5993da7`

The corpus now depends on the Protocol at commit `5993da7b8f61ce00853b790cd9ffb428842b66d0`, the head of `feature/adopter-driven-hardening`.

### What blocks an adopter

1. **A dependency on the commit hash installs no CLI.** The pull request says the adopter can depend on the branch by commit hash. `npm install "github:libar-dev/software-delivery-protocol#5993da7…"` succeeds and installs `CONTEXT.md`, `docs/`, `specs/`, `.agents/` and `package.json`, with no `dist/` and no `node_modules/.bin/sdp`. `dist/` is ignored by git and the package has no `prepare` script, so nothing builds it on install. This corpus works around it: a clean clone at the commit, `npm ci`, `npm run build`, `npm pack`, and the tarball committed under `vendor/` as a `file:` dependency. A `prepare` script that runs the build would make the hash usable. So would a published prerelease.

2. **The CLI cannot say which engine it is.** `sdp --version` prints the usage text. The package version is `0.0.0` at every commit, and `graph.json` carries `schemaVersion` and nothing about the engine. This corpus was pinned to a sibling checkout's `dist/` until today. When the unbound-example change landed there, the corpus's own check failed with not one Spec changed: 54 expected warnings became 0. An adopter could not tell the tool moving from the corpus moving. The check now prints the dependency string from `package.json`. A `--version` that prints the package version and the commit it was built from would let any adopter record what produced a result.

### What worked, against the acceptance tests in plan 39

| Proposal | Test | Result |
|---|---|---|
| P2 | Unicode angle brackets become real ones and validate stays clean | 496 characters on 114 lines of 29 Specs replaced, every one inside an inline code span. `sdp validate design`: 0 errors, 0 warnings |
| P4 | Validate prints no warning on a corpus with no test anchors | 0 warnings, down from 54 |
| P3 | The assumed facts state `scoped`, and readiness divergence names a dependent that states `ready` | F14, F15 and F17 state `scoped` behind a blocking question that names the probe. They have 11 distinct `constrainedBy` dependents. On a scratch copy, stating `ready` on one of them makes recipe 7 return that Spec |
| P5 | The census sentence and the open-question table come from commands | Both hand-kept registers are deleted from the README. `sdp census` gives the counts. Recipe 20 gives 129 questions on 67 Specs, 12 of them blocking |

The authoring skill's section on what is not settled was applied as written, in two places. Nine deferred Specs each carry a blocking question that names the trigger. Three assumed facts each carry a blocking question that names the probe. Both were one-word edits to questions the corpus already had, and the corpus's own rule that a blocking question forces `scoped` agreed with the floor without a change.

Five checks left this corpus's check script because the Protocol now covers them: one warning per example, the README's warning count, the census sentence, the open-question tally and the open-question table.

### Smaller things

- **Recipe bodies are only in a Markdown file.** A script that wants recipe 20 has to cut the fenced block out of `recipes.md`. One file per body beside the catalog would let an adopter run `sdp q "$(cat …/20-open-question-register.js)"`. That adds no query verb, so it stays inside the agent-front-door ruling.
- **Recipe 22 on this corpus:** 153 mentions, 112 pairs, 34 backed, 78 unbacked, none unresolved. Of the 78, 28 are declared from the target's side and 50 from neither. The `declaredByTarget` column is what makes the list usable: it separates a parent naming its child from a relation nobody declared. Whether the 50 are missing relations or plain pointers is not known yet. The slices will say, one family at a time, and the answer bears on what the checked-mentions decision should warn about.
- **The derived step contracts are a head start.** `validate` writes 71 contract modules under `generated/contracts/`, one per example and per example space. The first tests in this repository will bind to them.

### Still wanted from the open questions on the pull request

- Authored order for `design` entries (`spec:extraction.open-section-order`). The Design Review still shows this corpus's pinned declarations alphabetized inside a JSON block, which is how a reviewer reads its 762 keyed Design entries today.
- Checked mentions (`spec:decisions.checked-mentions`). One concept stated in two Specs that disagree is still this corpus's largest class of defect, and the validator cannot see it.
