import type { AuthConfig } from "convex/server";
function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}
export default {
  providers: [
    {
      type: "customJwt",
      algorithm: "ES256",
      issuer: required("AUTH_ISSUER"),
      applicationID: required("AUTH_APPLICATION_ID"),
      jwks: required("AUTH_JWKS"),
    },
  ],
} satisfies AuthConfig;
