/**
 * @sdpAnchor impl:application.orders-inventory-example.orders-schema
 * @sdpLabel the Orders context schema
 * @sdpReferences spec:application.orders-inventory-example
 * @sdpComponent component:example.orders-context
 * @sdpRole schema
 */
import { defineSchema } from "convex/server";
import { contextTables } from "../../../src/context/index.js";
// A context component's schema holds the context library's tables and nothing else.
export default defineSchema({ ...contextTables });
