import { expect, test } from "vitest";
import { withBackend } from "../../harness/backend.js";
import { httpClient } from "../../harness/clients.js";
import { recordMeasurement } from "../../harness/evidence.js";
import { api } from "../../fixture/convex/_generated/api.js";
const name =
  "native observation on precompiled-2026-09-28-5c7cb5b: component auth returns the caller identity";
test(name, async () => {
  await withBackend(async (backend) => {
    const client = httpClient(
      backend.url,
      await backend.identity.token("observation-user"),
    );
    const identity = await client.query(api.inspection.componentIdentity, {});
    await recordMeasurement(name, "component auth identity", identity);
    expect(identity).toMatchObject({
      issuer: backend.identity.issuer,
      subject: "observation-user",
    });
  });
});
