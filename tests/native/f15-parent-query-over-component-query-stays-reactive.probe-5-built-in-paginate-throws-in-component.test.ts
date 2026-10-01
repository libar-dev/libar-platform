import { expect } from "vitest";
import {
  ref,
  specTest,
  testAnchorId,
} from "@libar-dev/software-delivery-protocol";
import { bindExample } from "@libar-dev/software-delivery-protocol/vitest";
import { probe5BuiltInPaginateThrowsInComponentContract as contract } from "../../generated/contracts/facts.f15-parent-query-over-component-query-stays-reactive.probe-5-built-in-paginate-throws-in-component.contract.js";
import { api } from "../../fixture/convex/_generated/api.js";
import type { Backend } from "../../harness/backend.js";
import { ordinaryClient } from "../../harness/clients.js";
import { fixtureBackend, measure, required } from "../../harness/native.js";
import { seedList } from "./list-pages.js";
const anchor = specTest({
  id: testAnchorId(
    "test:facts.f15-parent-query-over-component-query-stays-reactive.probe-5-built-in-paginate-throws-in-component",
  ),
  verifies: ref(
    "spec:facts.f15-parent-query-over-component-query-stays-reactive.probe-5-built-in-paginate-throws-in-component",
  ),
});
void anchor;
interface World {
  backend?: Backend;
  error?: unknown;
}
bindExample(contract, (): World => ({}), {
  // The annex's builtinPage calls ctx.db.query("rows").paginate inside the component.
  "a component query that calls the built-in paginate on its own table": async (
    world,
  ) => {
    world.backend = await fixtureBackend();
    await seedList(ordinaryClient(world.backend.url), 30);
  },
  "a client reads it through a parent query": async (world) => {
    const client = ordinaryClient(required(world.backend, "the backend").url);
    world.error = await client
      .query(api.list.builtinPage, {
        paginationOpts: { cursor: null, numItems: 10 },
      })
      .then(
        () => undefined,
        (thrown: unknown) => thrown,
      );
    measure("builtinInComponent", String(world.error).slice(0, 300));
  },
  "the read fails with an error that says paginate is only supported in the app":
    async (world) => {
      expect(String(world.error)).toContain(
        "paginate() is only supported in the app",
      );
      // The same parent over the annex's paginator query on the same table returns its page.
      const client = ordinaryClient(required(world.backend, "the backend").url);
      const page = await client.query(api.list.page, {
        paginationOpts: { cursor: null, numItems: 10 },
      });
      expect(page.page).toHaveLength(10);
    },
});
