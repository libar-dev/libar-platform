import { defineApp } from "convex/server";
import annex from "./annex/convex.config.js";
import depot from "./depot/convex.config.js";
import yard from "./yard/convex.config.js";
import migrations from "@convex-dev/migrations/convex.config.js";
const app = defineApp();
app.use(migrations);
app.use(annex);
app.use(annex, { name: "annexClock" });
// The fixture contexts. Each mount name is its contextId. The yard is there so a use case can call
// two contexts.
app.use(depot, { name: "depot" });
app.use(yard, { name: "yard" });
export default app;
