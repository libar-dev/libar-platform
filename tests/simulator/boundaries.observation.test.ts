import { expect, test } from "vitest";
import { convexTest } from "convex-test";
import schema from "../../fixture/convex/schema.js";
import probeSchema from "../../fixture/convex/probe/schema.js";
import { api } from "../../fixture/convex/_generated/api.js";
function simulator() {
  const t = convexTest(
    schema,
    import.meta.glob("../../fixture/convex/**/*.ts"),
  );
  t.registerComponent(
    "probe",
    probeSchema,
    import.meta.glob("../../fixture/convex/probe/**/*.ts"),
  );
  return t;
}
test.each(["nested", "component"] as const)(
  "convex-test observation: parent's catch sees structured ConvexError across %s mutation boundary",
  async (boundary) => {
    const t = simulator();
    const result = await t.mutation(api.inspection.catchFailure, { boundary });
    expect(result).toMatchObject({
      isConvexError: true,
      data: { code: "fixtureFailure", details: { expected: 2, current: 3 } },
    });
  },
);
test("convex-test observation: component auth under withIdentity returns null, unlike the native spike", async () => {
  const t = simulator().withIdentity({
    issuer: "https://fixture-issuer.test",
    subject: "sim-user",
  });
  expect(await t.query(api.inspection.identity, {})).toMatchObject({
    issuer: "https://fixture-issuer.test",
    subject: "sim-user",
  });
  expect(await t.query(api.inspection.componentIdentity, {})).toBeNull();
});
