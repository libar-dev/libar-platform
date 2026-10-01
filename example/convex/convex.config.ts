import { defineApp } from "convex/server";
import inventory from "./inventory/convex.config.js";
import orders from "./orders/convex.config.js";
const app = defineApp();
// The two contexts. A context's mount name is its contextId.
app.use(orders, { name: "orders" });
app.use(inventory, { name: "inventory" });
export default app;
