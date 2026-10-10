/**
 * @sdpAnchor impl:application.orders-inventory-example.inventory-schema
 * @sdpLabel the Inventory context schema
 * @sdpReferences spec:application.orders-inventory-example
 * @sdpComponent component:example.inventory-context
 * @sdpRole schema
 */
import { defineSchema } from "convex/server";
import { contextTables } from "../../../src/context/index.js";
// A context component's schema holds the context library's tables and nothing else.
export default defineSchema({ ...contextTables });
