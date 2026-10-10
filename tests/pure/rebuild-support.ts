import type { StreamVersion } from "../../src/kernel/index.js";
import type {
  ApplyResult,
  ReadModel,
} from "../../src/read-model/projection.js";
import type { RowWriter } from "../../src/read-model/tables.js";

export const modes = ["live-created", "live-updated", "backfill"] as const;
export const roles = ["active", "building", "verifying"] as const;
export const rowStates = [
  "absent",
  "older",
  "equal",
  "newer",
  "other-stream",
] as const;
export type RowState = (typeof rowStates)[number];
export const version = (n: number): StreamVersion => ({
  tenantId: "tenant-a",
  contextId: "depot",
  streamType: "document",
  streamId: "document-a",
  version: n,
});
export const dto = { documentId: "document-a", title: "candidate" };
export const readModel: ReadModel<typeof dto, typeof dto> = {
  name: "documentTitle",
  table: "documentTitles",
  rowBudgetBytes: 16384,
  projections: [
    {
      version: 2,
      keyOf: (_tenant, d) => d.documentId,
      project: (_tenant, d) => (d.title === "(deleted)" ? null : d),
    },
    {
      version: 1,
      keyOf: (_tenant, d) => d.documentId,
      project: (_tenant, d) => d,
    },
  ],
};
export const candidateRow = {
  ...dto,
  tenantId: "tenant-a",
  generation: 1,
  key: "document-a",
  projectionVersion: 2,
  sourceVersions: [version(3)],
};
export function priorRow(state: RowState) {
  if (state === "absent") return null;
  return {
    ...candidateRow,
    title: "prior",
    sourceVersions: [
      state === "other-stream"
        ? { ...version(99), streamId: "another-document" }
        : version({ older: 2, equal: 3, newer: 4 }[state]),
    ],
  };
}
// projection-contract.sdp.md:64, step1:90, step3:92. These are the expected result tables,
// including a row whose versions contain no entry for the input stream.
const live: Record<RowState, ApplyResult> = {
  absent: "inserted",
  older: "updated",
  equal: "updated",
  newer: "updated",
  "other-stream": "updated",
};
const backfill: Record<RowState, ApplyResult> = {
  absent: "inserted",
  older: "updated",
  equal: "skipped-newer",
  newer: "skipped-newer",
  "other-stream": "updated",
};
const liveNull: Record<RowState, ApplyResult> = {
  absent: "unchanged",
  older: "deleted",
  equal: "deleted",
  newer: "deleted",
  "other-stream": "deleted",
};
const backfillNull: Record<RowState, ApplyResult> = {
  absent: "unchanged",
  older: "deleted",
  equal: "skipped-newer",
  newer: "skipped-newer",
  "other-stream": "deleted",
};
export const projectionCases = modes.flatMap((mode) =>
  roles.flatMap((role) =>
    rowStates.flatMap((state) =>
      [false, true].map((isNull) => ({
        mode,
        role,
        state,
        isNull,
        expected: isNull
          ? (mode === "backfill" ? backfillNull : liveNull)[state]
          : mode === "backfill"
            ? backfill[state]
            : mode === "live-updated" &&
                role === "building" &&
                state === "absent"
              ? ("skipped-missing" as const)
              : live[state],
      })),
    ),
  ),
);

// A single-table writer. It enforces the index predicates and preserves system fields on replace.
// The cast supplies Convex's database type, not a replacement for applyProjection.
export function memoryWriter(initial: ReturnType<typeof priorRow>) {
  type Stored = NonNullable<typeof initial> & {
    _id: string;
    _creationTime: number;
  };
  let row: Stored | null =
    initial === null ? null : { ...initial, _id: "row", _creationTime: 1 };
  let writes = 0;
  const db = {
    query: (table: string) => {
      if (table !== "documentTitles") throw new Error(table);
      return {
        withIndex: (index: string, select: (q: unknown) => unknown) => {
          if (index !== "by_key") throw new Error(index);
          const equalities: [string, unknown][] = [];
          const q = {
            eq: (key: string, value: unknown) => {
              equalities.push([key, value]);
              return q;
            },
          };
          select(q);
          // The Spec pins no read method, so .first() and .unique() answer alike.
          const one = async () =>
            row &&
            equalities.every(
              ([key, value]) => row![key as keyof Stored] === value,
            )
              ? structuredClone(row)
              : null;
          return { first: one, unique: one };
        },
      };
    },
    insert: async (_table: string, value: NonNullable<typeof initial>) => {
      writes++;
      row = { ...value, _id: "row", _creationTime: 1 };
      return "row";
    },
    replace: async (_id: string, value: NonNullable<typeof initial>) => {
      writes++;
      row = { ...value, _id: "row", _creationTime: 1 };
    },
    delete: async () => {
      writes++;
      row = null;
    },
  };
  return {
    ctx: { db } as unknown as RowWriter,
    row: () => structuredClone(row),
    writes: () => writes,
  };
}
