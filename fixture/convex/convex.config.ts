import { defineApp } from "convex/server";
import annex from "./annex/convex.config.js";
import depot from "./depot/convex.config.js";
const app = defineApp();
app.use(annex);
// The fixture context. Its mount name is its contextId.
app.use(depot, { name: "depot" });
export default app;
