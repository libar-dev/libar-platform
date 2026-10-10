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
// The rows of a later read that an earlier read did not hold: what was scheduled between the two.
// A setup that installs a read model through its first rebuild leaves its batches' rows behind.
export function scheduledSince(
  before: Awaited<ReturnType<typeof scheduledRows>>,
  after: Awaited<ReturnType<typeof scheduledRows>>,
) {
  return after.filter((row) => !before.some((prior) => prior._id === row._id));
}
