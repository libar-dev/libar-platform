---
id: spec:context.context-component
kind: behavior
altitude: feature
readiness: defined
relations:
  refines: spec:platform.transactional-domain-platform
  dependsOn:
    - spec:kernel.domain-kernel
    - spec:command.actor-and-scope
  decidedBy:
    - spec:decisions.d02-context-owns-state-and-journal
    - spec:decisions.d05-rebuildable-history-with-baselines
    - spec:decisions.d11-tenant-scope-and-authority
  constrainedBy:
    - spec:laws.law01-sanctioned-writes-only
    - spec:laws.law02-state-and-events-commit-together
    - spec:laws.law03-events-only-source-of-state
    - spec:laws.law11-tenant-scope-named
    - spec:facts.f02-component-calls-commit-with-caller
    - spec:facts.f04-nested-calls-cost-more-than-helpers
    - spec:facts.f11-components-have-no-ctx-auth
    - spec:facts.f01-serializable-mutations-under-occ
    - spec:facts.f03-nested-run-mutation-partial-rollback
    - spec:facts.f13-transactions-have-limits
---
# The context component

Layer 1 · Detail: full · Traces: D2, D5, D7, D8, D10, D11, D12, Law 1, Law 2, Law 3, Law 11, F2, F4, F11, S2, S4, Probe 3, OQ1, Sc L1-1, Sc L1-10, Sc L1-11, E-22.

A bounded context is one Convex component. It owns its current state, its event journal and its stream metadata, and only its own mutations write them. The parent mounts one component per context, authenticates and authorizes, and calls the context through the component API with the tenant, the server-established actor and the operation's identity as arguments. Each such call is an isolated sub-transaction that commits with the caller and rolls back on a throw. The context exposes sanctioned operations that run the persistence adapter over the domain kernel, and authorized queries that return DTOs. It exposes no generic write, no table and no document ID.

The component's boundary is the component API. Below it sit the kernel, the journal library and the tables; above it sit the parent's use cases, which are the only callers, and the parent's queries, which read through the context's queries. Contexts never read each other's tables and never call each other. The cost of the boundary is one component call per parent read or write of context data, which Probe 3 and the first experiment measured and which keeps every context a component (OQ1). Isolation itself stays.

## Intent

- actor: The application team that owns a bounded context and the parent use cases that call it (D2, D10)
- problem: A journal any parent code can write lets state change without its events; a central store puts a counter in every write's path; a context that reads `ctx.auth` decides authority twice; and without a boundary a stale reviewed version or a competing command is silently reinterpreted against fresh state (D2, D11, Sc L1-1, Sc L1-10, Sc L1-11)
- outcome: Each context is a component that owns its CMS, journal and stream metadata behind sanctioned operations; the parent calls it through the component API with tenant, actor and operation as arguments, and every call commits or rolls back with the caller (D2, D11, F2)
- value: Isolation is the platform's defining property; a context's private schema stays private, a cross-context reference is an application identity, and the rule that state never changes without its events is enforced where trusted code cannot break it by mistake (D2)
- risk: Every read of context data from the parent is a component call, which `spec:facts.f19-nested-calls-share-time-budgets` reads on the fixture composition as 3.17 ms over a helper call on a quiet local backend, with every cost and speed target of the first experiment held; its cost in function-call quota is a hosted usage reading, and a measured workload that misses an agreed target, or a usage reading above an agreed share, reopens where hot reads land (F4, F19, Probe 3, OQ1)
- risk: The standing cost per context is one component with its own tables, one registered mutation per sanctioned operation, up to four queries per stream type, one per definer it calls, one operation query, one maintenance mutation and a dependency on `convex-helpers` for pagination inside the component (D2, Decision method rule 2, E-22, E-24)
- assumption: Component calls commit or roll back with the calling mutation, and each is a sub-transaction isolated from other calls (F2, S2)
- assumption: The documentation says a component has no `ctx.auth`; the design does not rest on it, because by its own rule no component function reads `ctx.auth` and the parent passes actor and scope (F11, D11)
- assumption: Nested calls cost more than helper calls by an amount Probe 3 measures (F4)

### Open questions

