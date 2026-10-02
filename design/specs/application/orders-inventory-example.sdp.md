---
id: spec:application.orders-inventory-example
kind: model
altitude: story
readiness: defined
relations:
  refines: spec:application.first-experiment
  decidedBy:
    - spec:decisions.d04-four-outcomes
    - spec:decisions.d10-contexts-meet-in-parent-use-cases
  constrainedBy:
    - spec:laws.law01-sanctioned-writes-only
---
# Orders and Inventory, the example domain

Story · Detail: full · Traces: First experiment, Law 1, D4, D9, D10, D16, Sc L1-4, Sc L1-11, Sc L2-3, Sc L2-6, E-2, E-9, E-39, E-46.

The first experiment's domain has two bounded contexts, Orders and Inventory, one composed use case that makes them meet, one more lifecycle command, one command that creates stock, and one essential summary. The terms below are the ones the experiment's code, tests and measurements use. Where the doc names a thing, its word is kept; the second lifecycle command, the command that creates stock, the summary and the rejection reason are the design's choices under E-46. `StartCheckout` from D16 is not part of the experiment; it is the Layer 4 contrast to atomic `PlaceOrder`.

## Intent

- outcome: Fix the vocabulary of the example domain so the experiment, its scenarios and its measurements name the same things the same way (First experiment, E-46)
- value: A reader of a measurement or a scenario knows which context, command, event and read model is meant without reading the code (First experiment)

### Open questions

- [non-blocking] Extension E-46: the second lifecycle command, the essential summary, the command that creates stock, the unit price an order line carries, the rejection reason for short stock, the stream budgets of the two stream types, the order of the two context calls and the history-dependent view Sc L2-6 builds are choices the doc leaves open; the owner may substitute others, and the experiment's terms move with them; the owner has not ruled on any of them (E-46, E-2, E-9, First experiment)

## Model

- **Orders context** — The bounded context that owns orders as streams, one document per order, with its own journal and the `PlaceOrder` and `CancelOrder` decisions (First experiment, D2).
- **Inventory context** — The bounded context that owns stock items as streams, one document per stock item, with its own journal and the receive, allocate and release decisions (First experiment, D2, E-46).
- **order** — A stream in the Orders context identified by an application order ID; its state holds its lines, its status, its total and `placedAt`, the time it was placed, taken from `OrderPlaced`'s `occurredAt`, under the default single mapping with the default `budgetBytes` of 256 KiB, which holds the maximum order (First experiment, D2, E-2).
- **order line** — One requested stock item, quantity and unit price inside an order, the price in whole minor units as the caller states it; the number of lines is the size the experiment measures, and the order's total is the sum of quantity times unit price over its lines (First experiment, Sc L2-3, E-46).
- **stock item** — A stream in the Inventory context identified by an application stock item ID; its state holds the quantity on hand and the quantity allocated, the quantity available being the first less the second, under `mapping: { kind: "single", budgetBytes: 16 * 1024 }`, a budget declared small because the state is two quantities, so that the allocation operation admits the maximum order's streams in one call under the byte-derived bound (First experiment, D2, E-2, E-46).
- **allocation** — The Inventory context's reservation of quantity on a stock item for one order, released when the order is cancelled (First experiment, E-46).
- **allocate operation** — The Inventory context's list-shaped operation `allocate({ orderId, lines })`, planning one stock item stream per distinct stock item with the quantities of its lines summed, and declaring `maxStreams` equal to the maximum order size, so its byte bound at the stock item's budget admits the maximum (D10, E-2, E-46, Sc L2-3).
- **place operation** — The Orders context's list-shaped operation `place({ orders: [{ orderId, lines }] })`, planning one order stream per order at expected version 0, so a second place of the same order ID is answered `entityExists` before its decider runs (D10, E-46, Sc L1-4).
- **receive operation** — The Inventory context's list-shaped operation `receive({ items })`, planning one stock item stream per distinct stock item, which creates the stream of a stock item that has none and adds the quantity to the quantity on hand; it is the only way a stock item comes to exist (Law 1, D10, E-46).
- **PlaceOrder** — The composed use case that records an order in Orders and allocates every line in Inventory in one mutation, with one receipt and one outcome, calling Orders first because it creates the order, so a UI double submit is answered `entityExists` before Inventory decides, and Inventory second; it rejects when stock is short, and an order with no line is refused `invalidInput` before either context is called (D10, D4, E-39, Sc L1-4).
- **ReceiveStock** — The command that receives stock, one call to the Inventory context's receive operation with one receipt and one outcome; every stock item of the experiment, a test's and a measurement's included, is created through it (Law 1, D10, E-46).
- **CancelOrder** — The second lifecycle command: the composed use case that cancels an order in Orders and releases its allocations in Inventory in one mutation (E-46, First experiment).
- **permissions** — `orders.place`, which `PlaceOrder` requires, `inventory.receive`, which `ReceiveStock` requires, and the read permissions `orders.read`, which the parent queries over orders and the order summary require, and `inventory.read` (D11, E-37, E-46).
- **OrderPlaced** — The Orders event recorded by `PlaceOrder`, carrying the accepted lines and the total, bounded by the events-stay-small constraint (First experiment, D2).
- **OrderCancelled** — The Orders event recorded by `CancelOrder` (E-46).
- **StockReceived** — The Inventory event recorded per stock item when `ReceiveStock` receives a quantity (E-46).
- **StockAllocated** — The Inventory event recorded per stock item when `PlaceOrder` allocates quantity to an order; it carries the order ID and the quantity (First experiment, D2).
- **AllocationReleased** — The Inventory event recorded per stock item when `CancelOrder` releases a line (E-46).
- **short stock rejection** — The rejection `insufficientStock` that the Inventory context throws when a stock item's available quantity is below the quantity an order asks for, carrying the requested and the available quantity; `PlaceOrder` lists the code, nothing commits, and an order that waits for stock would be a different command (D4, D7, E-46).
- **stock contention** — Two `PlaceOrder` commands for the same stock item sent concurrently; on the native backend both are applied when the stock covers both, and one is applied and one is rejected `insufficientStock` when it covers only one, and the experiment measures the retry cost of the loser (Sc L1-11, First experiment).
- **order summary** — The essential summary: a per-entity read model of the parent with the order's status, line count, total and the time it was placed, written from the order's DTO by every command that writes the order, and listed by status (E-46, D8).
- **order allocation history** — A history-dependent cross-stream read model of the parent keyed by order ID, folded as a `HistoryProjection` from `OrderPlaced` in Orders and `StockAllocated` and `AllocationReleased` across the stock item streams the order touched, holding per line when it was allocated and released; it is bound once per source stream type, rebuilds only under the write pause, and exists in the experiment for Sc L2-6, not as an essential read (E-9, E-46, D9, Sc L2-6).
- **journal inspection** — The context queries that return a stream's events and its current version for a reviewer, used by the experiment and the restore checks (First experiment, D2).
- **maximum order size** — The largest number of lines `PlaceOrder` accepts, a product decision under OQ3, provisionally 100 for measurement (OQ3, E-46).

## Verification — reviewed

- A reviewer confirms that the experiment's code, tests and measurements use these terms and no synonyms, and that `PlaceOrder`, `CancelOrder` and `ReceiveStock` are the only public commands of the experiment.
