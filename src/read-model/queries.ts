// What a parent query over a read model returns, and the bound on a list page of one
// (spec:application.read-models).
import {
  limitListBytes,
  limitListPage,
  type PageLimit,
} from "../context/queries.js";
import type { PaginationOptions } from "convex/server";
import type { AnyReadModel } from "./projection.js";
// A read-model row as a query returns it: the document ID, its creation time and the generation stay
// in the parent.
export function readModelView<
  Row extends { _id: unknown; _creationTime: number; generation: number },
>(row: Row): Omit<Row, "_id" | "_creationTime" | "generation"> {
  const { _id, _creationTime, generation, ...view } = row;
  void [_id, _creationTime, generation];
  return view;
}
// The options a list over the read model's table passes to boundedPage, from its row budget.
export const limitReadModelList = (readModel: AnyReadModel): PageLimit => ({
  items: limitListPage(readModel.rowBudgetBytes),
  bytes: limitListBytes,
});
// A client's page options with each cursor moved into the generation now active. A cursor of
// paginator is the JSON of a row's index key, whose second element is the generation that wrote the
// row and whose last two are that document's _creationTime and _id; the moved cursor names the same
// position by the order field and key alone.
export function pageInGeneration(
  opts: PaginationOptions,
  generation: number,
): PaginationOptions {
  const moved = { ...opts, cursor: moveCursor(opts.cursor, generation) };
  if (opts.endCursor !== undefined && opts.endCursor !== null)
    moved.endCursor = moveCursor(opts.endCursor, generation);
  return moved;
}
function moveCursor(cursor: string | null, generation: number) {
  if (cursor === null) return cursor;
  let key: unknown;
  try {
    key = JSON.parse(cursor);
  } catch {
    return cursor;
  }
  if (!Array.isArray(key) || key.length < 4 || typeof key[1] !== "number")
    return cursor;
  return JSON.stringify([key[0], generation, ...key.slice(2, -2)]);
}
