import { defineApp } from "convex/server";
import probe from "./probe/convex.config.js";
const app = defineApp();
app.use(probe);
export default app;
