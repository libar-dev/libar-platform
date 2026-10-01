import { expect } from "vitest";
import {
  ref,
  specTest,
  testAnchorId,
} from "@libar-dev/software-delivery-protocol";
import { bindExample } from "@libar-dev/software-delivery-protocol/vitest";
import { api } from "../../fixture/convex/_generated/api.js";
import { recordMeasurement } from "../../harness/evidence.js";
import { backend, client, fixture } from "./world.js";
import type { World } from "./world.js";

import type { HarnessHttpClient } from "../../harness/clients.js";
import { ConvexHttpClient } from "convex/browser";

import { probe1HttpClientRetryContract as contract } from "../../generated/contracts/facts.f05-react-client-retries-until-confirmed.probe-1-http-client-retry.contract.js";
const anchor = specTest({
  id: testAnchorId(
    "test:facts.f05-react-client-retries-until-confirmed.probe-1-http-client-retry",
  ),
  verifies: ref(
    "spec:facts.f05-react-client-retries-until-confirmed.probe-1-http-client-retry",
  ),
});
void anchor;
interface ProbeWorld extends World {
  requests?: number;
  trials?: {
    key: string;
    count: number;
    resolved: boolean;
    existedBeforeReplay?: boolean;
    gapMs: number;
  }[];
}
async function measure(name: string, value: unknown) {
  await recordMeasurement(contract.title, `probe1.${name}`, value);
}
async function count(w: ProbeWorld, key: string) {
  return (await backend(w).readTable("markers")).filter(
    (row) => (row as { trial: string }).trial === key,
  ).length;
}

bindExample(contract, (): ProbeWorld => ({}), {
  "an HTTP client whose caller sends a mutation which inserts one marker row and discards the response":
    async (w) => {
      await fixture(w);
      let requests = 0;
      const ordinary = new ConvexHttpClient(backend(w).url, {
        fetch: async (input, init) => {
          requests++;
          w.requests = requests;
          await measure("http.request", {
            number: requests,
            url: String(input),
          });
          return fetch(input, init);
        },
      });
      w.client = ordinary as HarnessHttpClient;
      await ordinary.mutation(api.probe1.marker, { trial: "single" });
      const single = await count(w, "single");
      await measure("http.singleCall", { requests, rows: single });
      expect(single).toBe(1);
      expect(requests).toBe(1);
      await ordinary.mutation(api.probe1.marker, { trial: "retry" });
      await measure("http.discardedResponseRequests", requests);
    },
  "the caller sends the same mutation again": async (w) => {
    await client(w).mutation(api.probe1.marker, { trial: "retry" });
  },
  "the backend holds {markerRows} marker rows": async (w, { markerRows }) => {
    const rows = await count(w, "retry");
    await measure("http.retriedRows", rows);
    expect(rows).toBe(markerRows);
    expect(w.requests).toBe(markerRows + 1);
    await measure("http.totalRequests", w.requests);
  },
});
