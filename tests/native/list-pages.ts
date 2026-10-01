import type { ConvexHttpClient } from "convex/browser";
import { api } from "../../fixture/convex/_generated/api.js";
import type { ListPage, ListRow } from "../../fixture/convex/list.js";
import type { Backend } from "../../harness/backend.js";
// The annex list in the order the by_position index gives it.
export async function wholeList(backend: Backend): Promise<ListRow[]> {
  const rows = (await backend.admin.readTable("rows", {
    component: "annex",
  })) as unknown as ListRow[];
  return rows.sort(
    (a, b) =>
      a.position - b.position ||
      a._creationTime - b._creationTime ||
      (a._id < b._id ? -1 : 1),
  );
}
export const idsOf = (rows: readonly ListRow[]) => rows.map((row) => row._id);
// Rows at positions 0, 1, 2 and so on, written in one mutation.
export async function seedList(client: ConvexHttpClient, rows: number) {
  await client.mutation(api.list.insert, {
    rows: Array.from({ length: rows }, (_, position) => ({
      position,
      label: `row ${position}`,
    })),
  });
}
// Rows between position 0 and position 1, written in one mutation. They fall inside the first
// page's range whatever the page size.
export async function insertInsideFirstRange(
  client: ConvexHttpClient,
  count: number,
) {
  await client.mutation(api.list.insert, {
    rows: Array.from({ length: count }, (_, index) => ({
      position: (index + 1) / (count + 1),
      label: `inserted ${index}`,
    })),
  });
}
// One page read once through the parent.
export function loadPage(
  client: ConvexHttpClient,
  paginationOpts: {
    cursor: string | null;
    numItems: number;
    endCursor?: string;
  },
  maximumRowsRead?: number,
): Promise<ListPage> {
  return client.query(api.list.page, {
    paginationOpts,
    ...(maximumRowsRead === undefined ? {} : { maximumRowsRead }),
  });
}
