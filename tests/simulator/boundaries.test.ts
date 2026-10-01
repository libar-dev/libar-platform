import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "../../fixture/convex/_generated/api.js";
import annexSchema from "../../fixture/convex/annex/schema.js";
import schema from "../../fixture/convex/schema.js";
function simulator() {
  const t = convexTest(
    schema,
    import.meta.glob("../../fixture/convex/**/*.ts"),
  );
  t.registerComponent(
    "annex",
    annexSchema,
    import.meta.glob("../../fixture/convex/annex/**/*.ts"),
  );
  return t;
}
const data = { code: "staleVersion", expected: 2, current: 3 };
test.each(["nested", "annex"] as const)(
  "convex-test 0.0.60: a parent's catch reads the ConvexError data thrown across the %s boundary",
  async (boundary) => {
    const caught = await simulator().mutation(api.failures.catching, {
      boundary,
      kind: "convexError",
      data,
    });
    expect(caught).toMatchObject({ isConvexError: true, data });
  },
);
test("convex-test 0.0.60: ctx.auth.getUserIdentity() inside a component returns null under withIdentity", async () => {
  const t = simulator().withIdentity({
    issuer: "https://fixture-issuer.test",
    subject: "user-1",
  });
  expect(await t.query(api.identity.caller, {})).toMatchObject({
    issuer: "https://fixture-issuer.test",
    subject: "user-1",
  });
  expect(await t.query(api.identity.callerSeenByAnnex, {})).toBeNull();
});
