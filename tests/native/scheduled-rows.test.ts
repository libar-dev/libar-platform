import { expect, test } from "vitest";
import { api } from "../../fixture/convex/_generated/api.js";
import { ordinaryClient } from "../../harness/clients.js";
import { fixtureBackend, measure } from "../../harness/native.js";
test("admin reads a delayed scheduled function in the parent and its component", async () => {
  const backend = await fixtureBackend();
  const ids = (await ordinaryClient(backend.url).mutation(
    api.scheduledRows.schedule,
    {},
  )) as { parent: string; component: string };
  for (const [component, id] of [
    [undefined, ids.parent],
    ["annex", ids.component],
  ] as const) {
    const rows = await backend.admin.readTable(
      "_scheduled_functions",
      component === undefined ? {} : { component },
    );
    measure(component ?? "parent", JSON.stringify(rows));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ _id: id, state: { kind: "pending" } });
    expect(rows[0]!.scheduledTime).toBeGreaterThan(Date.now());
  }
});
