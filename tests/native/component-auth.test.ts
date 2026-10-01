import { test } from "vitest";
import { api } from "../../fixture/convex/_generated/api.js";
import { ordinaryClient } from "../../harness/clients.js";
import { fixtureBackend, measure } from "../../harness/native.js";
// Convex's documentation says ctx.auth is not available inside a component. The pinned backend
// answered with the caller's identity on 2026-10-01. Neither answer is a rule of the design, so
// this test records the answer and asserts only that the call completes.
test("native: a component query that calls ctx.auth.getUserIdentity() completes, and its answer is recorded", async () => {
  const backend = await fixtureBackend();
  const client = ordinaryClient(backend.url, {
    token: await backend.issuer.token("user-1"),
  });
  const answer: unknown = await client.query(
    api.identity.callerSeenByAnnex,
    {},
  );
  const identity = answer as { issuer?: string; subject?: string } | null;
  measure("identitySeenInsideComponent", {
    answered: identity === null ? "null" : "an identity",
    issuer: identity?.issuer ?? null,
    subject: identity?.subject ?? null,
  });
});
