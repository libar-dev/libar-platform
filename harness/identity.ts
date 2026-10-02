import {
  codeAnchor,
  codeAnchorId,
  ref,
} from "@libar-dev/software-delivery-protocol";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
const anchor = codeAnchor({
  id: codeAnchorId("impl:platform.native-harness.identity"),
  label: "the fixture issuer",
  satisfies: ref("spec:platform.native-harness"),
});
void anchor;
export const fixtureIssuerUrl = "https://fixture-issuer.test";
export const fixtureApplicationId = "fixture-app";
export const fixtureKeyId = "fixture-key-1";
export interface FixtureIssuer {
  readonly issuer: string;
  readonly applicationID: string;
  readonly jwks: string;
  token(subject: string): Promise<string>;
}
export async function createFixtureIssuer(
  issuer: string = fixtureIssuerUrl,
): Promise<FixtureIssuer> {
  const { publicKey, privateKey } = await generateKeyPair("ES256", {
    extractable: true,
  });
  const jwk = {
    ...(await exportJWK(publicKey)),
    kid: fixtureKeyId,
    alg: "ES256",
    use: "sig",
  };
  return {
    issuer,
    applicationID: fixtureApplicationId,
    jwks:
      "data:text/plain;charset=utf-8;base64," +
      Buffer.from(JSON.stringify({ keys: [jwk] })).toString("base64"),
    token: (subject) =>
      new SignJWT({})
        .setProtectedHeader({ kid: fixtureKeyId, alg: "ES256", typ: "JWT" })
        .setIssuer(issuer)
        .setAudience(fixtureApplicationId)
        .setSubject(subject)
        .setIssuedAt()
        .setExpirationTime("10m")
        .sign(privateKey),
  };
}
