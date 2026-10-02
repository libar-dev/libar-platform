---
id: spec:application.orders-inventory-example
kind: model
altitude: story
readiness: defined
relations:
  refines: spec:application.first-experiment
  decidedBy:
    - spec:decisions.d04-four-outcomes
    - spec:decisions.d07-rejections-thrown-not-stored
    - spec:decisions.d10-contexts-meet-in-parent-use-cases
  constrainedBy:
    - spec:laws.law01-sanctioned-writes-only
    - spec:laws.law09-no-invariant-on-late-read-model
---
# Orders and Inventory, the example domain

Story · Detail: full · Traces: First experiment, Law 1, Law 9, D3, D4, D6, D7, D9, D10, D16, Sc L1-4, Sc L1-11, Sc L2-3, Sc L2-6, E-2, E-9, E-38, E-39, E-46.

The first experiment's domain has two bounded contexts, Orders and Inventory, one composed use case that makes them meet, one more lifecycle command, one command that creates stock, and one essential summary. The terms below are the ones the experiment's code, tests and measurements use. Where the doc names a thing, its word is kept; the second lifecycle command, the command that creates stock, the summary and the rejection reasons are the design's choices under E-46. `StartCheckout` from D16 is not part of the experiment; it is the Layer 4 contrast to atomic `PlaceOrder`.

The second lifecycle command is `CancelOrder`. The stock item keeps two totals and no allocation per order, so a release takes its quantities from the cancelled order's own lines, which Orders returns in the same mutation, and a second cancel is refused by the order's own state; no stock item remembers an order.

## Intent

- outcome: Fix the vocabulary of the example domain so the experiment, its scenarios and its measurements name the same things the same way (First experiment, E-46)
- value: A reader of a measurement or a scenario knows which context, command, event and read model is meant without reading the code (First experiment)

### Open questions

- [non-blocking] Extension E-46: the second lifecycle command, the essential summary, the command that creates stock, the unit price an order line carries, the rejection reasons, the stream budgets of the two stream types, the order of the two context calls and the history-dependent view Sc L2-6 builds are choices the doc leaves open; two of them are decided, that the stock item keeps totals only and `release` takes its quantities from the cancelled order's own lines, and that the order allocation history view stays in the experiment; the owner may substitute the others, and the experiment's terms move with them (E-46, E-2, E-9, First experiment)

## Model

