import { defineSchema } from "convex/server";
import { contextTables } from "../../../src/context/index.js";
// A context component's schema holds the context library's tables and nothing else.
export default defineSchema({ ...contextTables });
