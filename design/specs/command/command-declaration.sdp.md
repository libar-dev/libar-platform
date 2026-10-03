---
id: spec:command.command-declaration
kind: contract
altitude: feature
readiness: defined
relations:
  refines: spec:platform.transactional-domain-platform
  dependsOn:
    - spec:command.command-pipeline
    - spec:command.outcome-boundary
    - spec:kernel.outcome-model
  decidedBy: spec:decisions.d12-one-declaration-per-command
  constrainedBy:
    - spec:facts.f13-transactions-have-limits
    - spec:laws.law06-technical-failure-never-a-rejection
---
# Command declaration and bindings

Layer 1 to 2 · Detail: full · Traces: D12, D6, D8, D9, D10, D11, D13, Sc L2-4, E-7, E-8, E-9, E-31, E-38.

Each command has one declaration: its name, its input and output schema, its executor, its permission policy and the read models it maintains. The declaration is a plain TypeScript value. Two composition helpers turn it into the pipeline's two entries, a public `mutation` and an `internalMutation`, and both are static top-level exports that Convex's code generation sees. There is no DI container, decorator framework, reflection registry or module lifecycle; a class may group a module's declarations and holds no correctness-critical global state. Code generation of the repetitive bindings waits until two real modules show the pattern, is deterministic and is checked in CI.

The canonical schema is the declaration's `input` validator plus an optional refinement function; both live in the declaration and nothing converts between two schema systems, so no refinement is dropped silently.

## Intent

- outcome: Pin the declaration's fields, the two composition helpers, the static-export rule and what generation will emit, so that renaming a handler or breaking its argument contract fails the type check at its typed callers before any traffic (D12, Sc L2-4)
- value: The module system removes independently maintained wiring facts instead of hiding them behind a wrapper; a new command is one declaration and two exports (D12, Decision method rule 7)
- risk: Until two real modules exist, the two export lines per command are written by hand, and a missing export is caught only where a typed caller names it (D12)
- risk: The standing cost of the two-entry shape is two registered mutations per command, which the doc counts as a cost per mechanism and which D7 names as the reason it rejects a body per command; the cheaper alternative and why it lost are in the E-7 question below (D12, D7, Decision method rule 2)

### Open questions

- [non-blocking] Extension E-7: the doc says a small composition helper and shared schema values; the helper signatures, the executor signature and the read-model binding below are the design's; the cost is two registered mutations per command instead of one, and the cheaper alternative the design refuted is one public export per command plus one generic internal dispatcher mutation keyed by command type, as D7's conditional dispatcher already does; it lost because trusted server callers would then reach every command through one untyped `internalMutation`, so a renamed handler or a broken argument contract would pass `tsc` at the caller and fail only at runtime, which is the check Sc L2-4 exists to keep before traffic, and because the receipt fingerprint's contract version would be looked up by string rather than typed; the owner may still prefer the dispatcher form once code generation makes the per-command internal entry free (E-7, D12, D7, Sc L2-4, Decision method rule 5)
- [non-blocking] Extension E-7: the pipeline receives the declaration and takes the fingerprint's contract version from it, and the type check at a typed caller is the check of Sc L2-4, so no standing map from command type to declaration exists; the conditional dispatcher of `spec:command.outcome-boundary` is the one thing that would need such a map and brings it with it; this is a provisional reading the owner rules (E-7, D12, D18, OQ2)
- [non-blocking] Extension E-38: the doc names five declaration fields; this design adds `contractVersion` for the fingerprint, `retention` and `irreversible` for receipts, `admission`, `bounds`, `rejections`, `audit`, `diagnosticSink` and `writes`, each serving a cited rule of another Spec, and asks whether the owner accepts them as part of the one declaration; `bounds` is the one input bound in the corpus, `maxItems` and `maxBytes`, checked by the pipeline's step 1 and by no executor body, so `spec:application.parent-use-cases` reads it rather than declaring a bound of its own; `writes` is required on every declaration, because an absent list would be an unchecked one, and `readModels` is optional, absent meaning none, which the owner has not ruled; `writes` names the context and stream type pairs the executor may write, from which the pipeline's step 7 derives the source scopes the write pause closes for a consistent cut and which step 9 proves against the `streams` entries the executor returns, because a use case that writes a source stream without maintaining the paused view would otherwise pass the gate; the declaration still imports nothing from the obligation family, so a command's static reactions are not a field here but the `createObligation` calls of its executor, as `spec:obligations.fan-out-and-chains` rules under E-54 (E-38, E-8, E-54, D6, D9, D10, D19, Thesis)

