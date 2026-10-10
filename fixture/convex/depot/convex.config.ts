/**
 * @sdpAnchor impl:context.context-component.depot-config
 * @sdpLabel the depot fixture component's definition
 * @sdpReferences spec:context.context-component
 */
import { defineComponent } from "convex/server";
import migrations from "@convex-dev/migrations/convex.config.js";
// The mount name is the context's contextId, the constant in streams.ts. The migrations component is
// mounted inside this fixture context to show what a migration defined in a context can walk and
// write.
const depot = defineComponent("depot");
depot.use(migrations);
export default depot;
