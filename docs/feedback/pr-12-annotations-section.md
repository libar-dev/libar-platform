## Now: anchors in the code they bind (2026-10-09)

Until this unit, every implementation anchor of this corpus lived in a test. The platform's runtime code may not import the Protocol package, so `byFile` on a source file returned nothing, a hand-kept join (`design/tools/anchor-sites.json`) stood in for the binding, and code could name a design only by claiming to realize it. The Protocol's annotations arc, its plan 40 on the branch `feature/annotations-v0`, moves closer to the Protocol's original design. An anchor can be written as a doc comment. Code can name a design it is written against without claiming to build it. An anchor can say what architectural part its code plays. This branch pins the Protocol at `da56a34` (`fd5b257`) and adopts the arc (`57ed4f8`).

**1. Anchors in the code they bind.** A comment-form anchor is a top-level `/** … */` block of reserved `@sdp` tags. The source carries it with no Protocol import, so the runtime pays nothing. The 22 implementation anchors that lived in nine test files are now 45 units in `src/`, `example/` and `fixture/`, one per realizing file or site, plus 12 component anchors. No test file keeps an implementation anchor; the harness keeps its 18 constant-form anchors. The online rebuild, at the top of [`src/read-model/rebuild.ts`](https://github.com/libar-dev/libar-platform/blob/unit/design-in-the-graph/src/read-model/rebuild.ts#L2):

```ts
/**
 * @sdpAnchor impl:application.rebuild
 * @sdpLabel the online rebuild's operator entries, batch chains, tenant fill and batch bounds
 * @sdpSatisfies spec:application.rebuild
 * @sdpReferences spec:application.history-rebuild
 * @sdpComponent component:platform.read-model
 * @sdpRole service
 */
```

**2. `byFile` answers for `src/`.** `byFile("src/read-model/rebuild.ts")` names `spec:application.rebuild` and `spec:application.history-rebuild`, and the files under `src/gate/` and `src/kernel/` name theirs. [`tests/pure/byfile-coverage.test.ts`](https://github.com/libar-dev/libar-platform/blob/unit/design-in-the-graph/tests/pure/byfile-coverage.test.ts) asserts that `byFile` names each of the 50 file and Spec pairs the old join listed, across 45 files.

**3. Components with a layer and a context.** Twelve `component:` anchors declare the architecture where it is realized: three in each of the `adapter`, `application`, `domain` and `infrastructure` layers, with the contexts `platform` (7), `orders` (2), `inventory` (2) and `orders-inventory` (1), and `uses` between them. The read-model library in [`src/read-model/index.ts`](https://github.com/libar-dev/libar-platform/blob/unit/design-in-the-graph/src/read-model/index.ts#L2) is `application` in `platform` and uses the kernel, the context, the command and the gate. The mapping is provisional until the owner rules on it (below).

**4. Roles.** 36 units name the part they play, in a vocabulary this corpus owns: `service` 10, `schema` 6, `contract` 5, `query` 5, `decider` 2, `projection` 2, `use-case` 2, and one each of `codec`, `event-store`, `operator-entry` and `read-model`. Recipe 28 reads the taxonomy from the graph, and [`design/tools/check.py`](https://github.com/libar-dev/libar-platform/blob/unit/design-in-the-graph/design/tools/check.py) prints it and judges none of it. The gate's four operator entries in [`src/gate/entries.ts`](https://github.com/libar-dev/libar-platform/blob/unit/design-in-the-graph/src/gate/entries.ts#L7) are the one `operator-entry`.

**5. References into the history-view design, without claiming realization.** A unit that realizes a Spec satisfies it. A unit written against a design references it, and the reference confers no delivery fact and moves no floor. The graph holds 20 `references` edges from 19 units. Recipe 27 over `pack:history-view` puts three facts side by side for each of its 19 members: 7 are referenced, 11 implemented, 7 have a verifier, and 6 have none of the three.
- `spec:application.history-projection` is referenced by the order allocation history's rules in `example/domain/orderAllocationHistory.ts`, and `spec:application.history-rebuild` by the online rebuild. Neither reads as `implemented`.
- `src/kernel/outcome.ts` references `spec:kernel.outcome-model` instead of satisfying it, because that Spec's open question `#outcomeRejectionContract` asks the owner to confirm the shapes before code names them.
- The Pack page lists each unit at its file and line, with its role and its component's layer and context, and a "Referenced by" list per member: [`design/pages/history-view.md`, member 1](https://github.com/libar-dev/libar-platform/blob/unit/design-in-the-graph/design/pages/history-view.md#1-history-projection).

**6. The sidecar is gone.** `design/tools/anchor-sites.json`, its pure test and the page's reading of it are deleted. [`scripts/pack-page.mjs`](https://github.com/libar-dev/libar-platform/blob/unit/design-in-the-graph/scripts/pack-page.mjs) reads code from the graph alone.

**What still binds loosely.** A block binds by file and line. Move the declaration from under it, or delete it, and the block still binds. The Protocol's open question `#attachmentIdentity` on `spec:decisions.anchor-comment-form` asks whether a CodeNode should record the symbol it binds.

### The rulings

The Protocol's branch rules the arc through three decision Specs, each at `defined` and held for the owner's `ready`. The paths are in the Protocol's repository on `feature/annotations-v0`; the pinned package ships the same files under `node_modules/@libar-dev/software-delivery-protocol/`.

| Ratified name | Ruling | Spec |
|---|---|---|
| the comment form (MD-36) | A top-level `/** … */` block of reserved `@sdp*` tags is a second form of an anchor, read into the same closed envelope as the constant form. No import is needed, comment prose authors nothing, and a zero-dependency `/anchors` subpath ships the builders. Supersedes MD-35. | `specs/decisions/anchor-comment-form.sdp.md` |
| bindings are optional, plural, and may reference a design (MD-37) | `satisfies` is optional and plural, an identity-only anchor is lawful, and the `references` edge says code is written against a design while conferring no delivery fact. | `specs/decisions/anchor-binding-grain.sdp.md` |
| architectural significance is annotated where it is realized (MD-38) | A code anchor may carry a `role`, and a `component:` anchor a `layer` from a closed set of five and a `context`; the component anchor is the declared component. Supersedes MD-30 and MD-34. | `specs/decisions/architectural-annotation.sdp.md` |

### Try it

From the repository root, after `npm ci`. Measured on 2026-10-09 at `57ed4f8`; re-run the commands rather than inherit these numbers.

```sh
npx sdp q 'return g.byFile("src/read-model/rebuild.ts")' --json
```

```json
{
  "path": "src/read-model/rebuild.ts",
  "nodes": [{ "id": "impl:application.rebuild", "nodeType": "CodeNode", "line": 2 }],
  "specs": ["spec:application.history-rebuild", "spec:application.rebuild"]
}
```

Recipe 27 over `pack:history-view`, taken from the pinned package's catalog with only the Pack swapped in:

````sh
R=node_modules/@libar-dev/software-delivery-protocol/docs/agent-surface/recipes.md
npx sdp q "$(awk '/^## 27\./{f=1} /^## 28\./{f=0} f' "$R" | awk '/^```js/{c=1; next} /^```/{if (c) exit} c' | sed 's/pack:spec-studio-v1/pack:history-view/')" --json
````

```json
{
  "found": true,
  "id": "pack:history-view",
  "totals": { "members": 19, "withReferences": 7, "withImplementations": 11, "withVerifier": 7, "unbound": 6 },
  "rows": [
    {
      "id": "spec:application.history-projection",
      "resolved": true,
      "referencedBy": [{ "id": "impl:application.order-allocation-history", "file": "example/domain/orderAllocationHistory.ts" }],
      "implementedBy": [],
      "hasVerifier": false
    },
    …
  ]
}
```

```sh
npx sdp validate .
```

```
243 specs · 6 packs · 179 anchors → 428 nodes · 1501 edges (0 errors, 0 warnings)
…
validate: 0 errors · 12 warnings (conformance + honesty over the one graph)
```

The 12 warnings are the prose mentions listed in `design/tools/prose-mentions.json`.

```sh
npm run check
```

```
243 specs · 6 packs · 179 anchors → 428 nodes · 1501 edges (0 errors, 0 warnings)
validate: 0 errors · 12 warnings, 12 prose mentions listed; readiness divergence: []
entry addresses outside the Specs: 497; dependsOn cycles: 0
architecture: 75 code units; roles: codec 1, contract 5, decider 2, event-store 1, operator-entry 1, projection 2, query 5, read-model 1, schema 6, service 10, use-case 2; layers: adapter 3, application 3, domain 3, infrastructure 3; contexts: inventory 2, orders 2, orders-inventory 1, platform 7; 20 references edges from 19 units
…
Pack pages current: 1 of 1
protocol: file:vendor/libar-dev-software-delivery-protocol-0.0.0-da56a34.tgz

OK
```

`npm test` passed 1,140 tests in 74 files, with 10 skipped, the not-compared pairs.

### For the owner

From `docs/feedback/sdp-feedback-01.md`, section "2026-10-09, anchors in the source at `da56a34`":

- **The layers.** The context library and the two context components are `adapter`, with `infrastructure` the alternative; the gate is `infrastructure`, with `application` the alternative.
- **The contexts.** Every `src/` package is `platform`, and the parent composition is `orders-inventory` because it spans both bounded contexts.
- **Whether `example/` is architecture.** As the production composition it has five components; as a sample it would keep its units and lose them.
- **The reference direction.** `impl:application.rebuild` references `spec:application.history-rebuild`, a design that rests on the online rebuild rather than one the rebuild was written against. This is the Protocol's open question `#referenceDirection` on `spec:decisions.anchor-binding-grain`, met in this corpus.

And from this corpus's language: **the word layer.** `CONTEXT.md` defines a layer as one of the seven steps of capability; the Protocol's `layer` places a component among edge, application, domain, adapter and infrastructure.

A `gpt-6.1-sol` check of every anchor claim against the code it sits on (`job-mv1dotsu-5f1f42fd`) is still running; its fold-in is pending.
