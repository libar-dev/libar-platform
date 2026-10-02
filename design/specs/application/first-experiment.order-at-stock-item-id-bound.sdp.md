---
id: spec:application.first-experiment.order-at-stock-item-id-bound
kind: example
altitude: story
readiness: defined
relations:
  refines: spec:application.first-experiment
  verifies: spec:application.first-experiment
---
# An order of the maximum number of lines at the stock item ID bound

E-46 · native tier · production composition · no acceptance row; the example verifies that the maximum order fits the event payload bound when every stock item ID is at the bound `PlaceOrder`'s declaration carries.

## Intent

- outcome: An order of 100 lines whose every stock item ID is 64 bytes of UTF-8 is applied, and the `OrderPlaced` it records measures 11,725 bytes, under the 16,384-byte payload bound. (E-46, E-12, OQ3)

```gwt
Given the production composition on a native backend
And an order of {size: "the maximum"} with stock contention {contention: "absent"}
And the order's stock item IDs are {idBytes: 64} bytes of UTF-8, the last line's {lastIdBytes: 64}
And the backend runs with {configuration: "production configuration"}
When {run: "the PlaceOrder use case"} runs
Then the caller receives {answer: "the result"}
And the command read {readDocuments: 305} documents and wrote {writtenDocuments: 204}
And the order's OrderPlaced payload measures {payloadBytes: 11725} bytes
```

## Verification — executable

- Runs in the native tier on the production composition; every test owns its disposable backend.
- After grants and the order summary's first rebuild through to its switch as setup, the test receives stock for the order's 100 stock items through `ReceiveStock`, each ID distinct and exactly 64 bytes of UTF-8, and sends one `PlaceOrder` with one line on each from an ordinary client under a request key.
- It asserts the applied response, reads the documents read and written from the command's own top-level completion record's `usageStats`, and measures with `getConvexSize` the payload of the one `OrderPlaced` event the Orders context's journal holds for the order, read through admin access.
