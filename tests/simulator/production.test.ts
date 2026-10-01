import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";
import { internal } from "../../example/convex/_generated/api.js";
import { productionTest } from "./production.js";
const { version } = JSON.parse(
  readFileSync(
    join(import.meta.dirname, "../../node_modules/convex-test/package.json"),
    "utf8",
  ),
) as { version: string };
test(`convex-test ${version}: the production composition with its contexts registered runs its grant mutation`, async () => {
  const t = productionTest();
  const grant = {
    tenantId: "tenant-a",
    principalKind: "human" as const,
    principalId: "https://fixture-issuer.test|alice",
    permission: "orders.read",
  };
  await t.mutation(internal.grants.grant, { ...grant, grantedBy: "setup" });
  expect(await t.run((ctx) => ctx.db.query("grants").collect())).toMatchObject([
    grant,
  ]);
  expect(await t.mutation(internal.grants.revoke, grant)).toBe(1);
});
