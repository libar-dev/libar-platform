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
// row; a key of the index's fields plus two also carries that document's _creationTime and _id, which
// are dropped. A cursor already moved keeps its length, so moving it again replaces the generation alone.
export function pageInGeneration(
  opts: PaginationOptions,
  generation: number,
  indexFields: number,
): PaginationOptions {
  const moved = {
    ...opts,
    cursor: moveCursor(opts.cursor, generation, indexFields),
  };
  if (opts.endCursor !== undefined && opts.endCursor !== null)
    moved.endCursor = moveCursor(opts.endCursor, generation, indexFields);
  return moved;
}
function moveCursor(
  cursor: string | null,
  generation: number,
  indexFields: number,
) {
  if (cursor === null) return cursor;
  let key: unknown;
  try {
    key = JSON.parse(cursor);
  } catch {
    return cursor;
  }
  if (
    !Array.isArray(key) ||
    (key.length !== indexFields && key.length !== indexFields + 2) ||
    typeof key[1] !== "number"
  )
    return cursor;
  return JSON.stringify([key[0], generation, ...key.slice(2, indexFields)]);
}
