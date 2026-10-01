---
id: spec:context.batch-shaped-api
kind: rule
altitude: story
readiness: defined
relations:
  refines: spec:context.context-component
  decidedBy: spec:decisions.d10-contexts-meet-in-parent-use-cases
  constrainedBy: spec:facts.f13-transactions-have-limits
---
# Batch-shaped context APIs

Layer 1 · Detail: full · Traces: D10, D19, F13, Probe 4, OQ3, Sc L2-3, E-22, E-23.

Context APIs take lists, such as `inventory.allocate({ lines })`, so a use case makes one call per context rather than one per line. O(N) business work inside the call is fine; O(N) component calls or orchestration is not the default. An operation too large for one transaction is rejected, or becomes a separate import command with honest partial progress, because splitting it silently changes its contract. The bound is the operation's declaration, below the platform's ceilings.

## Intent

- outcome: Every context operation takes and returns lists, a use case makes one call per context, and a list above the operation's declared bound is rejected rather than split (D10)
- value: The first experiment can count one call per context per use case and hold it for orders of 1 line, 10 lines and the maximum (D10, Sc L2-3)
- risk: The transaction limits are one budget across nested calls and components, as Probe 4 showed, so every bound here is checked against the sum (F13, Probe 4)
- assumption: Transactions have limits, and platform limits are ceilings, not batch sizes (F13, D19)

### Open questions

- [non-blocking] OQ3: the largest order the placement command supports is a product decision; each operation's `maxStreams` is set from it and the default ceiling of 256 stands until then (OQ3, D10)

## Rule

- Context APIs take lists, so a use case makes one call per context rather than one per line (D10)
- O(N) business work inside one call is fine; O(N) component calls or orchestration is not the default (D10)
- A context operation called by a use case is not a public command; the whole list has one outcome and the parent's use case has one receipt (D10, D6)
- An operation too large for one transaction is rejected, or becomes a separate import command with honest partial progress; splitting it silently changes its contract (D10)
- Every bulk operation and batch has a stated bound, tested against the pinned Convex version, and platform limits are ceilings, not batch sizes (D19, F13)
- Context operations return lists where the input was a list, one result per planned stream, combined into the operation's DTO (D10, D2)
- The first experiment measures orders of 1 line, 10 lines and the chosen maximum and counts one call per context per use case (First experiment, Sc L2-3)
- [extension] Every operation declares `maxStreams`, at most 256, and the planned streams' document budgets sum to at most 8 MiB; the adapter rejects a plan above either with `operationTooLarge` before any read (E-22, E-2, D10, F13)
- [extension] One call writes at most 800 documents and 8 MiB; an operation whose bound could exceed that lowers `maxStreams` rather than relying on the ceiling (E-22, F13, D19)
- [extension] A list-shaped operation plans one stream command per item, or fewer when several items map to one stream, and never issues a component call per item (E-23, D10)
- [extension] An operation may plan streams of several stream types of its own context, each planned command naming its registration, in the order it returns them; a create that claims a unique value and creates its subject is therefore still one call per context (E-23, D10)

## Design

- planShape: `plan: (input: I) => readonly PlannedCommand[]` groups the input's items by stream and names each command's registration through `planned`, so ten lines on three products plan three stream commands (D10, E-23)
- combineShape: `combine: (results: readonly StreamResult<unknown>[]) => O` returns the operation's list-shaped DTO, telling stream types apart by each result's `version.streamType` (D10, E-23)
- exampleAllocate: `inventory.allocate({ lines: [{ productId, quantity }] })` plans one `claim` per product stream and returns `{ allocations: [{ productId, allocated }] }` with the stream versions on the outcome (D10, Sc L2-3)
- limitStreamsPerCall: `maxStreams` per operation, ceiling 256, and 8 MiB of stream documents at the planned stream types' `budgetBytes`, so the allocation operation's 100 stock streams fit only because the stock stream type declares a small budget, 16 KiB as `spec:application.orders-inventory-example` pins, under which the byte bound admits 512 and the count bound the full 256 (E-22, E-2, E-46, F13)
- limitDocumentsWrittenPerCall: 800 documents and 8 MiB per call (E-22, F13)
- limitOrderLines: the maximum lines per `PlaceOrder` is a product decision and a placeholder in the first experiment; `maxStreams` of the allocation operation follows it (OQ3, D10, F13)
- importCommand: a list above the bound is served by a separate import command that records honest partial progress per batch in its own stream, never by the operation splitting silently (D10)

## Verification — reviewed

- A reviewer confirms that every context operation in the example application declares `maxStreams` and that the first experiment's call count per context per use case is one for every order size.
