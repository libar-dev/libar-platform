---
id: spec:application.parent-use-cases
kind: behavior
altitude: feature
readiness: defined
relations:
  refines: spec:platform.transactional-domain-platform
  dependsOn:
    - spec:context.context-component
    - spec:context.batch-shaped-api
    - spec:command.command-pipeline
  constrainedBy:
    - spec:laws.law01-sanctioned-writes-only
    - spec:laws.law02-state-and-events-commit-together
    - spec:laws.law09-no-invariant-on-late-read-model
    - spec:laws.law11-tenant-scope-named
    - spec:facts.f02-component-calls-commit-with-caller
    - spec:facts.f03-nested-run-mutation-partial-rollback
    - spec:facts.f13-transactions-have-limits
    - spec:constraints.one-call-per-context-per-use-case
    - spec:constraints.one-commit-per-successful-command
    - spec:facts.f11-components-have-no-ctx-auth
    - spec:laws.law10-replay-never-runs-commands-or-effects
    - spec:facts.f14-convex-error-survives-nested-and-component-boundary
  decidedBy:
    - spec:decisions.d01-one-mutation-per-operation
    - spec:decisions.d10-contexts-meet-in-parent-use-cases
    - spec:decisions.d04-four-outcomes
    - spec:decisions.d07-rejections-thrown-not-stored
    - spec:decisions.d08-read-models-in-command
---
# Parent use cases

Layer 2 · Detail: full · Traces: D1, D4, D6, D7, D8, D10, Law 1, Law 2, Law 9, Law 10, Law 11, F2, F3, F13, F14, Probe 4, OQ3, Sc L1-4, Sc L2-1, E-5, E-38, E-39, E-41, E-44.

A parent use case is the business operation that makes two or more bounded contexts meet. It is the public command of the composed application: the command pipeline of `spec:command.command-pipeline` parses, authenticates, authorizes, dedupes and admits it, then runs the use case body inside the same top-level mutation. The body calls each context component once through its sanctioned operation, applies the rules that link the contexts, updates the read models the use case declares, and returns the result with the affected stream versions. Everything the body does commits or rolls back together, because every context call is a component sub-transaction that commits with its caller.

The boundary sits at the component API. The use case sees DTOs and stream versions, never a context's tables, and a context never sees another context. A rule that needs two contexts is written once, in the use case, where it can be read. The use case owns no receipt of its own beyond the one the pipeline records for the whole operation, and the context steps inside it carry no command lifecycle. `PlaceOrder` in the first experiment is the worked case: one command, one receipt, one outcome, one call to Orders and one call to Inventory.

## Intent

- actor: The application developer who writes a use case for the composed application, and the caller who invokes it through the command pipeline (D10, D12)
- problem: The first context writes its state and events, then the second context rejects or throws; without one transaction around both, the first write survives, the caller is told nothing consistent, and a partial order or a phantom allocation is stored (Sc L2-1)
- outcome: Every cross-context rule lives in a parent use case that runs as one top-level mutation with one list-shaped call per context, one receipt and one outcome, so that either the whole operation commits or nothing of it is stored (D1, D10)
- value: A maintainer finds every rule that spans two contexts in one place, a new use case needs only its input, its context calls and the read models it maintains, and no saga, command bus or lock protocol sits between local contexts (D10, D1, Thesis)
- risk: The parent grows with each cross-context rule, so use cases are grouped by business flow (D10)
- risk: An operation too large for one transaction is rejected or becomes a separate import command with honest partial progress, and the largest order the placement command supports is still a product decision (D10, F13, OQ3)
- assumption: Component calls commit or roll back with the calling mutation, and each call is a sub-transaction isolated from other calls (F2, S2)
- assumption: A `ConvexError` thrown inside a component sub-transaction reaches the use case with its data intact, which Probe 2 showed on the pinned backend (F14, Probe 2)
- assumption: Transactions have limits, and they are one budget across nested calls and components, as the docs state for nested calls and Probe 4 showed for both (F13, Probe 4)

### Open questions

