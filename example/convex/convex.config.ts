/**
 * @sdpAnchor component:example.parent
 * @sdpLabel the production composition's parent deployment over Orders and Inventory
 * @sdpReferences spec:application.orders-inventory-example
 * @sdpUses component:platform.command, component:platform.context, component:platform.read-model, component:platform.gate, component:platform.audit, component:example.orders-context, component:example.inventory-context, component:example.orders-domain, component:example.inventory-domain
 * @sdpLayer application
 * @sdpContext orders-inventory
 */
import { defineApp } from "convex/server";
import inventory from "./inventory/convex.config.js";
import orders from "./orders/convex.config.js";
const app = defineApp();
// The two contexts. A context's mount name is its contextId.
app.use(orders, { name: "orders" });
app.use(inventory, { name: "inventory" });
export default app;
