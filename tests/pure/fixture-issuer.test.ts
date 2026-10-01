import { createLocalJWKSet, decodeProtectedHeader, jwtVerify } from "jose";
import { expect, test } from "vitest";
import {
  createFixtureIssuer,
  fixtureApplicationId,
  fixtureIssuerUrl,
  fixtureKeyId,
} from "../../harness/identity.js";
test("pure: a fixture issuer's token verifies against its data-URI ES256 key set, and another issuer's token does not", async () => {
  const issuer = await createFixtureIssuer();
  expect(issuer.jwks).toMatch(/^data:text\/plain;charset=utf-8;base64,/);
  const keys = createLocalJWKSet(
    JSON.parse(
      Buffer.from(issuer.jwks.split(",")[1] ?? "", "base64").toString(),
    ) as Parameters<typeof createLocalJWKSet>[0],
  );
  const token = await issuer.token("user-1");
  const { payload } = await jwtVerify(token, keys, {
    issuer: fixtureIssuerUrl,
    audience: fixtureApplicationId,
  });
  expect(payload.sub).toBe("user-1");
  expect((payload.exp ?? 0) - (payload.iat ?? 0)).toBe(600);
  expect(decodeProtectedHeader(token)).toEqual({
    alg: "ES256",
    kid: fixtureKeyId,
    typ: "JWT",
  });
  const outsider = await createFixtureIssuer();
  await expect(
    jwtVerify(await outsider.token("user-1"), keys),
  ).rejects.toThrow();
});
test("pure: a fixture issuer signs for the issuer URL it was made with", async () => {
  const issuer = await createFixtureIssuer("https://another-issuer.test");
  const token = await issuer.token("user-1");
  expect(
    JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString()),
  ).toMatchObject({ iss: "https://another-issuer.test", aud: "fixture-app" });
});