- [non-blocking] OQ1: a trivial context with no invariants of its own stays a component; the owner answered OQ1 on the first experiment's local measurement, with the hosted usage reading as the one measurement still to take, and a measured workload that misses an agreed target or a usage reading above an agreed share reopens it (OQ1, D2)
- [non-blocking] Probe 3: the cost of one component call in latency and function-call quota decides where hot reads land; the latency is an order of magnitude read on a local backend, the quota needs a hosted deployment to read, and isolation itself stays (Probe 3, F4, D2, D8)
- [non-blocking] Extension E-22: the doc says the parent calls the context's sanctioned operations and does not say how they are registered; this Spec registers one Convex mutation per sanctioned operation built by `defineOperation` with args `{ tenantId, actor, operation, input, facts }`, fixes the context ID as a code constant equal to the mount name, sets the per-call bounds in documents and in bytes derived from each stream type's budget, names the query and maintenance surface, and adds `convex-helpers` as the component's one dependency because the built-in `.paginate()` does not work in a component; the alternative of one generic `execute` mutation per context with an untyped command was not taken because D12 wants static exports with one canonical schema; the owner confirms (D10, D12, S4, E-22)

## Behavior

- rule: Each context is a component that owns its current state, its event journal and its stream metadata, all written by the context's own mutations (D2)
- rule: Journal code is a shared library each context includes; there is no central event-store component (D2)
- rule: CMS, journal events and stream metadata belong to the context; command receipts belong to the parent; access grants belong to the parent or a dedicated access context (D2)
- rule: Stream metadata, which is identity, current version and enumeration including deleted subjects, may live in the CMS document while enumeration and deletion stay correct (D2)
- rule: State never changes without its events; the rule is enforced inside the context API, so trusted parent code cannot break it by mistake (D2, Law 2)
- rule: Business writes go only through a context's sanctioned operations; no generic patch endpoint exists (Law 1)
- rule: State and its required events commit together; an unexpected failure rolls back the whole command (Law 2)
- rule: In a rebuildable context, events are the only source of the next state (Law 3)
- rule: No deployment-wide counter sits in every write's path (D2)
- rule: The parent calls a context operation through `ctx.runMutation` on the component API, and a context query through `ctx.runQuery`; each call is a sub-transaction isolated from other calls that commits with the caller and rolls back when it throws (F2, S2)
- rule: A rejection thrown by a context operation rolls back that sub-transaction and, uncaught by the parent, the whole mutation; the parent's happy path never catches it (D7, F2, F3)
- rule: No component function reads `ctx.auth` or `process.env`, a rule of this design and not a fact about Convex, and a lint check the repository runs enforces it; the parent authenticates and authorizes, then passes the server-established actor and tenant scope as arguments (D11, F11)
- rule: Every operation and query on tenant data names its tenant, and an absent tenant is never a wildcard (Law 11, D11)
- rule: Context APIs return DTOs and application IDs; a private document ID never leaves the component and the private schema stays private (D2, D8)
- rule: A reference that crosses a context boundary is `(tenantId, contextId, eventId)`, never a private document ID (D2)
- rule: Contexts never read each other's tables and never call each other; a rule linking two contexts lives in a parent use case, in the same transaction, or in an obligation (D10)
- rule: A context operation called by a use case is not a public command; it has no receipt and no command lifecycle of its own (D10)
- rule: Context operations take lists, so a use case makes one call per context rather than one per line (D10)
- rule: A context may choose audit-only history explicitly, and then never advertises rebuild from events (D5)
- rule: Non-domain state such as preferences, presence, caches and admin tables uses ordinary authorized Convex mutations and is not a context (D5)
- rule: A command that asks for an invalid state transition is rejected with a documented code; no state or event changes (Sc L1-1, D4)
- rule: A command that names a stale, explicitly reviewed version is rejected as stale and never reinterpreted against fresh state (Sc L1-10, D2)
- rule: Two commands competing for the same stock or unique value leave the invariant intact; the loser's engine retry is invisible; a competing claim of stock is decided again against fresh state, and a competing create of a unique value is answered `entityExists` by the expected-version check against the fresh row, before `decide`; a logical version conflict is a different answer the caller sees only when it named a version (Sc L1-11, F1, E-21)
- rule: Component functions become internal references that a client cannot call; a business write enters only through a parent function that authorized it (Law 1, S4)
- rule: [extension] Each sanctioned operation is one registered mutation built by `defineOperation` from its declaration, with static exports code generation can see and one canonical input schema (E-22, D12)
- rule: [extension] The context's `contextId` is a constant in its code equal to the name the parent mounts it under, and a native test asserts that the versions returned through `components.<mount name>` carry that `contextId` (E-22, D2)
- rule: [extension] An operation call touches at most its declared `maxStreams`, never more than 256 streams and never more stream documents than 8 MiB at their declared budgets, and writes at most 800 documents and 8 MiB; a larger list is rejected with `operationTooLarge` before any read (E-22, E-2, D10, F13)
- flow: The parent's use case authorizes the caller, establishes tenant scope and actor, captures the outside facts the decision needs, and calls `ctx.runMutation(components.<context>.operations.<name>, { tenantId, actor, operation, input, facts })` (D11, D3, F2)
- flow: The operation's validators check the input against its canonical schema; a malformed call fails before any read (D12)
- flow: The operation plans the stream commands from the input, each naming the registration of its stream type within this context, refuses a list above its bound, and runs the persistence adapter's `execute` for each planned command in order against its registration (D10, D3, E-23)
- flow: The adapter loads, decides, folds, appends with the expected version and saves inside the component's sub-transaction (D3, Law 2)
- flow: The operation combines the per-stream results into the DTO and returns a committed outcome with the affected stream versions and one `streams` entry per planned stream carrying its DTO, version and created flag, or throws the first rejection so nothing of the call commits (D4, D8, E-23)
- flow: The parent updates its read models and records its receipt in the same top-level mutation, and everything commits together (D1, D8)

