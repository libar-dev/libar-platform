/**
 * @sdpAnchor component:example.inventory-context
 * @sdpLabel the Inventory context component
 * @sdpSatisfies spec:application.orders-inventory-example
 * @sdpUses component:platform.context, component:example.inventory-domain
 * @sdpLayer adapter
 * @sdpContext inventory
 */
import { defineComponent } from "convex/server";
// The Inventory context. Its mount name is its contextId.
export default defineComponent("inventory");