- [non-blocking] OQ3: the largest order `PlaceOrder` supports is a product decision; the limit bullet below carries a placeholder and the first experiment measures with a provisional maximum (OQ3, D10)
- [non-blocking] Extension E-41: the doc says a too-large operation is rejected or becomes a separate import command with honest partial progress; it does not say what the import command records. The option taken here: the input bound is the declaration's `bounds.maxItems` of `spec:command.command-declaration` under E-38, checked by the pipeline's step 1 and by no body, the rejection is the outcome boundary's reserved `operationTooLarge`, and this extension owns only the import command, a caller-driven sequence of bounded batch commands that record progress on an `imports` row (E-41, E-38, D10)
- [non-blocking] Extension E-44: the doc says keeping a refused request as a fact is a business policy chosen per command, and the executor signature is pinned by `spec:command.command-declaration`; what neither says is how a use case declares what a context's business failure means to it. The option taken here is a `BusinessFailurePolicy` per context call, carry or reject, applied inside the executor body through the pinned helper `carryOrReject` right after the context call, because the executor is a plain function and the declaration carries no slot for it; `reject` rolls back the events the context recorded as its business failure, which D4 says belong in history, and the doc's per-command choice is read as the use case's because D10 makes the use case the command, so the owner confirms that a context's business failure may be overridden by its caller; the throw shape, the kernel's bare `Rejection` that a context and a use case's own code both throw and the pipeline's rethrow normalizes, is taken here, under E-5 for the boundary's rethrow, and the owner has not ruled on it (E-44, E-5, D4, D7, D10)
- [non-blocking] Extension E-39: the doc fixes no order for a use case's context calls; the option taken here is one fixed order the executor states, the creating context first, with no failure handling of a later call, because the calls before it roll back with the mutation; the owner has not ruled (E-39, D1, D10)

## Behavior

- rule: A use case runs as one top-level mutation that may call several context components, update parent read models and record its outcome, and all of it commits or rolls back together (D1)
- rule: Inside the mutation, failure handling is a throw; sagas, compensation and outboxes belong only where the next step runs in its own transaction (D1)
- rule: Contexts never read each other's tables and never call each other; the use case is the only place where two contexts meet (D10)
- rule: A rule linking two contexts lives in the parent use case, in the same transaction, or in an obligation that runs later; no handler inside a transaction issues commands (D10)
- rule: A context operation called by a use case is not a public command; the use case has one receipt and one outcome, and the context steps inside it get no command lifecycle of their own (D10, D6)
- rule: Placing an order is one command, never `CreateOrder`, then `AddOrderItem` per line, then `SubmitOrder` (D10)
- rule: A use case makes one list-shaped call per context, such as `inventory.allocate({ lines })`; O(N) business work is fine, O(N) component calls or orchestration is not the default (D10)
- rule: Every context call is `ctx.runMutation` on the component's API, an isolated sub-transaction that commits with the caller and rolls back when it throws (F2, S2)
- rule: A rejection from a context ends the use case: the context throws it inside its own sub-transaction as a `ConvexError` carrying the kernel's `Rejection`, the executor does not catch it, and the pipeline's outermost rethrow gives it the boundary's wire shape; the sub-transaction of every context called before it rolls back with the mutation and nothing is stored (D7, F2, F3, F14, Sc L2-1)
- rule: The use case never wraps a context call in a catch that continues, because a catch around a nested mutation would keep the earlier sub-transactions' writes and turn a rejection into a partial commit (D7, F3, S10)
- rule: A technical failure in any context or in the use case body rolls back the whole command, and nothing is stored as a business outcome (Law 2, D4)
- rule: When a context returns a business failure, the use case either carries it as the use case's business failure, so every write so far commits with it, or throws a rejection so nothing commits; the choice is declared per use case and never made by error handling (D4)
- rule: A transient refusal raised in the parent around the context calls, such as the write pause on the use case's scope, is a retryable error and never a stored rejection (D4, D9)
- rule: The read models a use case declares are updated inside the same mutation, after the context calls, from the DTOs and stream versions the contexts returned, through the projection contract; the pipeline's step 9 makes those writes from the `streams` the body returns, and the body writes no read-model table (D8, Law 9, E-7)
- rule: A cross-context invariant is checked against the DTOs the contexts return in this transaction, never against a read model that updates later (Law 9)
- rule: Business writes go only through a context's sanctioned operations; the use case has no patch path into a context's state (Law 1)
- rule: Every use case names its tenant scope, receives the server-established actor from the pipeline, and passes both into every context call as arguments (Law 11, D11, F11)
- rule: An operation too large for one transaction is rejected, or becomes a separate import command with honest partial progress; splitting it silently changes its contract (D10, F13)
- rule: A use case's input bound is its declaration's `bounds`, `maxItems` and `maxBytes`, checked by the pipeline's step 1, after the public entry's authentication and before any read; input above it is rejected with the outcome boundary's `operationTooLarge`, nothing is read or written, and no body re-checks it (E-38, D10)
- rule: [extension] A use case that creates a subject calls the creating context first, so a duplicate create is answered `entityExists` by that context's adapter before any other context's decision runs, and the second UI submit of `PlaceOrder` is told its order exists rather than that stock is short (E-39, D6, D10, Sc L1-4)
- rule: [extension] A use case calls its contexts in one fixed order that its executor states, the creating context first, and handles no failure of a later call: the calls before it are sub-transactions of the same mutation, so a later rejection or throw undoes them (E-39, D1, F2, Sc L2-1)
- rule: [extension] An import command is a sequence of bounded batch commands the caller drives; each batch is one transaction with its own request key and receipt, records its progress on the import row, and a failed batch leaves the earlier batches committed and the row saying so (E-41, D10, D6)
- rule: The parent grows with each cross-context rule, so use cases are grouped by business flow in the module that declares them (D10)
- flow: The command pipeline has parsed the input against the canonical schema, established actor and tenant scope, authorized the command, found no receipt for its key and admitted it (D6, D11, D12)
- flow: The pipeline has read the maintenance gate for the use case's scopes and minted the operation reference, and calls the use case's executor with the mutation context and the call, tenant, actor, the operation reference and parsed input, in the executor shape the command declaration pins (D1, D9, D11, D12)
- flow: The pipeline has already refused input above the declaration's `bounds` at its step 1, so the body starts from an input inside its bound (D10, E-38)
- flow: The body captures the outside facts the decision needs, such as an accepted price list or a policy version, from parent tables or configuration inside this transaction, so they enter the deciders as inputs and never as re-fetched data (D3, Law 10)
- flow: The body calls the first context once through `ctx.runMutation(components.<context>.operations.<name>, { tenantId, actor, operation, input, facts })` with a list-shaped input, the creating context first when the use case creates a subject, and receives the operation outcome: the DTO, the outcome kind, the affected stream versions and one `streams` entry per planned stream with its DTO, version, created flag and appended events (D10, F2, F11, E-22, E-23, E-39)
- flow: The body passes the outcome through `carryOrReject` with the call's declared `BusinessFailurePolicy`, which returns it unchanged under `carry` and throws the declared rejection under `reject` when the context reported a business failure (D4, E-44)
- flow: The body applies the cross-context rule to the returned DTO and derives the list-shaped command for the second context (D10, Law 9)
- flow: The body calls the second context once in the same way, through the same helper; a rejection or throw here rolls back the first context's sub-transaction with the whole mutation (D10, F2, Sc L2-1, E-44)
- flow: The body returns the result, the union of affected stream versions and the concatenated `streams` entries of every context call; the pipeline's step 9 writes every read model the declaration lists from those entries, in live-created mode for a stream whose entry is flagged created and live-updated mode otherwise, into the active generation and any building generation (D8, D9, E-7, E-9)
- flow: The pipeline records the receipt and returns the result and the versions to the caller (D1, D6, D8)