## Design

One component per context, one mount per context in the parent, and the parent as the only caller. The component's functions import their builders from the component's own generated server module. The journal library, the kernel and the shared validators are ordinary TypeScript packages the component code imports; a component cannot read the parent's tables, and by this design's rule it reads no environment variable and declares none of its own, so everything it needs arrives as arguments or as code.

- transactionBoundary: component sub-transaction; a context operation runs inside the parent's top-level mutation as an isolated sub-transaction that commits with the caller and rolls back on throw (F2, S2, D1)
- convexConfig: `import { defineComponent } from "convex/server"; const component = defineComponent("orders"); export default component;` in the context's `convex.config.ts` (D2, S4)
- parentMount: `import orders from "../orders/convex.config"; app.use(orders, { name: "orders" });` in the parent's `convex.config.ts`, with `defineApp()` above it; the mount name is the context's `contextId` (D2, S4, E-22)
- componentBuilders: component functions import `mutation` and `query` from the component's own `_generated/server`, never from the parent's, except that `defineOperation`, a shared library function, registers with `mutationGeneric` of `convex/server`, which the generated `mutation` re-exports; every function the parent calls, the operations, the queries and `maintenance.writeBaseline`, is declared with these public builders, because a component's internal functions are not exposed to the parent (S4)
- contextIdConstant: `const journal = createJournal({ contextId: "orders", history: "rebuildable" })` once in the component's code; the constant is the `contextId` of every envelope and of every cross-context reference (D2, E-22)
- convexSurface: `operations.<name>` one mutation per sanctioned operation; `queries.<streamType>.get`, `queries.<streamType>.list`, `queries.<streamType>.history` and `queries.<streamType>.rebuild` per stream type; `queries.operations.byOperation` once; `maintenance.writeBaseline` once (D2, D8, D10, E-22)
- fnDefineOperation: `defineOperation<I, O>(journal: Journal, declaration: OperationDeclaration<I, O>): RegisteredMutation<"public", OperationArgs<I>, OperationOutcome<O>>` whose `returns` is `operationOutcomeValidator(declaration.returns)` of `spec:context.persistence-adapter` (D10, D12, E-22, E-23)
- operationExample: `export const allocate = defineOperation(journal, { name: "allocate", streams: [stockStream], input: { orderId: v.string(), lines: v.array(allocationLineValidator) }, returns: allocationResultValidator, plan: planAllocation, combine: combineAllocation, maxStreams: 100 })` (D10, E-22)
- argsCommon: every operation's `args` are `{ tenantId: v.string(), actor: actorValidator, operation: operationRefValidator, input: v.object(declaration.input), facts: v.optional(v.record(v.string(), v.any())) }`, where `actorValidator` is the one of `spec:command.actor-and-scope`, `operationRefValidator` the one of `spec:context.event-envelope`, and `facts` the outside facts the parent's executor captured, which reach the decider through the decision context and never through `input` (Law 11, D11, D3, E-6, E-22)
- parentCall: `const outcome = await ctx.runMutation(components.inventory.operations.allocate, { tenantId, actor, operation, input: { orderId, lines }, facts })` inside the parent's use case (F2, D10, D3)
- dependencyConvexHelpers: `convex-helpers` is a dependency of every context component, for `paginator` from `convex-helpers/server/pagination`, because the components page states that the built-in `.paginate()` does not work in a component (S4, E-22, E-24)
- rejectionPropagation: a `ConvexError` thrown by the operation rolls back the sub-transaction; the parent does not catch it on the happy path, so the whole mutation rolls back and the caller receives the rejection (D7, F2, F3)
- idsAsStrings: `Id` types of the component become plain strings outside it; every identity that crosses the boundary is an application string ID, and a stream's document ID never leaves the component (D2, S4)
- clientReach: the component's public functions become internal references callable with `ctx.runQuery` and `ctx.runMutation` and not reachable from clients, so no business write enters without a parent function in front of it (Law 1, S4)
- parentReach: only the component's public functions are exposed to the parent; a function declared with the component's `internalMutation` or `internalQuery` is absent from `components.<context>` and cannot be called from the parent, so the component declares none that the parent must reach, and `maintenance.writeBaseline` is a public `mutation` like the operations (S4)
- noAuthNoEnv: no component function reads `ctx.auth`, `process.env` or the parent's tables, by this design's rule, which ESLint's `no-restricted-syntax` enforces over `src/context` and every component directory of every composition, the fixture composition's and the production composition's, with the probe `fixture/convex/annex/identity.ts` exempt; every operation takes `tenantId`, `actor` and optional `facts` as arguments and every query takes `tenantId` (D11, F11, D3)
- registeredFunctions: per context, one mutation per operation plus up to four queries per stream type, one per definer the context calls, plus one operation query plus one maintenance mutation; a context with two operations and one stream type registers at most eight functions (Decision method rule 2, E-22)
- limitStreamsPerCall: 256 streams per operation call unless the operation declares a lower `maxStreams`, and in bytes the planned streams' `budgetBytes`, each the whole stream with head and parts together, sum to at most 8 MiB, which is 32 streams at the default 256 KiB budget, 16 for a derived stream type at the 512 KiB cap and 256 streams once a stream type declares 32 KiB or less; above either bound the adapter rejects with `operationTooLarge` before any read (D10, F13, E-2, E-22)
- limitDocumentsWrittenPerCall: 800 documents and 8 MiB written per operation call, counting stream rows and events at their measured size and parts, one twentieth of the 16,000 documents and half of the 16 MiB ceiling so the parent's receipts, read models and other contexts fit in the same transaction; the arithmetic is the adapter's `limitDocumentsWrittenPerCall` (F13, D19, E-12, E-22)
- limitReadsPerCall: one stream row plus its parts plus one index range per stream, so a call at the stream bound reads under 300 documents for single-mapping streams and at most 33 per stream, under 8,500, for derived ones, against the 32,000 ceiling, and, by the byte bound above, under 8 MiB of stream documents against the 16 MiB read ceiling; the limits are one budget across the parent and its components, as Probe 4 showed (F13, Probe 4, E-2, E-22)
- historyMode: `history: "rebuildable" | "auditOnly"` on the journal; an audit-only context registers no `rebuild` query and its documentation never advertises rebuild from events (D5)
- crossContextReference: `type EventRef = { tenantId: string; contextId: string; eventId: string }` is the only shape a context stores about another context's events (D2)
- probeDependency: the shape of this component is what Probe 3 and OQ1 tested; a measured workload that misses an agreed target, or a hosted usage reading above an agreed share, changes where hot reads land before Layer 3 is designed (F4, Probe 3, OQ1)

