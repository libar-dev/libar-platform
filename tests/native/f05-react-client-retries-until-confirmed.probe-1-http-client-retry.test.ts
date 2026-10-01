import type { ConvexHttpClient } from "convex/browser";
import { expect } from "vitest";
import {
  ref,
  specTest,
  testAnchorId,
} from "@libar-dev/software-delivery-protocol";
import { bindExample } from "@libar-dev/software-delivery-protocol/vitest";
import { api } from "../../fixture/convex/_generated/api.js";
import { probe1HttpClientRetryContract as contract } from "../../generated/contracts/facts.f05-react-client-retries-until-confirmed.probe-1-http-client-retry.contract.js";
import type { Backend } from "../../harness/backend.js";
import { countingFetch, ordinaryClient } from "../../harness/clients.js";
import type { CountingFetch } from "../../harness/clients.js";
import { fixtureBackend, measure, required } from "../../harness/native.js";
import { markerRows } from "./marker-rows.js";
const anchor = specTest({
  id: testAnchorId(
    "test:facts.f05-react-client-retries-until-confirmed.probe-1-http-client-retry",
  ),
  verifies: ref(
    "spec:facts.f05-react-client-retries-until-confirmed.probe-1-http-client-retry",
  ),
});
void anchor;
interface World {
  backend?: Backend;
  transport?: CountingFetch;
  client?: ConvexHttpClient;
  // Requests the client had sent when each of the caller's two calls had failed.
  requestsAfterCall?: number[];
}
const failureOf = (call: Promise<unknown>) =>
  call.then(
    () => undefined,
    (error: unknown) => error,
  );
bindExample(contract, (): World => ({}), {
  "an HTTP client, ConvexHttpClient, whose transport delivers each request to the backend and then fails as a lost response would":
    async (world) => {
      const backend = await fixtureBackend();
      const transport = countingFetch({ loseResponses: true });
      Object.assign(world, {
        backend,
        transport,
        client: ordinaryClient(backend.url, { fetch: transport.fetch }),
      });
    },
  "its caller sends a mutation which inserts one marker row, sees the call fail, and sends the same mutation again":
    async (world) => {
      const client = required(world.client, "the client");
      const transport = required(world.transport, "the transport");
      world.requestsAfterCall = [];
      for (let call = 0; call < 2; call++) {
        const failure = await failureOf(
          client.mutation(api.markers.insert, { trial: "response lost" }),
        );
        expect(String(failure)).toContain("The response was lost");
        world.requestsAfterCall.push(transport.requests());
      }
    },
  "the client sent {requestsPerCall} request for each call": (
    world,
    { requestsPerCall },
  ) => {
    const [afterFirst, afterSecond] = required(
      world.requestsAfterCall,
      "the request counts",
    );
    measure("requestsAfterEachCall", [afterFirst ?? null, afterSecond ?? null]);
    expect(afterFirst).toBe(requestsPerCall);
    expect((afterSecond ?? 0) - (afterFirst ?? 0)).toBe(requestsPerCall);
  },
  "the backend holds {markerRows} marker rows": async (
    world,
    { markerRows: expected },
  ) => {
    const backend = required(world.backend, "the backend");
    const rows = (await markerRows(backend)).get("response lost") ?? 0;
    measure("httpRetrySummary", {
      rows,
      requestsAfterCall: required(
        world.requestsAfterCall,
        "the request counts",
      ),
    });
    expect(rows).toBe(expected);
    // With no fault in the transport, one call sends one request and leaves one row.
    const kept = countingFetch({ loseResponses: false });
    await ordinaryClient(backend.url, { fetch: kept.fetch }).mutation(
      api.markers.insert,
      { trial: "response kept" },
    );
    expect(kept.requests()).toBe(1);
    expect((await markerRows(backend)).get("response kept")).toBe(1);
  },
});
