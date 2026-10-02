---
id: spec:application.first-experiment.stock-item-id-past-bound-refused
kind: example
altitude: story
readiness: defined
relations:
  refines: spec:application.first-experiment
  verifies: spec:application.first-experiment
---
# A stock item ID one byte past its bound is refused

E-46 · native tier · production composition · no acceptance row; the example verifies that `PlaceOrder` refuses a stock item ID longer than its bound at step 1, before any read and before either context is called.

## Intent

- outcome: An order of 100 lines whose last stock item ID is 65 bytes of UTF-8 is refused `invalidInput` naming that line, having read and written no document, and nothing is stored. (E-46, E-12, D4)

```gwt
Given the production composition on a native backend
And an order of {size: "the maximum"} with stock contention {contention: "absent"}
And the order's stock item IDs are {idBytes: 64} bytes of UTF-8, the last line's {lastIdBytes: 65}
And the backend runs with {configuration: "production configuration"}
When {run: "the PlaceOrder use case"} runs
Then the caller receives {answer: "the rejection invalidInput"}
And the rejection names line {line: 99} with a stock item ID of {length: 65} bytes against a bound of {limit: 64}
And the command read {readDocuments: 0} documents and wrote {writtenDocuments: 0}
```

## Verification — executable

- Runs in the native tier on the production composition; every test owns its disposable backend.
- After grants and the order summary's first rebuild through to its switch as setup, the test receives stock through `ReceiveStock` for the 99 stock items of the order within the bound, the last one being an ID `ReceiveStock` refuses too, so a refusal later than step 1 would be short stock and not `invalidInput`, and sends one `PlaceOrder` with one line on each from an ordinary client under a request key.
- It asserts the `ConvexError` data exactly, `{ kind: "rejection", code: "invalidInput", commandType: "PlaceOrder", message: "Line 99 needs a stock item ID of at most 64 bytes of UTF-8, not 65", details: { line: 99, length: 65, limit: 64 } }`, reads zero documents read and written from the command's own top-level completion record's `usageStats`, which places the refusal before the grant read and before either context's sub-transaction, and asserts that the receipts, both contexts' stream rows and events and the order summaries are unchanged.
