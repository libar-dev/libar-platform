import { exportJWK, generateKeyPair, SignJWT } from "jose";
export const fixtureIssuer = "https://fixture-issuer.test";
export const applicationID = "fixture-app";
export async function createIdentity(issuer = fixtureIssuer) {
  const { publicKey, privateKey } = await generateKeyPair("ES256", {
    extractable: true,
  });
  const kid = "fixture-key-1";
  const jwk = {
    ...(await exportJWK(publicKey)),
    kid,
    alg: "ES256",
    use: "sig",
  };
  const jwks =
    "data:text/plain;charset=utf-8;base64," +
    Buffer.from(JSON.stringify({ keys: [jwk] })).toString("base64");
  return {
    issuer,
    applicationID,
    jwks,
    async token(subject: string) {
      return new SignJWT({})
        .setProtectedHeader({ kid, alg: "ES256", typ: "JWT" })
        .setIssuer(issuer)
        .setAudience(applicationID)
        .setSubject(subject)
        .setIssuedAt()
        .setExpirationTime("10m")
        .sign(privateKey);
    },
  };
}
export type FixtureIdentity = Awaited<ReturnType<typeof createIdentity>>;
