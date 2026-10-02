import {
  ref,
  specTest,
  testAnchorId,
} from "@libar-dev/software-delivery-protocol";
import { bindExample } from "@libar-dev/software-delivery-protocol/vitest";
import type { TransactionMetrics } from "convex/server";
import { expect } from "vitest";
import { probe10StreamBudgetContract as contract } from "../../generated/contracts/facts.f20-pagination-checks-bytes-after-reading.probe-10-stream-budget.contract.js";
import type { Backend } from "../../harness/backend.js";
import { fixtureBackend, measure, required } from "../../harness/native.js";
import { paceAfterWrite } from "../../harness/wait.js";
const anchor = specTest({
  id: testAnchorId(
    "test:facts.f20-pagination-checks-bytes-after-reading.probe-10-stream-budget",
  ),
  verifies: ref(
    "spec:facts.f20-pagination-checks-bytes-after-reading.probe-10-stream-budget",
  ),
});
void anchor;
interface World {
  backend?: Backend;
  budgetBytes?: number;
  result?: {
    count: number;
    status: string;
    options: { maximumBytesRead: number };
    before: TransactionMetrics;
    after: TransactionMetrics;
  };
}
bindExample(contract, (): World => ({}), {
  "{count} component rows whose application fields each occupy {budgetBytes} bytes":
    async (world, { count, budgetBytes }) => {
      world.backend = await fixtureBackend();
      world.budgetBytes = budgetBytes;
      for (let first = 0; first < count; first += 4) {
        const size = Math.min(4, count - first);
        await world.backend.admin.run(
          "bytePage:seed",
          { first, count: size, budgetBytes },
          { component: "annex" },
        );
        await paceAfterWrite(size * (budgetBytes + 256));
      }
    },
  "the component paginator reads to the end cursor using the context library's page options":
    async (world) => {
      const result = await required(world.backend, "backend").admin.run(
        "bytePage:bounded",
        { budgetBytes: required(world.budgetBytes, "budget") },
        { component: "annex" },
      );
      world.result = result as unknown as NonNullable<World["result"]>;
      measure("boundedPage", result as Parameters<typeof measure>[1]);
    },
  "the page keeps {kept} rows and marks {status}": (
    world,
    { kept, status },
  ) => {
    expect(world.result).toMatchObject({ count: kept, status });
  },
  "the bytes the page read are above the library's byte bound {exceeds}": (
    world,
    { exceeds },
  ) => {
    const result = required(world.result, "result");
    expect(
      result.after.bytesRead.used - result.before.bytesRead.used >
        result.options.maximumBytesRead,
    ).toBe(exceeds);
  },
});
