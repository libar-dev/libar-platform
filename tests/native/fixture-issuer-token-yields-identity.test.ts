import { expect } from "vitest";
import {
  ref,
  specTest,
  testAnchorId,
} from "@libar-dev/software-delivery-protocol";
import { bindExample } from "@libar-dev/software-delivery-protocol/vitest";
import { api } from "../../fixture/convex/_generated/api.js";
import { httpClient } from "../../harness/clients.js";
import { backend, client, fixture } from "./world.js";
import type { World } from "./world.js";
import { createIdentity } from "../../harness/identity.js";
import { fixtureIssuerTokenYieldsIdentityContract } from "../../generated/contracts/platform.native-harness.fixture-issuer-token-yields-identity.contract.js";
const anchor = specTest({
  id: testAnchorId("test:platform.fixture-issuer-token-yields-identity"),
  verifies: ref(
    "spec:platform.native-harness.fixture-issuer-token-yields-identity",
  ),
});
void anchor;
bindExample(fixtureIssuerTokenYieldsIdentityContract, (): World => ({}), {
  "a disposable backend whose environment variables name the fixture issuer {issuer} and its data-URI key set":
    (world, { issuer }) => fixture(world, issuer),
  "an ordinary client carrying a token the harness signed for subject {subject}":
    async (world, { subject }) => {
      world.subject = subject;
      world.client = httpClient(
        backend(world).url,
        await backend(world).identity.token(subject),
      );
    },
  "the client calls a public query that returns the caller's identity": async (
    world,
  ) => {
    world.identity = await client(world).query(api.inspection.identity, {});
  },
  "the identity names issuer {identityIssuer} and subject {identitySubject}":
    async (world, { identityIssuer, identitySubject }) => {
      expect(world.identity?.issuer).toBe(identityIssuer);
      expect(world.identity?.subject).toBe(identitySubject);
      expect(world.identity?.tokenIdentifier).toBe(
        `${identityIssuer}|${identitySubject}`,
      );
      const outsider = await createIdentity(backend(world).identity.issuer);
      const invalid = httpClient(
        backend(world).url,
        await outsider.token(world.subject!),
      );
      await expect(
        invalid.query(api.inspection.identity, {}),
      ).rejects.toThrow();
    },
  "the same query from a client with no token returns an identity {anonymousHasIdentity}":
    async (world, { anonymousHasIdentity }) => {
      const identity = await httpClient(backend(world).url).query(
        api.inspection.identity,
        {},
      );
      expect(identity !== null).toBe(anonymousHasIdentity);
    },
});
