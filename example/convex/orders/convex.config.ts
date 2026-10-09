/**
 * @sdpAnchor component:example.orders-context
 * @sdpLabel the Orders context component
 * @sdpSatisfies spec:application.orders-inventory-example
 * @sdpUses component:platform.context, component:example.orders-domain
 * @sdpLayer adapter
 * @sdpContext orders
 */
import { defineComponent } from "convex/server";
// The Orders context. Its mount name is its contextId.
export default defineComponent("orders");
