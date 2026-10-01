import { expect, test } from "vitest";
import { createLocalJWKSet, decodeProtectedHeader, jwtVerify } from "jose";
import {
  createIdentity,
  fixtureIssuer,
  applicationID,
} from "../../harness/identity.js";
test("pure: fixture token verifies against its data-URI ES256 key set", async () => {
  const identity = await createIdentity();
  expect(identity.jwks).toMatch(/^data:text\/plain;charset=utf-8;base64,/);
  const keys = JSON.parse(
    Buffer.from(identity.jwks.split(",")[1]!, "base64").toString(),
  ) as Parameters<typeof createLocalJWKSet>[0];
  const token = await identity.token("pure-user");
  const { payload } = await jwtVerify(token, createLocalJWKSet(keys), {
    issuer: fixtureIssuer,
    audience: applicationID,
  });
  expect(payload.sub).toBe("pure-user");
  expect(payload.iat).toBeTypeOf("number");
  expect(payload.exp! - payload.iat!).toBe(600);
  expect(decodeProtectedHeader(token)).toEqual({
    alg: "ES256",
    kid: "fixture-key-1",
    typ: "JWT",
  });
  const outsider = await createIdentity();
  await expect(
    jwtVerify(await outsider.token("pure-user"), createLocalJWKSet(keys)),
  ).rejects.toThrow();
});
