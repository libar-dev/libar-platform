import { defineApp } from "convex/server";
import annex from "./annex/convex.config.js";
const app = defineApp();
app.use(annex);
export default app;
