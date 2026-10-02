// What a parent query over a read model returns, and the bound on a list page of one
// (spec:application.read-models).
import {
  limitListBytes,
  limitListPage,
  type PageLimit,
} from "../context/queries.js";
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
