// The Orders context's queries over its order stream: one definer each.
/**
 * @sdpAnchor impl:application.orders-inventory-example.orders-order-query
 * @sdpLabel the order query
 * @sdpSatisfies spec:application.orders-inventory-example
 * @sdpComponent component:example.orders-context
 * @sdpRole query
 */
import { defineGet, defineList } from "../../../../src/context/index.js";
import { journal, orderStream } from "../streams.js";
export const get = defineGet(journal, orderStream);
export const list = defineList(journal, orderStream);
