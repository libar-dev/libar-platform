import type { ConvexHttpClient } from "convex/browser";
import type { UserIdentity } from "convex/server";
import { expect } from "vitest";
import {
  ref,
  specTest,
  testAnchorId,
} from "@libar-dev/software-delivery-protocol";
import { bindExample } from "@libar-dev/software-delivery-protocol/vitest";
import { api } from "../../fixture/convex/_generated/api.js";
import { fixtureIssuerTokenYieldsIdentityContract as contract } from "../../generated/contracts/platform.native-harness.fixture-issuer-token-yields-identity.contract.js";
import type { Backend } from "../../harness/backend.js";
import { ordinaryClient } from "../../harness/clients.js";
import { createFixtureIssuer } from "../../harness/identity.js";
import { fixtureBackend, required } from "../../harness/native.js";
const anchor = specTest({
  id: testAnchorId(
    "test:platform.native-harness.fixture-issuer-token-yields-identity",
  ),
  verifies: ref(
    "spec:platform.native-harness.fixture-issuer-token-yields-identity",
  ),
});
void anchor;
interface World {
  backend?: Backend;
  subject?: string;
  client?: ConvexHttpClient;
  identity?: UserIdentity | null;
}
bindExample(contract, (): World => ({}), {
  "a disposable backend whose environment variables name the fixture issuer {issuer} and its data-URI key set":
    async (world, { issuer }) => {
      world.backend = await fixtureBackend({ issuer });
      const environment = await world.backend.admin.environment();
      expect(environment.AUTH_ISSUER).toBe(issuer);
      expect(environment.AUTH_JWKS).toMatch(/^data:/);
    },
  "an ordinary client carrying a token the harness signed for subject {subject}":
    async (world, { subject }) => {
      const backend = required(world.backend, "the backend");
      world.subject = subject;
      world.client = ordinaryClient(backend.url, {
        token: await backend.issuer.token(subject),
      });
    },
  "the client calls a public query that returns the caller's identity": async (
    world,
  ) => {
    world.identity = (await required(world.client, "the client").query(
      api.identity.caller,
      {},
    )) as UserIdentity | null;
  },
  "the identity names issuer {identityIssuer} and subject {identitySubject}": (
    world,
    { identityIssuer, identitySubject },
  ) => {
    expect(world.identity).toMatchObject({
      issuer: identityIssuer,
      subject: identitySubject,
      tokenIdentifier: `${identityIssuer}|${identitySubject}`,
    });
  },
  "the same query from a client with no token returns no identity": async (
    world,
  ) => {
    const backend = required(world.backend, "the backend");
    expect(
      await ordinaryClient(backend.url).query(api.identity.caller, {}),
    ).toBeNull();
    // A key outside the key set: the same issuer URL, another key pair.
    const outsider = await createFixtureIssuer(backend.issuer.issuer);
    const outside = ordinaryClient(backend.url, {
      token: await outsider.token(required(world.subject, "the subject")),
    });
    await expect(outside.query(api.identity.caller, {})).rejects.toThrow(
      "InvalidAuthHeader",
    );
  },
});
