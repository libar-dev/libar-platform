import { expect } from "vitest";
import {
  ref,
  specTest,
  testAnchorId,
} from "@libar-dev/software-delivery-protocol";
import { bindExample } from "@libar-dev/software-delivery-protocol/vitest";
import { probe6ContextEnumerationContract as contract } from "../../generated/contracts/facts.f17-migrations-fits-generation-backfill.probe-6-context-enumeration.contract.js";
const anchor = specTest({
  id: testAnchorId(
    "test:facts.f17-migrations-fits-generation-backfill.probe-6-context-enumeration",
  ),
  verifies: ref(
    "spec:facts.f17-migrations-fits-generation-backfill.probe-6-context-enumeration",
  ),
});
void anchor;
import type { Backend } from "../../harness/backend.js";
import {
  setup,
  record,
  status,
  untilStatus,
  thrown,
} from "./migration-steps.js";
interface World {
  backend?: Backend;
  parentRows?: number;
  contextRows?: number;
}
bindExample(contract, (): World => ({}), {
  "{rows} depot documents and migrations mounted in the parent and depot":
    async (world, { rows }) => {
      world.backend = (await setup(rows)).backend;
    },
  "parent and depot migrations walk tables and a parent migration calls the context list":
    async (world) => {
      const backend = world.backend!;
      await backend.admin.run("migrations:contextTable", {});
      const parent = await untilStatus(
        backend,
        "failed",
        "migrations",
        "migrations:contextTable",
      );
      world.parentRows = parent.processed;
      record("parent table walk", parent);
      expect(parent.error).toContain(
        "Uncaught Error: Index streams.by_creation_time not found.",
      );
      await backend.admin.run("migrations:contextTableWithoutSchema", {});
      const runtime = await untilStatus(
        backend,
        "failed",
        "migrations",
        "migrations:contextTableWithoutSchema",
      );
      record("parent walk without schema", runtime);
      expect(runtime.processed).toBe(0);
      expect(runtime.error).toContain(
        "Uncaught Error: Index streams.by_creation_time not found.",
      );
      await backend.admin.run("migrations:rangeWithoutSchema", {});
      const missingSchema = await untilStatus(
        backend,
        "failed",
        "migrations",
        "migrations:rangeWithoutSchema",
      );
      record("custom range without schema", missingSchema);
      expect(missingSchema.error).toContain(
        "You must provide your schema to use a custom range.",
      );
      const source = (
        await backend.admin.readTable("streams", { component: "depot" })
      )[0]!;
      const parentIdError = await thrown(
        backend.admin.run("migrations:contextId", { id: source._id! }),
      );
      record("parent reads context id", parentIdError);
      expect(parentIdError).toContain(
        'Invalid argument `id` for `db.get`: expected to be an Id<"streams">, got Id<"depthRows"> instead.',
      );
      await backend.admin.run("migrations:streams", {}, { component: "depot" });
      const context = await untilStatus(
        backend,
        "success",
        "depot/migrations",
        "migrations:streams",
      );
      world.contextRows = context.processed;
      record("context table walk", {
        status: context,
        visits: await backend.admin.readTable("migrationVisits", {
          component: "depot",
        }),
        stored: await backend.admin.readTable("migrations", {
          component: "depot/migrations",
        }),
      });
      const parentRow = (
        await backend.admin.readTable("documentSummaries")
      )[0]!;
      await backend.admin.run("migrations:prepareContext", {
        parentId: parentRow._id!,
      });
      await backend.admin.run(
        "migrations:parentWrite",
        {},
        { component: "depot" },
      );
      const failed = await untilStatus(
        backend,
        "failed",
        "depot/migrations",
        "migrations:parentWrite",
      );
      record("context writes parent id", failed);
      expect(failed.error).toContain(
        'Invalid argument `id` for `db.patch`: expected to be an Id<"documentSummaries">, got Id<"migrationSettings"> instead.',
      );
      expect(
        (await backend.admin.readTable("documentSummaries"))[0]!.title,
      ).toBe("original");
      await backend.admin.run(
        "migrations:callback",
        {},
        { component: "depot" },
      );
      record(
        "context calls parent handle",
        await untilStatus(
          backend,
          "success",
          "depot/migrations",
          "migrations:callback",
        ),
      );
      expect(
        (await backend.admin.readTable("documentSummaries")).filter(
          (row) => row.generation === 2,
        ),
      ).toHaveLength(world.contextRows!);
      await backend.admin.run("migrations:configure", {
        failKey: null,
        reads: 0,
        clear: true,
      });
      await backend.admin.writeTable("enumerationPages", {
        insert: { tenantId: "tenant", cursor: null, size: 2 },
      });
      await backend.admin.run("migrations:runEnumeration", {});
      record(
        "parent enumerates context",
        await untilStatus(
          backend,
          "success",
          "migrations",
          "migrations:enumeration",
        ),
      );
      const pages = await backend.admin.readTable("enumerationPages");
      record("enumeration page records", pages);
      expect(pages).toHaveLength(3);
      expect(
        (await backend.admin.readTable("documentSummaries")).filter(
          (row) => row.generation === 2,
        ),
      ).toHaveLength(world.contextRows!);
      record(
        "context status after enumeration",
        await status(backend, "depot/migrations", "migrations:streams"),
      );
    },
  "the parent table walk fails with {parentRows} processed context rows and the depot table walk sees {contextRows} rows":
    (world, params) => {
      expect(world.parentRows).toBe(params.parentRows);
      expect(world.contextRows).toBe(params.contextRows);
    },
});