## Contract

- Each command has one declaration: name, input and output schema, executor, permission policy and the read models it maintains (D12)
- Convex functions stay static top-level exports that code generation can see; the composition helpers return a `RegisteredMutation` and nothing registers a function at runtime (D12)
- A command is bound by two export lines, `export const placeOrder = publicCommand(placeOrderDeclaration)` and `export const placeOrderInternal = internalCommand(placeOrderDeclaration)`, and no other binding exists (D12, D6)
- The declaration's `input` is a Convex `v.object` validator and its `refine` is an optional function over the validated value; together they are the one canonical schema, and no converter between schema systems is used (D12)
- The declaration's `output` validator is the `result` of the executed member of the entry's `returns` validator, `commandResponseValidator(decl.output)`, whose replayed member carries `result: v.null()`; the wire type is closed per command and `result` is null exactly when `replayed` is true, because a receipt stores no result (D12, D4, D6, E-30)
- The permission policy names the permission `authorize` checks and, optionally, how to derive the subject from the input (D11, D12)
- The read models the command maintains are listed in the declaration as bindings, each naming the read model, which carries its projection, and the context and stream type whose DTOs feed it, and the pipeline's step 9 writes them from the `streams` the executor returns; the executor writes none, and a declaration with no list maintains none (D8, D12, E-7)
- The executor receives the tenant, the actor, the minted `OperationRef` and the parsed input, captures the outside facts the decision needs, calls one context per context it names, with lists, and returns the kernel's committed outcome together with every context call's `streams` entries, or throws; a rejection is never a return value (D10, D12, D7, D3)
- No DI container, decorator framework, reflection registry or module lifecycle; a class may group a module's declarations and holds no correctness-critical global state (D12)
- Generation of the repetitive bindings starts only after two real modules show the pattern, is deterministic, and CI fails when regenerating changes a committed file (D12)
- Renaming a handler export changes the generated `api` type, so every typed caller fails `tsc`; breaking an argument contract fails `tsc` at the caller and the `args` validator at runtime (D12, Sc L2-4)
- [extension] The declaration also carries `contractVersion`, `retention`, `irreversible`, `admission`, `bounds`, `rejections`, `audit`, `diagnosticSink` and `writes`, each read by one cited rule elsewhere in the corpus; `bounds` is checked once, at the pipeline's step 1, and `writes` is proven once, at its step 9 (E-38, E-8)
- [extension] The declaration carries no reactions field, because a lower profile never imports a higher profile's machinery; the static reactions of a command in the durable profile are the `createObligation` calls its executor makes, bounded and reviewed as `spec:obligations.fan-out-and-chains` rules (E-38, E-54, Thesis, D13)

## Design

The helpers are ordinary functions. `publicCommand` builds the public entry's `args` from `tenantId`, an optional `requestKey`, an optional `correlationId` and the declaration's `input`, sets `returns` to the pipeline's `commandResponseValidator(decl.output)`, and writes a handler that establishes the actor, which happens after Convex's argument validators and before step 1's key, bound and refinement checks, fixes the namespace to `public` and calls `runPipeline`. `internalCommand` builds the internal entry's `args` with `namespace`, `actor`, a required `requestKey`, the same optional `correlationId` and an optional `causedBy`, and calls the same `runPipeline`. Both return the `RegisteredMutation` Convex expects at a top-level export, and both forward `correlationId` on the `PipelineCall` so that step 7 stores it on the `OperationRef`; only the internal entry forwards `causedBy`, which step 7 stores the same way. Each handler's one outermost catch is `relayFailure` of `spec:command.command-pipeline`, which emits the failure's diagnostic record and throws what `normalizeThrown(error, decl.name, decl.rejections)` of `spec:command.outcome-boundary` throws.

