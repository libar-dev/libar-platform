// The production composition on convex-test, with its two contexts registered under the names the
// native backend mounts them by.
import { convexTest } from "convex-test";
import inventorySchema from "../../example/convex/inventory/schema.js";
import ordersSchema from "../../example/convex/orders/schema.js";
import schema from "../../example/convex/schema.js";
export function productionTest() {
  const t = convexTest(
    schema,
    import.meta.glob("../../example/convex/**/*.ts"),
  );
  t.registerComponent(
    "orders",
    ordersSchema,
    import.meta.glob("../../example/convex/orders/**/*.ts"),
  );
  t.registerComponent(
    "inventory",
    inventorySchema,
    import.meta.glob("../../example/convex/inventory/**/*.ts"),
  );
  return t;
}
