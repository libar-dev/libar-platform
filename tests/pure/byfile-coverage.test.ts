import {
  createReader,
  type GraphSchema,
} from "@libar-dev/software-delivery-protocol";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, test } from "vitest";

// Every source file and Spec the retired design/tools/anchor-sites.json joined by hand, when the
// anchors stood in tests. The source files now carry comment-form anchors at their own sites, so
// byFile on each file names each of its Specs through a satisfies or a references edge. The graph is
// the one `npm run sdp:build` derives before the tests run.
const associations: Record<string, string[]> = {
  "example/convex/inventory/convex.config.ts": [
    "spec:application.orders-inventory-example",
  ],
  "example/convex/inventory/operations.ts": [
    "spec:application.orders-inventory-example",
  ],
  "example/convex/inventory/queries/stockItem.ts": [
    "spec:application.orders-inventory-example",
  ],
  "example/convex/inventory/schema.ts": [
    "spec:application.orders-inventory-example",
  ],
  "example/convex/inventory/streams.ts": [
    "spec:application.orders-inventory-example",
  ],
  "example/convex/orderSummary.ts": [
    "spec:application.orders-inventory-example",
  ],
  "example/convex/ordering.ts": [
    "spec:application.orders-inventory-example",
    "spec:application.parent-use-cases",
  ],
  "example/convex/orders/convex.config.ts": [
    "spec:application.orders-inventory-example",
  ],
  "example/convex/orders/operations.ts": [
    "spec:application.orders-inventory-example",
  ],
  "example/convex/orders/queries/order.ts": [
    "spec:application.orders-inventory-example",
  ],
  "example/convex/orders/schema.ts": [
    "spec:application.orders-inventory-example",
  ],
  "example/convex/orders/streams.ts": [
    "spec:application.orders-inventory-example",
  ],
  "example/convex/receiving.ts": [
    "spec:application.orders-inventory-example",
    "spec:application.parent-use-cases",
  ],
  "example/domain/order.ts": ["spec:application.orders-inventory-example"],
  "example/domain/stockItem.ts": ["spec:application.orders-inventory-example"],
  "fixture/convex/depot/convex.config.ts": ["spec:context.context-component"],
  "fixture/convex/depot/operations.ts": [
    "spec:context.batch-shaped-api",
    "spec:context.context-component",
  ],
  "fixture/convex/depot/queries/document.ts": [
    "spec:context.context-component",
  ],
  "fixture/convex/depot/schema.ts": ["spec:context.context-component"],
  "fixture/convex/depot/streams.ts": ["spec:context.context-component"],
  "fixture/convex/depotCommands.ts": ["spec:command.command-declaration"],
  "src/command/actor-and-scope.ts": ["spec:command.actor-and-scope"],
  "src/command/authority.ts": ["spec:command.tenancy-and-authority"],
  "src/command/declaration.ts": ["spec:command.command-declaration"],
  "src/command/outcome-boundary.ts": ["spec:command.outcome-boundary"],
  "src/command/pipeline.ts": ["spec:command.command-pipeline"],
  "src/command/receipts.ts": ["spec:command.idempotency-and-receipts"],
  "src/command/tables.ts": [
    "spec:command.actor-and-scope",
    "spec:command.receipt-table",
  ],
  "src/context/adapter.ts": [
    "spec:context.batch-shaped-api",
    "spec:context.persistence-adapter",
  ],
  "src/context/envelope.ts": ["spec:context.event-envelope"],
  "src/context/journal.ts": ["spec:context.journal"],
  "src/context/operation.ts": ["spec:context.context-component"],
  "src/context/queries.ts": ["spec:context.queries"],
  "src/context/tables.ts": ["spec:context.tables"],
  "src/gate/entries.ts": ["spec:application.write-pause"],
  "src/gate/gate.ts": ["spec:application.write-pause"],
  "src/gate/tables.ts": ["spec:application.write-pause"],
  "src/kernel/decider.ts": ["spec:kernel.decider-contract"],
  "src/kernel/outcome.ts": ["spec:kernel.decider-contract"],
  "src/read-model/generations.ts": ["spec:application.generation-registry"],
  "src/read-model/projection.ts": ["spec:application.projection-contract"],
  "src/read-model/queries.ts": ["spec:application.read-models"],
  "src/read-model/rebuild.ts": ["spec:application.rebuild"],
  "src/read-model/tables.ts": ["spec:application.generation-registry"],
  "src/read-model/write.ts": ["spec:application.read-models"],
};

const root = join(import.meta.dirname, "../..");

test("pure: byFile names every Spec the retired anchor sites joined to each source file", async () => {
  const graph = JSON.parse(
    await readFile(join(root, "generated/graph.json"), "utf8"),
  ) as GraphSchema;
  const reader = createReader(graph);
  const pairs = Object.entries(associations).flatMap(([file, specs]) =>
    specs.map((spec) => [file, spec] as const),
  );
  expect(pairs).toHaveLength(50);
  const missing = pairs.filter(
    ([file, spec]) => !reader.byFile(file).specs.includes(spec),
  );
  expect(missing).toEqual([]);
});

test("pure: no implementation anchor sits in a test file", async () => {
  const graph = JSON.parse(
    await readFile(join(root, "generated/graph.json"), "utf8"),
  ) as GraphSchema;
  expect(
    graph.nodes
      .filter(
        (node) =>
          node.nodeType === "CodeNode" && node.file.startsWith("tests/"),
      )
      .map((node) => node.id),
  ).toEqual([]);
});
