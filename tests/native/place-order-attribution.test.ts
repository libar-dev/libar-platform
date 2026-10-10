import {
  ref,
  specTest,
  testAnchorId,
} from "@libar-dev/software-delivery-protocol";
import { getFunctionName } from "convex/server";
import { expect, test } from "vitest";
import { internal } from "../../example/convex/_generated/api.js";
import { placeOrderPermission } from "../../example/convex/ordering.js";
import { required } from "../../harness/native.js";
import {
  application,
  configurationIs,
  grantedPermissions,
  orderLines,
  receive,
  subject,
  tenantId,
  type ExperimentWorld,
} from "./first-experiment-steps.js";
import { stored, submit, type OrderArgs } from "./place-order-attribution.js";

const anchor = specTest({
  id: testAnchorId("test:application.first-experiment.place-order-attribution"),
  verifies: ref("spec:application.first-experiment"),
});
void anchor;

const comparisons = [
  {
    name: "healthy ten distinct stock items",
    readBytes: 14359,
    writeBytes: 18419,
    reads: 35,
    writes: 24,
  },
  {
    name: "one grant",
    readBytes: 13441,
    writeBytes: 18419,
    reads: 32,
    writes: 24,
  },
  {
    name: "two prior events on the last stock item",
    readBytes: 14359,
    writeBytes: 18419,
    reads: 35,
    writes: 24,
  },
  {
    name: "two lines on one stock item",
    readBytes: 13080,
    writeBytes: 16968,
    reads: 32,
    writes: 22,
  },
  {
    name: "no request key",
    readBytes: 14359,
    writeBytes: 15958,
    reads: 35,
    writes: 23,
  },
  {
    name: "authorized duplicate",
    readBytes: 3441,
    writeBytes: 0,
    reads: 5,
    writes: 0,
  },
  {
    name: "changed input conflict",
    readBytes: 3441,
    writeBytes: 0,
    reads: 5,
    writes: 0,
    failure: "idempotencyConflict",
  },
  {
    name: "short stock on the last item",
    readBytes: 13106,
    writeBytes: 0,
    reads: 32,
    writes: 0,
    failure: "insufficientStock",
  },
  {
    name: "no prior event on the last stock item",
    readBytes: 12733,
    writeBytes: 0,
    reads: 31,
    writes: 0,
    failure: "insufficientStock",
  },
  {
    name: "no generation",
    readBytes: 14012,
    writeBytes: 0,
    reads: 34,
    writes: 0,
    failure: "no generation to write",
  },
  {
    name: "missing journal tail",
    readBytes: 13106,
    writeBytes: 0,
    reads: 32,
    writes: 0,
    failure: "journal holds no event",
  },
  {
    name: "journal tail ahead of its stream row",
    readBytes: 13707,
    writeBytes: 0,
    reads: 33,
    writes: 0,
    failure: "above the expected",
  },
  {
    name: "stock row at version zero without events",
    readBytes: 13758,
    writeBytes: 18419,
    reads: 34,
    writes: 24,
  },
  {
    name: "existing summary row",
    readBytes: 14901,
    writeBytes: 18419,
    reads: 37,
    writes: 24,
  },
  {
    name: "building generation",
    readBytes: 14710,
    writeBytes: 18959,
    reads: 36,
    writes: 25,
  },
  {
    name: "existing order with a fresh request key",
    readBytes: 2205,
    writeBytes: 0,
    reads: 5,
    writes: 0,
    failure: "entityExists",
  },
] as const;