## Design

The transaction boundary is the pipeline's top-level mutation. A context call is a component sub-transaction: `ctx.runMutation` on the component's API function, which commits with the caller and rolls back when it throws. On the happy path the use case makes exactly one such call per context and no other nested `runMutation`; helpers inside the parent are plain functions. The use case never catches a `ConvexError` from a component. The parent reads `ctx.auth` in the pipeline before the body runs; the body and the components receive actor and scope as arguments.

A use case is declared with the command declaration of `spec:command.command-declaration` and exported as a static Convex `mutation` through its composition helper, so the use case adds no registration of its own. Its executor is that contract's `Executor<I, R>`, its return is the kernel's `CommittedOutcome<R>`, `StreamVersion` is the kernel's shape, the DTOs are the context's, and `Actor` and `TenantScope` are the pipeline's. This Spec defines no second shape for any of them; the bullets below name them so the flows read against one definition each.

- transactionBoundary: one top-level mutation; each context call is a component sub-transaction that commits with the caller; no nested `runMutation` on the happy path other than component calls (D1, F2, S10)
- convexSurface: none of its own; each use case is one static `mutation` export produced by the composition helper of the command declaration, named by its business flow module (D12)
- typeExecutor: the use case body is the command declaration's `Executor<I, R> = (ctx: MutationCtx, call: { tenantId: string; actor: Actor; operation: OperationRef; input: I }) => Promise<ExecutorResult<R>>`, the one executor shape in the corpus, where `ExecutorResult<R>` is the kernel's `CommittedOutcome<R>` plus the `streams` entries of every context call (D12, D4, E-7)
- typeCommittedOutcome: the kernel's `CommittedOutcome<R>`, applied or business failure with `result: R` and `versions: StreamVersion[]`; a rejection is thrown and never returned (D4, D7)
- factsCapture: the body reads the outside facts it needs from parent tables or configuration and passes them as `facts` on each context call; a fact that matters historically is then captured in the events the decider records and never re-fetched during replay (D3, Law 10, E-22)
- createdDetection: a stream created by the call is one the adapter loaded without a row, which its `StreamResult` records as `created` and the operation outcome carries on that stream's `streams` entry; the pipeline's step 9 selects the projection's live-created mode from that flag and the live-updated mode otherwise, so no use case derives the flag from a version count (D8, D9, E-9, E-23)
- typeContextCall: `ctx.runMutation(components.inventory.operations.allocate, { tenantId, actor, operation, input: { lines }, facts })` returns the `OperationOutcome<O>` of `spec:context.persistence-adapter`, the kernel's `CommittedOutcome<O>` with the DTO and `versions: StreamVersion[]` plus `streams`; `operation` is the `OperationRef` the pipeline minted, and the `args` shape is the one `spec:context.context-component` fixes (D10, F2, F11, E-22, E-23)
- typeBusinessFailurePolicy: `[extension] type BusinessFailurePolicy = { kind: "carry" } | { kind: "reject"; code: string; message: string }` declared per use case and per context call as a constant beside the executor; `carry` returns the context's business failure as the use case's, `reject` throws the named rejection code with the stated message, and the declaration's `rejections` list must contain the code (E-44, D4)
- fnCarryOrReject: `[extension] carryOrReject<O>(outcome: OperationOutcome<O>, policy: BusinessFailurePolicy): OperationOutcome<O>` the one place the policy is applied: it returns `outcome` unchanged when its `kind` is `applied` or the policy is `carry`, and otherwise throws the kernel's bare `Rejection`, `new ConvexError<Rejection>({ code: policy.code, message: policy.message })`, the shape a context throws, so the pipeline's `normalizeThrown` adds `kind` and the command type and turns a code the declaration does not list into a technical failure; it never calls the outcome boundary's `reject`, which needs a command type the helper does not have (E-44, D4, D7)
- useCaseRejection: [extension] a rejection the executor's own code raises, from a rule that links two contexts, is thrown the same way, `throw new ConvexError<Rejection>({ code, message, details })`, never through `reject`, so every rejection of a use case, a context's or its own, reaches the caller through the one rethrow and the one check of the code list (D7, D10, E-5)
- errorCodeOperationTooLarge: `operationTooLarge`, the kernel's reserved code the outcome boundary lists, thrown as a rejection by the pipeline's step 1 when the input exceeds the declaration's `bounds`, and by a context's adapter when a list exceeds its own `maxStreams` or byte bound; it carries the bound and the offered size (D10, F13, E-38)
- tableImports: `[extension] imports: defineTable({ tenantId: v.string(), importId: v.string(), commandType: v.string(), operationId: v.string(), expected: v.number(), done: v.number(), failed: v.number(), state: v.union(v.literal("running"), v.literal("completed"), v.literal("failed"), v.literal("cancelled")), lastBatch: v.optional(v.string()), startedAt: v.number(), updatedAt: v.number(), startedBy: actorValidator })` (E-41, D10, Law 11)
- indexImportsByImport: `.index("by_import", ["tenantId", "importId"])` (E-41)
- indexImportsByImportUse: the batch command loads the import row by tenant and import ID, updates `done` or `failed` in its own transaction, and the caller's progress query reads the same row (E-41, D10)
- limitCallsPerContext: 1 component call per context per use case, counted by the first experiment (D10, Sc L2-3)
- limitOrderLines: the maximum number of lines per `PlaceOrder` is a product decision, written `MAX_ORDER_LINES` and open under OQ3; it is chosen so one order reads and writes about three documents per line plus a constant, far below the 32,000 scanned and 16,000 written per transaction and inside the 1 second budget (F13, OQ3)
- limitInputBound: every use case's input bound is its declaration's `bounds.maxItems`, checked at the pipeline's step 1, a ceiling below which the experiment measures its documents read and written; each context's adapter keeps its own `maxStreams` and byte bound and the smallest bites first (E-38, F13, D19)
- limitImportBatch: `[extension]` an import batch carries at most its own declaration's `bounds.maxItems` items and is one transaction with one receipt, so an import of N items is at least N divided by that bound commands (E-41, E-38, D10)

## Example space

```gwt-vocabulary
Given a use case that calls {contexts:number} contexts in one mutation
And the first context has written its state and events
When the second context {secondOutcome:"rejects"|"throws"}
Then the mutation {commit:"rolls back"|"commits"}
And the caller receives {response:"the rejection"|"a technical failure"|"the result"}
And the number of stored receipts, events and state changes is {stored:number}
```

## Verification — reviewed

- A reviewer confirms that no use case in the corpus or the experiment catches a `ConvexError` thrown by a component call and continues.
- A reviewer confirms that every use case makes one `ctx.runMutation` per context and that the first experiment counts it.
- A reviewer confirms that `PlaceOrder` is declared as one command with one receipt and that no `CreateOrder`, `AddOrderItem` or `SubmitOrder` exists.
- A reviewer confirms that every use case is declared as a `CommandDeclaration` with an `Executor` and that this package defines no second executor, outcome or version shape.
