---
id: spec:application.first-experiment.receive-stock-item-id-past-bound-refused
kind: example
altitude: story
readiness: defined
relations:
  refines: spec:application.first-experiment
  verifies: spec:application.first-experiment
---
# ReceiveStock refuses a stock item ID one byte past its bound

E-46 · native backend tier · production composition · no acceptance row; the example verifies that `ReceiveStock` refuses a stock item ID longer than the bound `PlaceOrder` also carries at step 1, before any read and before the Inventory context is called.

## Intent

- outcome: `ReceiveStock` of 100 items whose last stock item ID is 65 bytes of UTF-8 is refused `invalidInput` naming that item, having read and written no document, and nothing is stored. (E-46, D4)

```gwt
Given the production composition on a native backend
And ReceiveStock is sent {items: 100} stock items whose IDs are {idBytes: 64} bytes of UTF-8, the last one's {lastIdBytes: 65}
And the backend runs with {configuration: "production configuration"}
When {run: "the ReceiveStock command"} runs
Then the caller receives {answer: "the rejection invalidInput"}
And the rejection names line {line: 99} with a stock item ID of {length: 65} bytes against a bound of {limit: 64}
And the command read {readDocuments: 0} documents and wrote {writtenDocuments: 0}
```

## Verification — executable

- Runs in the native backend tier on the production composition; every test owns its disposable backend.
- After grants and the order summary's first rebuild through to its switch as setup, the test sends one `ReceiveStock` of 100 items with distinct stock item IDs from an ordinary client under a request key, the last ID built from multi-byte UTF-8 characters so that its character count is below its byte count.
- It asserts the `ConvexError` data exactly, `{ kind: "rejection", code: "invalidInput", entry: "ReceiveStock", message: "Line 99 needs a stock item ID of at most 64 bytes of UTF-8, not 65", details: { line: 99, length: 65, limit: 64 } }`, reads zero documents read and written from the command's own top-level completion record's `usageStats`, and asserts that the receipts and the Inventory context's stream rows and events are unchanged.
