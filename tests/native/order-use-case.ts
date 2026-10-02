// Shared steps of the scenarios that run PlaceOrder and CancelOrder on the production composition: a backend whose
// user holds every grant the use cases need, the order summary's first activation, stock through
// ReceiveStock, and every stored document of both contexts and the parent, to count what a call
// changed. Admin access is used for setup and for reading stored documents only.
import { getFunctionName } from "convex/server";
import type { ConvexHttpClient } from "convex/browser";
import type { Value } from "convex/values";
import { api, internal } from "../../example/convex/_generated/api.js";
import {
  cancelOrderPermission,
  placeOrderPermission,
} from "../../example/convex/ordering.js";
import { readOrdersPermission } from "../../example/convex/readModels.js";
import { receiveStockPermission } from "../../example/convex/receiving.js";
import type { Backend } from "../../harness/backend.js";
import { ordinaryClient } from "../../harness/clients.js";
import { productionBackend } from "../../harness/native.js";
export const tenantId = "t-1";
const subject = "user-1";
export const permissions = [
  placeOrderPermission,
  cancelOrderPermission,
  receiveStockPermission,
  readOrdersPermission,
  "inventory.read",
];
export interface OrderWorld {
  backend: Backend;
  token: string;
  client: ConvexHttpClient;
}
// Grants a user of the fixture issuer one permission in a tenant, with admin access.
export function grant(
  backend: Backend,
  user: string,
  permission: string,
  tenant = tenantId,
) {
  return backend.admin.run(getFunctionName(internal.grants.grant), {
    tenantId: tenant,
    principalKind: "human",
    principalId: `${backend.issuer.issuer}|${user}`,
    permission,
    grantedBy: "native-test",
  });
}
// The order summary's first activation, run by an operator with admin access.
export function activateOrderSummary(backend: Backend) {
  return backend.admin.run(getFunctionName(internal.readModels.activate), {
    readModel: "orderSummary",
    startedBy: { kind: "operator", id: "native-test" },
  });
}
// A production backend, the user's grants and, unless asked not to, the order summary's first
// activation, all with admin access, and an ordinary client with the user's fixture-issuer token.
export async function orderWorld(
  options: { activate?: boolean } = {},
): Promise<OrderWorld> {
  const backend = await productionBackend();
  for (const permission of permissions)
    await grant(backend, subject, permission);
  if (options.activate ?? true) await activateOrderSummary(backend);
  const token = await backend.issuer.token(subject);
  return { backend, token, client: ordinaryClient(backend.url, { token }) };
}
export function receiveStock(
  { client }: OrderWorld,
  items: { stockItemId: string; quantity: number }[],
) {
  return client.mutation(api.receiving.receiveStock, {
    tenantId,
    input: { items },
  });
}
export const line = (
  stockItemId: string,
  quantity: number,
  unitPrice = 100,
) => ({
  stockItemId,
  quantity,
  unitPrice,
});
// Every table a command can write, by where it lives. The grants table is setup only.
const tables = [
  { table: "receipts" },
  { table: "generations" },
  { table: "orderSummaries" },
  { table: "streams", component: "orders" },
  { table: "events", component: "orders" },
  { table: "streams", component: "inventory" },
  { table: "events", component: "inventory" },
] as const;
export type Stored = Record<string, Record<string, Value>[]>;
export async function stored({ backend }: OrderWorld): Promise<Stored> {
  const snapshot: Stored = {};
  for (const { table, ...where } of tables)
    snapshot["component" in where ? `${where.component}.${table}` : table] =
      await backend.admin.readTable(table, where);
  return snapshot;
}
// The documents added, removed or changed between two snapshots, counted across every table.
export function changedDocuments(before: Stored, after: Stored): number {
  let changed = 0;
  for (const name of new Set([...Object.keys(before), ...Object.keys(after)])) {
    const was = new Map(
      (before[name] ?? []).map((document) => [
        document["_id"],
        JSON.stringify(document),
      ]),
    );
    const is = new Map(
      (after[name] ?? []).map((document) => [
        document["_id"],
        JSON.stringify(document),
      ]),
    );
    for (const [id, document] of is) if (was.get(id) !== document) changed++;
    for (const id of was.keys()) if (!is.has(id)) changed++;
  }
  return changed;
}
export const caught = (promise: Promise<unknown>) =>
  promise.then(
    () => {
      throw new Error("The call did not fail");
    },
    (error: unknown) => error,
  );
