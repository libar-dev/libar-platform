// The Inventory context's queries over its stock item stream: one definer each.
/**
 * @sdpAnchor impl:application.orders-inventory-example.inventory-stock-item-query
 * @sdpLabel the stock item query
 * @sdpReferences spec:application.orders-inventory-example
 * @sdpComponent component:example.inventory-context
 * @sdpRole query
 */
import { defineGet, defineList } from "../../../../src/context/index.js";
import { journal, stockItemStream } from "../streams.js";
export const get = defineGet(journal, stockItemStream);
export const list = defineList(journal, stockItemStream);