- **Orders context** — The bounded context that owns orders as streams, one document per order, with its own journal and the place and cancel decisions (First experiment, D2).
- **Inventory context** — The bounded context that owns stock items as streams, one document per stock item, with its own journal and the receive, allocate and release decisions (First experiment, D2, E-46).
- **order** — A stream in the Orders context identified by an application order ID; its state is `{ status: "none" | "placed" | "cancelled"; lines: OrderLine[]; total: number; placedAt: number | null }`, where `none` is a stream with no event and `placedAt` is the time it was placed, taken from `OrderPlaced`'s `occurredAt`, under the default single mapping with the default `budgetBytes` of 256 KiB, which holds the maximum order (First experiment, D2, E-2, E-46).
- **order line** — One requested stock item, quantity and unit price inside an order, `{ stockItemId: string; quantity: number; unitPrice: number }`, the price in whole minor units as the caller states it; the number of lines is the size the experiment measures, and the order's total is the sum of quantity times unit price over its lines (First experiment, Sc L2-3, E-46).
- **order DTO** — What the Orders context returns for an order that has an event, `{ orderId: string; status: "placed" | "cancelled"; lines: OrderLine[]; total: number; placedAt: number; version: StreamVersion }`; an order with no event has no DTO, and a cancelled order keeps its lines, total and `placedAt` (D10, E-46).
- **order invariant** — `aPlacedOrderHasALineATimeAndItsTotal`: an order that is placed or cancelled has at least one line, a `placedAt` and the total of its lines (D3, E-46).
- **stock item** — A stream in the Inventory context identified by an application stock item ID; its state is two totals, `{ onHand: number; allocated: number }`, the quantity on hand and the quantity allocated, and no allocation per order, the quantity available being the first less the second, under `mapping: { kind: "single", budgetBytes: 16 * 1024 }`, a budget declared small because the state is two quantities, so that the allocate and release operations admit the maximum order's streams in one call under the byte-derived bound (First experiment, D2, E-2, E-46).
- **stock item invariant** — `allocatedIsAWholeNumberBetweenZeroAndOnHand`: both totals are safe whole numbers and the quantity allocated is at least 0 and at most the quantity on hand (D3, E-46).
- **allocation** — The Inventory context's reservation of quantity on a stock item for one order; `StockAllocated` names the order, the stock item's state keeps only the summed total, and the allocation is released when the order is cancelled (First experiment, E-46).
- **allocate operation** — The Inventory context's list-shaped operation `allocate({ orderId, lines })`, planning one stock item stream per distinct stock item with the quantities of its lines summed, and declaring `maxStreams` equal to the maximum order size, so its byte bound at the stock item's budget admits the maximum (D10, E-2, E-46, Sc L2-3).
- **release operation** — The Inventory context's list-shaped operation `release({ orderId, lines: [{ stockItemId, quantity }] })`, planning one `release` stream command per distinct stock item with the quantities of its lines summed, in the order stock items first appear, with no expected version and `maxStreams` equal to the maximum order size; it returns `{ lines: [{ stockItemId, quantity }] }`, one entry per stock item released (D10, E-2, E-46).
- **place operation** — The Orders context's list-shaped operation `place({ orders: [{ orderId, lines }] })`, planning one order stream per order at expected version 0, so a second place of the same order ID is answered `entityExists` before its decider runs (D10, E-46, Sc L1-4).
- **cancel operation** — The Orders context's list-shaped operation `cancel({ orders: [{ orderId }] })`, planning one `cancel` stream command per order with no expected version, so the order's own state decides it, and declaring `maxStreams` 32 as the place operation does; it returns `{ orders: [{ orderId, lines }] }`, the lines of each cancelled order taken from its DTO (D10, E-46).
- **receive operation** — The Inventory context's list-shaped operation `receive({ items })`, planning one stock item stream per distinct stock item, which creates the stream of a stock item that has none and adds the quantity to the quantity on hand; it is the only way a stock item comes to exist (Law 1, D10, E-46).
- **PlaceOrder** — The composed use case that records an order in Orders and allocates every line in Inventory in one mutation, with one receipt and one outcome, calling Orders first because it creates the order, so a UI double submit is answered `entityExists` before Inventory decides, and Inventory second; it rejects when stock is short, and an order with no line is refused `invalidInput` before either context is called (D10, D4, E-39, Sc L1-4).
- **ReceiveStock** — The command that receives stock, one call to the Inventory context's receive operation with one receipt and one outcome; every stock item of the experiment, a test's and a measurement's included, is created through it (Law 1, D10, E-46).
- **CancelOrder** — The second lifecycle command: the composed use case `cancelOrder`, input `{ orderId: string }`, that calls the Orders context's cancel operation once with the one order and then the Inventory context's release operation once with the order ID and the stock item and quantity of each line Orders returned for that order, in one mutation with one receipt and one outcome, and answers `{ orderId: string; released: { stockItemId: string; quantity: number }[] }`, the release operation's lines; Orders comes first because the order's state refuses a cancel before Inventory decides, and the quantities are read from what Orders returned in this mutation, never from a read model (D10, D4, Law 9, E-39, E-46).
- **CancelOrder declaration** — `name: "CancelOrder"`, `contractVersion: 1`, `permission: { permission: "orders.cancel" }`, `writes` the Orders `order` and the Inventory `stockItem`, `readModels` the order summary from the Orders `order`, `rejections: ["orderNotFound", "orderAlreadyCancelled", "insufficientAllocation"]` and no `bounds`, because the input holds no list, the streams the command writes are its one order and the stock items of that order's lines, at most the 100 `PlaceOrder` admitted, and the order ID is bounded at 256 bytes as every stream ID is (D6, D10, E-38, E-46).
- **permissions** — `orders.place`, which `PlaceOrder` requires, `orders.cancel`, which `CancelOrder` requires, `inventory.receive`, which `ReceiveStock` requires, and the read permissions `orders.read`, which the parent queries over orders and the order summary require, and `inventory.read` (D11, E-37, E-46).
- **OrderPlaced** — The Orders event recorded by `PlaceOrder`, carrying the accepted lines and the total, `{ lines, total }`, bounded by the events-stay-small constraint (First experiment, D2).
- **OrderCancelled** — The Orders event recorded by `CancelOrder` on a placed order, with the empty payload `{}` and the time in `occurredAt`; folding it sets the order's status to `cancelled` and keeps its lines, total and `placedAt` (E-46, D2).
- **StockReceived** — The Inventory event recorded per stock item when `ReceiveStock` receives a quantity (E-46).
- **StockAllocated** — The Inventory event recorded per stock item when `PlaceOrder` allocates quantity to an order; it carries the order ID and the quantity (First experiment, D2).
- **AllocationReleased** — The Inventory event recorded per stock item when `CancelOrder` releases the cancelled order's lines on it, carrying the order ID and the summed quantity, `{ orderId, quantity }`; folding it subtracts the quantity from the quantity allocated and leaves the quantity on hand (E-46, D2).
- **short stock rejection** — The rejection `insufficientStock` that the Inventory context throws when a stock item's available quantity is below the quantity an order asks for, with the message "Cannot allocate N when M are available" and the details `{ requested, available }`; `PlaceOrder` lists the code, nothing commits, and an order that waits for stock would be a different command (D4, D7, E-46).
- **unknown order rejection** — The rejection `orderNotFound` that the order decider throws for a cancel of an order with no event, with the message "The order does not exist" and no details; `CancelOrder` lists the code, and nothing commits (D4, D7, E-46).
- **second cancel rejection** — The rejection `orderAlreadyCancelled` that the order decider throws for a cancel of a cancelled order, with the message "The order is already cancelled" and no details, so a second cancel never reaches Inventory and no stock item has to remember an order; `CancelOrder` lists the code, and nothing commits (D4, D7, E-46).
- **release above allocation rejection** — The rejection `insufficientAllocation` that the stock item decider throws for a release larger than the stock item's quantity allocated, with the message "Cannot release N when M are allocated" and the details `{ requested, allocated }`; a cancel of a placed order does not ask for one, because `PlaceOrder` allocated every line in the mutation that recorded the order and one order is cancelled once, and if the two contexts ever disagree `CancelOrder` lists the code and nothing commits (D4, D7, E-46).
- **invalid quantity rejection** — The rejection `invalidQuantity`. The order decider throws it for a place whose line has a quantity below 1 or not whole or a unit price below 0 or not whole, and for lines whose total passes the largest safe whole number; the stock item decider throws it for a receive, allocate or release of a quantity that is not a positive whole number, with the message "A quantity must be a positive whole number, not N" and the details `{ quantity }` (D4, D7, E-46).
- **stock contention** — Two `PlaceOrder` commands for the same stock item sent concurrently; on the native backend both are applied when the stock covers both, and one is applied and one is rejected `insufficientStock` when it covers only one, and the experiment measures the retry cost of the loser (Sc L1-11, First experiment).
- **order summary** — The essential summary: a per-entity read model of the parent with the order's status, line count, total and the time it was placed, `{ orderId, status: "placed" | "cancelled", lineCount, total, placedAt }`, written from the order's DTO by every command that writes the order, so `PlaceOrder` inserts the row with `placed` and `CancelOrder` replaces it with `cancelled`, and listed by status (E-46, D8).
- **order allocation history** — A history-dependent cross-stream read model of the parent keyed by order ID, folded as a `HistoryProjection` from `OrderPlaced` in Orders and `StockAllocated` and `AllocationReleased` across the stock item streams the order touched, holding per line when it was allocated and released; it is bound once per source stream type, rebuilds only under the write pause, and exists in the experiment for Sc L2-6, not as an essential read (E-9, E-46, D9, Sc L2-6).
- **journal inspection** — The context queries that return a stream's events and its current version for a reviewer, used by the experiment and the restore checks (First experiment, D2).
- **maximum order size** — The largest number of lines `PlaceOrder` accepts, 100, the bound its declaration carries: the example's promise and no platform limit, chosen by the command's author under the adapter's stream and byte ceilings (OQ3, E-46).

## Example space

```gwt-vocabulary
Given {onHand:number} units of a stock item received through ReceiveStock
And an order placed for {ordered:number} of them over two lines
And the order {before:"is cancelled under request key k-1"|"has its units released by Inventory alone"}
When a caller {grant:"holding"|"lacking"} the permission orders.cancel sends CancelOrder for {target:"that order"|"an order never placed"} under request key {key:string}
Then the caller receives {response:"the result"|"the receipt's answer"|"the rejection"}
And the rejection code is {code:"orderAlreadyCancelled"|"orderNotFound"|"insufficientAllocation"|"forbidden"}
And the stock item's quantity allocated is {allocated:number}
And the order summary's status is {status:"placed"|"cancelled"}
And the number of documents the command wrote is {written:number}
```

## Verification — reviewed

- A reviewer confirms that the experiment's code, tests and measurements use these terms and no synonyms, and that `PlaceOrder`, `CancelOrder` and `ReceiveStock` are the only public commands of the experiment.
- A reviewer confirms that the stock item's state holds the two totals and nothing per order, and that `CancelOrder` takes the quantities it releases from the lines the Orders context returned in the same mutation.
