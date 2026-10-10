## Now: anchors in the code they bind, under the rulings of 2026-10-10

Until this arc, every implementation anchor of this corpus lived in a test. The platform's runtime code may not import the Protocol package, so `byFile` on a source file returned nothing, a hand-kept join (`design/tools/anchor-sites.json`) stood in for the binding, and code could name a design only by claiming to realize it. The Protocol's annotations arc, its plan 40 on the branch `feature/annotations-v0`, moves closer to the Protocol's original design: an anchor can be written as a doc comment, code can name a design it answers to without claiming to build it, and an anchor can say what architectural part its code plays. The owner ruled on the arc on 2026-10-10, and all three of its decisions now state `ready`. This branch pins the Protocol at `f23e358` (`04a6aff`), the head that carries the rulings, and applies them (`ecba393`); a second read by `gpt-6.1-sol` checked that pass against the code, and its fold-in follows `ed4f97f`.

**1. Anchors in the code they bind.** A comment-form anchor is a top-level `/** … */` block of reserved `@sdp` tags. The source carries it with no Protocol import, so the runtime pays nothing. The 22 implementation anchors that lived in nine test files are 46 units in `src/`, `example/` and `fixture/`, one per realizing file or site, beside 12 component anchors; the harness keeps its 18 constant-form anchors. No test file keeps an implementation anchor. The file is the binding grain of both forms: a block's line locates the anchor and names no declaration. The online rebuild, at the top of [`src/read-model/rebuild.ts`](https://github.com/libar-dev/libar-platform/blob/unit/design-in-the-graph/src/read-model/rebuild.ts#L2):

```ts
/**
 * @sdpAnchor impl:application.rebuild
 * @sdpLabel the online rebuild's operator entries, batch chains, tenant fill and batch bounds
 * @sdpReferences spec:application.rebuild
 * @sdpComponent component:platform.read-model
 * @sdpRole service
 */
```

**2. A reference runs one way.** A unit satisfies a Spec when it and the other units that satisfy it realize the whole Spec. A unit references a Spec when it answers to that design without claiming to realize it: it follows the design or realizes part of it, so a change to the design asks the code to follow. A reference confers no delivery fact and moves no floor. A design that builds on existing code says so by its own `dependsOn` or `refines` to the Spec the code satisfies, never by a reference from the code. So the online rebuild no longer references `spec:application.history-rebuild`, a design that builds on it; the history rebuild already depends on `spec:application.rebuild`. A reference kept only to give `byFile` an answer is gone too. The graph holds 49 `references` edges from 41 units, to 22 Specs.

