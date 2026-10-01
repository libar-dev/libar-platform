// The verification bullets the two cases of Sc L1-7 share: the refused call stored nothing, the other
// route to the same namespace is refused too, and both targets exist and run on this deployment.
import { expect } from "vitest";
import { required } from "../../harness/native.js";
import {
  expectRefusedBeforeHandler,
  readDocuments,
  receiptsOf,
  sendClaiming,
  sendWorkingRoute,
  stored,
  type TenancyWorld,
  type Via,
} from "./tenancy-steps.js";
const routes: readonly Via[] = [
  "passing a namespace argument to the public entry",
  "calling the internal entry directly",
];
export async function verifyBothRoutesClosed(world: TenancyWorld) {
  const backend = required(world.backend, "the backend");
  const tenantId = required(world.tenantId, "the tenant");
  const { claimed, via } = required(world.claim, "the claim");
  const { requestKey, localId } = required(world.sent, "the sent call");
  const nothingStored = { receipts: [], streams: [], events: [] };
  expect(await stored(backend)).toEqual(nothingStored);
  // The other route to the same namespace, from the same client.
  const otherRoute = required(
    routes.find((route) => route !== via),
    "the other route",
  );
  const refused = await sendClaiming(
    world,
    { claimed, via: otherRoute },
    requestKey,
    localId,
  );
  expectRefusedBeforeHandler(refused.answer, refused.completion, otherRoute);
  expect(await stored(backend)).toEqual(nothingStored);
  // Each route's target runs on this deployment for a caller allowed to use it: the same call on the
  // bound route, another document on the other route. The one document its handler reads is the
  // caller's grant; the receipt lookup and the fixture's switches find nothing.
  const targets = [
    { route: via, localId },
    { route: otherRoute, localId: `${localId}-control` },
  ];
  for (const target of targets) {
    const { response, completion } = await sendWorkingRoute(
      world,
      claimed,
      target.route,
      requestKey,
      target.localId,
    );
    expect(response).toMatchObject({ kind: "applied", replayed: false });
    expect(readDocuments(completion)).toBe(1);
  }
  const namespaces = (await receiptsOf(world, tenantId, requestKey))
    .map((receipt) => receipt.namespace)
    .sort();
  expect(namespaces).toEqual([claimed, "public"].sort());
}
