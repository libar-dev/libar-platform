import type { Backend } from "../../harness/backend.js";
// Every mount in example/convex/convex.config.ts, plus the parent.
export async function scheduledRows(backend: Backend) {
  const rows = await Promise.all(
    [undefined, "orders", "inventory"].map((component) =>
      backend.admin.readTable(
        "_scheduled_functions",
        component === undefined ? {} : { component },
      ),
    ),
  );
  return rows.flat();
}