## Example space

```gwt-vocabulary
Given a context component mounted by the parent with a stream at version {version:number} in state {state:"draft"|"submitted"|"stock of 1"|"a unique value nobody holds"}
And the caller last reviewed the stream at version {reviewed:number}
And {callers:number} callers send the same kind of command at the same time
When the parent calls the context operation {operation:"ship"|"amend naming the reviewed version"|"claim one unit"|"create a document claiming the unique value"} through the component API
Then the first caller's outcome is {first:"applied"|"rejection"}
And the second caller's outcome is {second:"applied"|"rejection"|"absent"}
And the rejection code is {code:"invalidTransition"|"staleVersion"|"insufficientStock"|"entityExists"|"none"}
And the stream version afterwards is {after:number}
And the number of events appended is {appended:number}
And decide ran against {evaluated:"the fresh state"|"nothing"}
And the callers saw {saw:"no engine retry and no version conflict"|"a version conflict and no engine retry"}
```

## Verification — reviewed

- A reviewer confirms that every function in the component takes `tenantId` in its `args`, that none reads `ctx.auth` or `process.env`, and that every index on its tables leads with `tenantId`.
- A reviewer confirms that the parent calls the context only through `components.<context>` references and never imports the context's tables or schema.
- A reviewer confirms that the mount name in the parent's `convex.config.ts` equals the `contextId` constant of the component.
