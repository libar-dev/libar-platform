import { defineComponent } from "convex/server";
import migrations from "@convex-dev/migrations/convex.config.js";
const depot = defineComponent("depot");
depot.use(migrations);
export default depot;