test.each(comparisons)(
  "native: PlaceOrder usage with $name",
  async (comparison) => {
    const world: ExperimentWorld = {};
    await application(world);
    await configurationIs(world, "production configuration");
    const backend = required(world.backend, "the backend");
    const lines = orderLines(10, "sku");
    await receive(
      world,
      comparison.name === "no prior event on the last stock item"
        ? lines.slice(0, 9)
        : lines,
    );
    const args: OrderArgs = {
      tenantId,
      requestKey: "k-order-1",
      input: { orderId: "order-1", lines },
    };
    const last = required(lines[9], "last line");

    switch (comparison.name) {
      case "one grant":
        for (const permission of grantedPermissions.filter(
          (permission) => permission !== placeOrderPermission,
        )) {
          await backend.admin.run(getFunctionName(internal.grants.revoke), {
            tenantId,
            principalKind: "human",
            principalId: `${backend.issuer.issuer}|${subject}`,
            permission,
          });
        }
        break;
      case "two prior events on the last stock item":
        await receive(world, [last]);
        break;
      case "two lines on one stock item":
        last.stockItemId = required(lines[0], "first line").stockItemId;
        break;
      case "no request key":
        delete args.requestKey;
        break;
      case "short stock on the last item":
        last.quantity = 3;
        break;
      case "no generation": {
        const rows = await stored(backend);
        await backend.admin.writeTable("generations", {
          delete: String(required(rows.generations[0]?._id, "generation id")),
        });
        break;
      }
      case "missing journal tail":
      case "journal tail ahead of its stream row":
      case "stock row at version zero without events": {
        const rows = await stored(backend);
        const event = required(
          rows.stockEvents.find((row) => row["streamId"] === last.stockItemId),
          "stock event",
        );
        if (comparison.name === "journal tail ahead of its stream row") {
          await backend.admin.writeTable(
            "events",
            {
              patch: String(required(event["_id"], "event id")),
              fields: { streamVersion: 2 },
            },
            { component: "inventory" },
          );
        } else {
          await backend.admin.writeTable(
            "events",
            { delete: String(required(event["_id"], "event id")) },
            { component: "inventory" },
          );
          if (comparison.name === "stock row at version zero without events") {
            const stream = required(
              rows.stockStreams.find(
                (row) => row["streamId"] === last.stockItemId,
              ),
              "stock stream",
            );
            await backend.admin.writeTable(
              "streams",
              {
                patch: String(required(stream["_id"], "stream id")),
                fields: { streamVersion: 0 },
              },
              { component: "inventory" },
            );
          }
        }
        break;
      }
      case "existing summary row":
        await backend.admin.writeTable("orderSummaries", {
          insert: {
            tenantId,
            generation: 1,
            key: "order-1",
            projectionVersion: 1,
            sourceVersions: [],
            orderId: "order-1",
            status: "placed",
            lineCount: 0,
            total: 0,
            placedAt: 0,
          },
        });
        break;
      case "building generation": {
        const rows = await stored(backend);
        const generation = { ...required(rows.generations[0], "generation") };
        delete generation["_id"];
        delete generation["_creationTime"];
        await backend.admin.writeTable("generations", {
          insert: { ...generation, generation: 2, state: "building" },
        });
        break;
      }
      case "authorized duplicate":
      case "changed input conflict":
      case "existing order with a fresh request key": {
        const first = await submit(world, args, "firstSubmission");
        expect(first.outcome).toMatchObject({
          kind: "applied",
          replayed: false,
        });
        expect(first.usage.databaseReadDocuments).toBe(35);
        expect(first.usage.databaseWriteDocuments).toBe(24);
        if (comparison.name === "changed input conflict") last.unitPrice += 1;
        if (comparison.name === "existing order with a fresh request key")
          args.requestKey = "fresh-key";
        break;
      }
    }

    const result = await submit(world, args, "comparison");
    expect(result.usage.databaseReadDocuments).toBe(comparison.reads);
    expect(result.usage.databaseWriteDocuments).toBe(comparison.writes);
    expect(result.usage.databaseReadBytes).toBe(comparison.readBytes);
    expect(result.usage.databaseWriteBytes).toBe(comparison.writeBytes);
    if ("failure" in comparison) {
      expect(JSON.stringify(result.outcome)).toContain(comparison.failure);
      expect(result.error).toBeDefined();
    } else {
      expect(result.error).toBeUndefined();
      expect(result.outcome).toMatchObject({
        kind: "applied",
        replayed: comparison.name === "authorized duplicate",
      });
      if (comparison.name === "authorized duplicate")
        expect(result.after).toEqual(result.before);
      else {
        const distinct = new Set(lines.map((line) => line.stockItemId)).size;
        expect(result.after.grants).toEqual(result.before.grants);
        expect(result.after.generations).toEqual(result.before.generations);
        const beforeById = new Map(
          result.before.stockStreams.map((row) => [row["_id"], row]),
        );
        const changed = result.after.stockStreams.filter(
          (row) =>
            JSON.stringify(row) !== JSON.stringify(beforeById.get(row["_id"])),
        );
        expect(changed).toHaveLength(distinct);
        expect(new Set(changed.map((row) => row["lastOperationId"]))).toEqual(
          new Set([result.response?.operationId]),
        );
        expect(
          result.after.orderStreams.length - result.before.orderStreams.length,
        ).toBe(1);
        expect(
          result.after.orderEvents.length - result.before.orderEvents.length,
        ).toBe(1);
        expect(result.after.stockStreams.length).toBe(
          result.before.stockStreams.length,
        );
        expect(
          result.after.stockEvents.length - result.before.stockEvents.length,
        ).toBe(distinct);
        expect(
          result.after.receipts.length - result.before.receipts.length,
        ).toBe(args.requestKey === undefined ? 0 : 1);
        expect(
          result.after.summaries.length - result.before.summaries.length,
        ).toBe(
          comparison.name === "existing summary row"
            ? 0
            : comparison.name === "building generation"
              ? 2
              : 1,
        );
      }
    }
  },
);
