import {
  ref,
  specTest,
  testAnchorId,
} from "@libar-dev/software-delivery-protocol";
import { bindExample } from "@libar-dev/software-delivery-protocol/vitest";
import type { PaginationResult } from "convex/server";
import { expect, onTestFinished } from "vitest";
import { listPagesByCursorContract as contract } from "../../generated/contracts/application.read-models.list-pages-by-cursor.contract.js";
import { api } from "../../example/convex/_generated/api.js";
import { placeOrderPermission } from "../../example/convex/ordering.js";
import { receiveStockPermission } from "../../example/convex/receiving.js";
import {
  ordinarySocketClient,
  watchQuery,
  type QueryWatch,
} from "../../harness/clients.js";
import { measure, required } from "../../harness/native.js";
import {
  grant,
  line,
  orderWorld,
  tenantId,
  type OrderWorld,
} from "./order-use-case.js";
const anchor = specTest({
  id: testAnchorId("test:application.read-models.list-pages-by-cursor"),
  verifies: ref("spec:application.read-models.list-pages-by-cursor"),
});
void anchor;
// The parent list listOrders over the Orders context's list, read by an ordinary client granted
// orders.read: each page read once with cursor and numItems, then subscribed with its end cursor,
// the next page starting where the previous one ended, until a read answers isDone. Then two orders
// whose IDs sort inside the first page are placed, and the pinned first page grows in its range.
type Page = PaginationResult<{
  orderId: string;
  version: { tenantId: string };
}>;
type Opts = { cursor: string | null; numItems: number; endCursor?: string };
interface World {
  order?: OrderWorld;
  ids?: string[];
  pages?: Page[];
  firstRange?: string[];
}
const otherTenant = "t-2";
// Order IDs that sort inside the first page: after order-00 and after order-05.
const inserted = ["order-00a", "order-05a"];
const numItems = 10;
const pad = (n: number) => String(n).padStart(2, "0");
const idsOf = (page: Page) => page.page.map((order) => order.orderId);
bindExample(contract, (): World => ({}), {
  // Placed out of order, so the list's order is the order ID's and not the placing's. The other
  // tenant holds an order ID the first tenant also holds.
  "{orders} orders placed in one tenant and {others} in another": async (
    world,
    { orders, others },
  ) => {
    const order = await orderWorld();
    world.order = order;
    for (const permission of [placeOrderPermission, receiveStockPermission])
      await grant(order.backend, "user-1", permission, otherTenant);
    for (const tenant of [tenantId, otherTenant])
      await order.client.mutation(api.receiving.receiveStock, {
        tenantId: tenant,
        input: { items: [{ stockItemId: "sku-1", quantity: orders + others }] },
      });
    const ids = Array.from({ length: orders }, (_, i) => `order-${pad(i)}`);
    world.ids = ids;
    for (const orderId of [...ids].reverse())
      await order.client.mutation(api.ordering.placeOrder, {
        tenantId,
        input: { orderId, lines: [line("sku-1", 1)] },
      });
    const otherIds = Array.from({ length: others }, (_, i) =>
      i === 0 ? "order-00" : `order-${pad(orders + 4 + i)}`,
    );
    for (const orderId of otherIds)
      await order.client.mutation(api.ordering.placeOrder, {
        tenantId: otherTenant,
        input: { orderId, lines: [line("sku-1", 1)] },
      });
  },
  "{action}": async (world, { action }) => {
    if (
      action !==
      "a client pins the tenant's order list in pages by cursor, and then orders are placed inside its first page"
    )
      throw new Error(`This test binds a pinned read of the order list`);
    const { backend, client, token } = required(world.order, "the backend");
    const args = (paginationOpts: Opts) => ({ tenantId, paginationOpts });
    const socket = ordinarySocketClient(backend.url, { token });
    onTestFinished(() => socket.close());
    const watches: QueryWatch<Page>[] = [];
    let cursor: string | null = null;
    for (let i = 0; i < 10; i++) {
      const first: Page = await client.query(
        api.orderQueries.listOrders,
        args({ cursor, numItems }),
      );
      const opts: Opts = first.isDone
        ? { cursor, numItems }
        : { cursor, numItems, endCursor: first.continueCursor };
      const pinned = watchQuery(
        socket,
        api.orderQueries.listOrders,
        args(opts),
      );
      await pinned.until(
        (page) => idsOf(page as Page).join() === idsOf(first).join(),
        `page ${i} pinned`,
      );
      watches.push(pinned as QueryWatch<Page>);
      if (first.isDone) break;
      cursor = first.continueCursor;
    }
    const firstWatch = required(watches[0], "the first page");
    world.firstRange = idsOf(required(firstWatch.values.at(-1), "page 0"));
    for (const orderId of inserted)
      await client.mutation(api.ordering.placeOrder, {
        tenantId,
        input: { orderId, lines: [line("sku-1", 1)] },
      });
    world.ids = [...required(world.ids, "the order IDs"), ...inserted].sort();
    await firstWatch.until(
      (page) => inserted.every((orderId) => idsOf(page).includes(orderId)),
      "the first page shows the orders placed inside it",
    );
    const pages = watches.map((watch, i) =>
      required(watch.values.at(-1), `page ${i}`),
    );
    world.pages = pages;
    measure("orderPages", {
      sizes: pages.map((page) => page.page.length),
      pageStatus: pages.map((page) => page.pageStatus ?? null),
    });
  },
  // The pages after the first hold 10 and 5, or a fourth empty one when a full page does not know it
  // is last; together with the first they hold every order once, in order.
  "pages of {pageSize} together hold {ordersHeld} orders, each once and in order of order ID, and none of the other tenant's":
    (world, { pageSize, ordersHeld }) => {
      expect(pageSize).toBe(numItems);
      const pages = required(world.pages, "the pages");
      const ids = required(world.ids, "the order IDs");
      expect(
        pages
          .slice(1)
          .map((page) => page.page.length)
          .filter((n) => n > 0),
      ).toEqual([pageSize, ordersHeld - inserted.length - 2 * pageSize]);
      expect(pages.flatMap(idsOf)).toEqual(ids);
      expect(ids).toHaveLength(ordersHeld);
      expect(
        pages.flatMap((page) =>
          page.page.map((order) => order.version.tenantId),
        ),
      ).toEqual(ids.map(() => tenantId));
    },
  // The first page still starts and ends at the orders it held when pinned, and the second page
  // starts at the order after its end.
  "the pinned first page keeps its range and holds {firstPageHeld} orders": (
    world,
    { firstPageHeld },
  ) => {
    const [first, second] = required(world.pages, "the pages");
    const range = required(world.firstRange, "the first page's range");
    const held = idsOf(required(first, "the first page"));
    expect(held).toHaveLength(firstPageHeld);
    expect([held[0], held.at(-1)]).toEqual([range[0], range.at(-1)]);
    const ids = required(world.ids, "the order IDs");
    expect(idsOf(required(second, "the second page"))[0]).toBe(
      ids[ids.indexOf(required(range.at(-1), "the range's end")) + 1],
    );
  },
  "the number of pages that carry pageStatus SplitRequired is {splitPages}": (
    world,
    { splitPages },
  ) => {
    const pages = required(world.pages, "the pages");
    expect(
      pages.filter((page) => page.pageStatus === "SplitRequired"),
    ).toHaveLength(splitPages);
  },
});