What generation would emit, once two modules show the pattern: for each declaration in a module, the two export lines and a module-level union of rejection codes for the outcome boundary. It emits nothing that a hand-written module could not contain, and CI regenerates and diffs.

- typeCommandDeclaration: `type CommandDeclaration<I, R> = { name: string; contractVersion: number; input: Validator<I, "required", string>; refine?: (input: I) => Omit<Rejection, "code"> | null; output: Validator<R, "required", string>; permission: PermissionPolicy<I>; executor: Executor<I, R>; writes: readonly SourceRef[]; readModels?: readonly ReadModelBinding[]; rejections: readonly string[]; admission?: AdmissionPolicy<I>; bounds?: Bounds; retention?: Retention; irreversible?: boolean; audit?: { kind: "security" | "business" }; diagnosticSink?: DiagnosticSink }` (D12, E-7, E-38)
- typeSourceRef: `type SourceRef = { contextId: string; streamType: string }`, one context and stream type pair, used by `writes` and by `ReadModelBinding.source` (E-38, E-8)
- typeWrites: `writes` lists every `SourceRef` the executor's context calls may write; the pipeline's step 7 turns each into a `source:` scope for the write pause's gate read, and its step 9 throws a plain error when a returned `streams` entry names a pair outside the list, so an understated list fails the first native run instead of slipping through a closed source scope; a use case that writes nothing outside its declared pairs is the only kind the gate can cut consistently (E-38, E-8, D9, Law 6)
- typePermissionPolicy: `type PermissionPolicy<I> = { permission: string; subjectFrom?: (input: I) => SubjectRef }` (D11, D12)
- typeExecutor: `type Executor<I, R> = (ctx: MutationCtx, call: { tenantId: string; actor: Actor; operation: OperationRef; input: I }) => Promise<ExecutorResult<R>>` where `OperationRef` is the one the pipeline minted at step 7, forwarded unchanged to every context call, and the executor's context calls are `ctx.runMutation` on component APIs with the facts it captured (D12, D10, D4, D3, E-26)
- typeExecutorResult: `type ExecutorResult<R> = CommittedOutcome<R> & { streams: StreamDto[] }` where `CommittedOutcome<R>` is the kernel's committed half of `Outcome<R>` and `streams` concatenates the `streams` of every context outcome the executor received, the `StreamDto` of `spec:context.persistence-adapter`, so the pipeline's step 9 has every DTO, version and created flag it needs (D12, D4, D8, E-7, E-23)
- typeReadModelBinding: `type ReadModelBinding = { readModel: ReadModel<any, any>; source: SourceRef }`, where `readModel` is the declaration `spec:application.projection-contract` pins and `source` selects which `streams` entries feed it; the binding repeats neither the read model's name nor its projection's version, a read model fed by several stream types is bound once per source, and the binding has no update function of its own (D8, D12, E-7, E-9)
- typeAudit: `audit?: { kind: "security" | "business" }` asks the pipeline's step 10 to write one audit record through `writeAudit` of `spec:operations.baseline-operations`, which fails closed, after an applied command and after a business failure; absent, the default, the command writes none (D19, E-38, E-43)
- typeDiagnosticSinkField: `diagnosticSink?: DiagnosticSink`, the sink type of `spec:operations.baseline-operations`, names where the pipeline writes the command's diagnostic lines; absent, the default, it is `consoleSink`; the production composition names none, and the fixture composition's `PlaceOrder` names the sink through which Sc ALL-1 breaks metrics and logging (D19, E-38, E-43)
- typeAdmissionPolicy: `type AdmissionPolicy<I> = (ctx: MutationCtx, call: PipelineCall<I>) => Promise<{ admitted: true } | { admitted: false; code: "rateLimited" | "capacity"; retryAfterMs?: number }>`; a consumption it writes commits only with the command, so it counts committed intent (D6, E-32)
- typeBounds: `type Bounds = { maxItems?: number; maxBytes?: number }` checked by the pipeline at step 1 and nowhere else, where `maxItems` counts the elements of every top-level array field of the input, summed, and `maxBytes` bounds the input's size measured with `getConvexSize`; a breach is rejection `operationTooLarge` carrying the bound and the offered size, and `maxItems` is the number the first experiment measures under as the use case's input bound (D10, F13, E-38)
- typeRetention: `type Retention = { window: number; afterExpiry: "delete" | "tombstone" }` (D6, E-34)
- fnPublicCommand: `publicCommand<I, R>(decl: CommandDeclaration<I, R>, serviceIssuers: ReadonlySet<string> = new Set()): RegisteredMutation<"public", { tenantId: string; requestKey?: string; correlationId?: string; input: I }, CommandResponse<R>>`, the argument type of the pipeline's `fnPublicEntry`, where `serviceIssuers` is what the entry passes to `establishActor`, so with none every public caller is a human actor (D12, E-7, E-31, E-37)
- fnInternalCommand: `internalCommand<I, R>(decl: CommandDeclaration<I, R>): RegisteredMutation<"internal", { tenantId: string; namespace: CallerNamespace; actor: Actor; requestKey: string; correlationId?: string; causedBy?: CausedBy; input: I }, CommandResponse<R>>`, the argument type of the pipeline's `fnInternalEntry`, where `CausedBy` is the envelope's union and is what a reaction passes to make its derived command's events carry the publication event as their cause (D12, D6, D13, E-7, E-31)
- staticExports: `export const placeOrder = publicCommand(placeOrderDeclaration)` and `export const placeOrderInternal = internalCommand(placeOrderDeclaration)` at the top level of a module under `convex/`, one pair per command, never inside a function, a class method or a loop (D12)
- generationTrigger: after two real modules; the generator is a deterministic script that emits the export pairs and the rejection-code union, and CI fails on a diff against the committed output (D12)
- moduleGrouping: `class OrdersModule { static readonly commands = [placeOrderDeclaration, cancelOrderDeclaration] as const }` is allowed as grouping and holds no state the pipeline reads (D12)
- canonicalSchema: `input` is a Convex validator and `refine` runs over its output; there is no second schema and no converter, so a refinement is never dropped silently (D12)
- refineResult: `refine` returns `null` when the validated input passes and otherwise the kernel's `Rejection` of `spec:kernel.outcome-model` without its `code`, a `message` and the failing path in `details`; the pipeline's step 1 throws that value through `reject` of `spec:command.outcome-boundary` with `code: "invalidInput"` and `entry: decl.name`, so the refinement never chooses a code and never names the command (D12, D4, E-5)

## Example space

```gwt-vocabulary
Given a module exporting command {commandName:string} through the composition helpers
And a typed caller references it through the generated api
When the change {change:"renames the handler export"|"breaks its argument contract"} is made
Then the check that fails first is {failsAt:"tsc"|"argument validator"}
And it fails {when:"before any traffic"|"at the first call"}
```

## Verification — reviewed

- A reviewer confirms that every command module contains exactly the two export lines per declaration, both at the top level, and that no function is registered anywhere else.
- A reviewer confirms that the declaration holds every wiring fact the pipeline reads, and that no separate registry, decorator or config file repeats one.
- A reviewer confirms that no generator exists until two real modules are committed, and that when it exists CI diffs its output.