**3. Whole Specs, honestly.** Anchor targets name whole Specs, so no unit satisfies a Spec while the Spec promises a part no unit builds, and a pinned declaration ahead of its code is such a part ([`design/PLAN.md`](https://github.com/libar-dev/libar-platform/blob/unit/design-in-the-graph/design/PLAN.md) 6.7 item 7). The rule, per Spec: list the entries no satisfying unit realizes; none, keep `satisfies`; a coherent part with its own trigger or step, split it into a child Spec and keep `satisfies` on the parent; otherwise write `references` until the code realizes what the Spec promises. The pass checked the twelve Specs the anchor check named against the code and found a thirteenth, `spec:command.receipt-table`; the second read found two more among the Specs the pass had left satisfied. Each holds a part no unit builds, running through entries the code realizes, so moving entries leaves none of them whole, and its units now reference it:

| Spec | What no unit builds |
|---|---|
| `spec:context.journal` | the baseline migration, the stream rebuild, the derived mapping's parts |
| `spec:context.tables` | the derived mapping's `streamParts` table |
| `spec:context.persistence-adapter` | migrate on load (step 3a), the derived state |
| `spec:context.queries` | the `history`, `rebuild` and `byOperation` queries |
| `spec:context.context-component` | those queries and the baseline writer in its surface |
| `spec:command.command-declaration` | the history projection binding, the tombstone retention |
| `spec:command.idempotency-and-receipts` | tombstones |
| `spec:command.receipt-table` | the tombstone row and its horizon |
| `spec:command.command-pipeline` | the history projection's write at step 9 |
| `spec:application.read-models` | the history read model's write path |
| `spec:application.generation-registry` | `sourceIndex` in the batch cursor |
| `spec:application.rebuild` | history targets in the shared rebuild config |
| `spec:application.orders-inventory-example` | the order allocation history bound to its commands, journal inspection |
| `spec:application.parent-use-cases` | the business failure policy (`carryOrReject`), the import command |
| `spec:application.projection-contract` | the history writer's callers in its `callers` entry |

`spec:kernel.outcome-model` is referenced for another reason. Its types in `src/kernel/outcome.ts` and its validators in `src/context/outcome.ts`, which gained an anchor, are built, but the model reserves three rejection codes for the adapter and gives every other code to a context, while the adapter also raises the boundary's `invalidInput`, as `spec:context.persistence-adapter` states. Two Specs disagree and the code follows one, so both units reference the model until the main thread rules which side changes. 9 Specs carry `implemented`, down from 24. [`docs/feedback/sdp-feedback-01.md`](https://github.com/libar-dev/libar-platform/blob/unit/design-in-the-graph/docs/feedback/sdp-feedback-01.md) holds the table with the entries, the code and the reason for each Spec.

**4. Components with an architectural layer and a context.** Twelve `component:` anchors declare the architecture where it is realized: three in each of the `adapter`, `application`, `domain` and `infrastructure` layers, with the contexts `platform` (7), `orders` (2), `inventory` (2) and `orders-inventory` (1), and `uses` between them. [`design/PLAN.md`](https://github.com/libar-dev/libar-platform/blob/unit/design-in-the-graph/design/PLAN.md) section 2.1 lists them with the owner's two rules. The layer rule: `domain` is business meaning with no runtime import; `application` coordinates a use case; `adapter` realizes a kernel or command contract against Convex; `edge` is transport in; `infrastructure` is a shared mechanism that owns no use case. The context rule: the platform is the key bounded context, with its own language; orders-inventory is the supporting context and development tool, the composition of the two business contexts it models; nothing in the platform's core carries orders-inventory specifics. A component satisfies its seam's design Spec or binds nothing its members bind: `component:platform.gate` satisfies the write pause it and its members realize whole, and the components whose seam is only partly built bind nothing.

**5. The isolation, read from the graph.** [`design/tools/check.py`](https://github.com/libar-dev/libar-platform/blob/unit/design-in-the-graph/design/tools/check.py) fails when a component in the context `platform` has a `uses` edge to a component in another context, each end resolved to its component directly or through `memberOf`. Today none of the 21 `uses` edges from the platform's seven components leaves it.

**6. Roles, and the sidecar gone.** 37 units name the part they play, in a vocabulary this corpus owns; recipe 28 reads the taxonomy and `check.py` prints it and judges none of it. `design/tools/anchor-sites.json` and its test are deleted. [`tests/pure/byfile-coverage.test.ts`](https://github.com/libar-dev/libar-platform/blob/unit/design-in-the-graph/tests/pure/byfile-coverage.test.ts) reads the anchors in the tree, checks they are the code units the graph holds, and asserts that `byFile` names every anchored file's units and their Specs. [`scripts/pack-page.mjs`](https://github.com/libar-dev/libar-platform/blob/unit/design-in-the-graph/scripts/pack-page.mjs) reads code from the graph alone, and the [Pack page](https://github.com/libar-dev/libar-platform/blob/unit/design-in-the-graph/design/pages/history-view.md#1-history-projection) lists each unit at its file and line with its role, its component's architectural layer and context, and a "References" list per member.

### The rulings

The Protocol's branch rules the arc through three decision Specs, and the owner states `ready` on all three. The paths are in the Protocol's repository on `feature/annotations-v0`; the pinned package ships the same files under `node_modules/@libar-dev/software-delivery-protocol/`.

| Ratified name | Ruling | Spec |
|---|---|---|
| the comment form (MD-36) | A top-level `/** … */` block of reserved `@sdp*` tags is a second form of an anchor, read into the same closed envelope as the constant form. No import is needed, comment prose authors nothing, and the file is the binding grain of both forms. Supersedes MD-35. | `specs/decisions/anchor-comment-form.sdp.md` |
| bindings are optional, plural, and may reference a design (MD-37) | `satisfies` is optional and plural and targets name whole Specs. The `references` edge says the code answers to a design without claiming to realize it, runs from code to design only, and confers no delivery fact. | `specs/decisions/anchor-binding-grain.sdp.md` |
| architectural significance is annotated where it is realized (MD-38) | A code anchor may carry a `role`, and a `component:` anchor a `layer` from a closed set of five and a `context`; the component anchor is the declared component. Roles stay a free vocabulary each corpus owns. Supersedes MD-30 and MD-34. | `specs/decisions/architectural-annotation.sdp.md` |

### Try it

From the repository root, after `npm ci`. Measured on 2026-10-10 at the fold-in of the second read, the commit after `ed4f97f`. Re-run the commands rather than inherit these numbers.

```sh
npx sdp q 'return g.byFile("src/read-model/rebuild.ts")' --json
```

```json
{
  "path": "src/read-model/rebuild.ts",
  "nodes": [{ "id": "impl:application.rebuild", "nodeType": "CodeNode", "line": 2 }],
  "specs": ["spec:application.rebuild"]
}
```

Recipe 27 over `pack:history-view`, taken from the pinned package's catalog with only the Pack swapped in. Beside the three facts it now derives what each member builds on: the implemented Specs it depends on or refines, with their units.

````sh
R=node_modules/@libar-dev/software-delivery-protocol/docs/agent-surface/recipes.md
npx sdp q "$(awk '/^## 27\./{f=1} /^## 28\./{f=0} f' "$R" | awk '/^```js/{c=1; next} /^```/{if (c) exit} c' | sed 's/pack:spec-studio-v1/pack:history-view/')" --json
````

```json
{
  "found": true,
  "id": "pack:history-view",
  "totals": { "members": 19, "withReferences": 10, "withImplementations": 2, "withVerifier": 7, "withBuildsOn": 11, "unbound": 7 },
  "rows": [
    {
      "id": "spec:application.history-projection",
      "resolved": true,
      "referencedBy": [{ "id": "impl:application.order-allocation-history", "file": "example/domain/orderAllocationHistory.ts" }],
      "implementedBy": [],
      "hasVerifier": false,
      "buildsOn": [
        { "id": "spec:context.event-envelope", "via": "dependsOn", "implementedBy": [{ "id": "impl:context.event-envelope", "file": "src/context/envelope.ts" }] }
      ]
    },
    …
  ]
}
```

```sh
npx sdp validate .
```

```
243 specs · 6 packs · 180 anchors → 429 nodes · 1497 edges (0 errors, 0 warnings)
…
validate: 0 errors · 12 warnings (conformance + honesty over the one graph)
```

The 12 warnings are the prose mentions listed in `design/tools/prose-mentions.json`.

```sh
npm run check
```

```
243 specs · 6 packs · 180 anchors → 429 nodes · 1497 edges (0 errors, 0 warnings)
validate: 0 errors · 12 warnings, 12 prose mentions listed; readiness divergence: []
entry addresses outside the Specs: 497; dependsOn cycles: 0
architecture: 76 code units; roles: codec 1, contract 6, decider 2, event-store 1, operator-entry 1, projection 2, query 5, read-model 1, schema 6, service 10, use-case 2; layers: adapter 3, application 3, domain 3, infrastructure 3; contexts: inventory 2, orders 2, orders-inventory 1, platform 7; 49 references edges from 41 units; platform isolation: 7 platform components, 21 uses edges from them, 0 into another context
…
Pack pages current: 1 of 1
protocol: file:vendor/libar-dev-software-delivery-protocol-0.0.0-f23e358.tgz

OK
```

`npm test` passed 1,141 tests in 74 files, with 10 skipped, the not-compared pairs.

### For the owner

The rulings of 2026-10-10 closed the layers, the contexts, `example/` as architecture, the reference direction and the whole-Spec satisfies. One item remains, from `docs/feedback/sdp-feedback-01.md`, section "2026-10-10, the rulings at `f23e358`":

- **The capability steps' name.** "Layer" names one of the seven steps of capability in this corpus and, as the Protocol's `layer`, a component's architectural layer; `CONTEXT.md` now writes the second in full. Renaming the steps, with "stage" as the candidate, is the one-word-one-meaning answer. It touches a Spec identity (`spec:platform.layers-and-profiles`), 143 numbered uses across 65 carriers and the decisions document this corpus follows, so the owner makes it deliberately.

Three leads go to a later pass (`design/STATE.md`, lead 47): seven of the sixteen Specs the pass and the second read moved hold a part with its own trigger or step that could split once its pinned declarations are narrowed to the code; two Spec corrections wait for the main thread, the adapter's `invalidInput` against the outcome model's reserved codes and the history writer's callers in the projection contract; and the platform's own Specs still carry orders-inventory worked examples in their Design entries, though its code uses nothing of the example.
