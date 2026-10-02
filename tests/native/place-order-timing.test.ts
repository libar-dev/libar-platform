import {
  ref,
  specTest,
  testAnchorId,
} from "@libar-dev/software-delivery-protocol";
import { expect, test } from "vitest";
import { performance } from "node:perf_hooks";
import { api } from "../../example/convex/_generated/api.js";
import { measure, required } from "../../harness/native.js";
import { usageOf } from "./first-experiment-steps.js";
import { stored } from "./place-order-attribution.js";
import {
  collect,
  expectUsage,
  finals,
  healthyUsage,
  json,
  order,
  pins,
  recordMeasurement,
  schedules,
  seed,
  send,
  setup,
  writeCap,
  type Answer,
} from "./place-order-measurement.js";
import { prepareCost, sampleCost, type CostWorld } from "./read-cost.js";
const anchor = specTest({
  id: testAnchorId("test:application.first-experiment.timing"),
  verifies: ref("spec:application.first-experiment"),
});
void anchor;
const timing = test.skipIf(process.env.PLACE_ORDER_TIMINGS !== "1");
const reading =
  process.env.PLACE_ORDER_TIMING_LOAD === "quiet"
    ? "quiet machine"
    : "taken under load";
const quantile = (values: number[], fraction: number) =>
  required(
    [...values].sort((a, b) => a - b)[Math.ceil(values.length * fraction) - 1],
    "percentile sample",
  );

timing.each([1, 10, 100] as const)(
  "native timing: PlaceOrder latency at %i lines",
  async (lines) => {
    const world = await setup();
    const backend = required(world.backend, "backend");
    const answers: Answer[] = [];
    const records = [];
    const discarded = [];
    const before = await stored(backend);
    for (let sample = 0; sample < 35; sample++) {
      const args = order(lines, sample);
      await seed(world, args);
      const mark = await backend.admin.logMark();
      const answer = await send(world, args);
      const completions = await collect(backend, mark, () => 1);
      if (sample < 5) discarded.push(...completions);
      else {
        answers.push(answer);
        records.push(...completions);
      }
      expect(answer).toMatchObject({ kind: "applied", replayed: false });
      expect(completions).toHaveLength(1);
      expectUsage(required(completions[0], "completion"), healthyUsage[lines]);
    }
    const ms = finals(records).map((record) => record.executionTime * 1000);
    const sorted = [...ms].sort((a, b) => a - b);
    const medianMs =
      (required(sorted[14], "lower middle") +
        required(sorted[15], "upper middle")) /
      2;
    const p95Ms = quantile(ms, 0.95);
    const medianTargetMs = lines === 100 ? 400 : 100;
    const p95TargetMs = lines === 100 ? 800 : 200;
    const comparison = {
      acceptedCommands: answers.length,
      discardedCommands: 5,
      medianMs,
      p95Ms,
      medianTargetMs,
      p95TargetMs,
      median: medianMs <= medianTargetMs ? "held" : "not held",
      p95: p95Ms <= p95TargetMs ? "held" : "not held",
      percentileMethod: "median averages middle pair; p95 uses nearest rank",
      executionTimesMs: ms,
    };
    const value = recordMeasurement(world, {
      dataset:
        "Five discarded then thirty measured applied commands; every order has fresh distinct stock received once with quantity two; four grants and one active generation; seven-character IDs; retained-row interval includes stock setup and discarded commands.",
      lines,
      contention: 0,
      path: "latency",
      answers,
      records,
      before,
      after: await stored(backend),
      extra: {
        timingReading: reading,
        latencyDistribution: comparison,
        discardedCompletionRecords: json(discarded),
      },
    });
    expect(value.engineReruns).toBe(0);
    expect(answers).toHaveLength(30);
    console.log(
      JSON.stringify({ lines, timingReading: reading, ...comparison }),
    );
  },
);

timing(
  "native timing: eight callers place unrelated ten-line orders for ten seconds",
  async () => {
    const world = await setup();
    const backend = required(world.backend, "backend");
    const stock = Array.from({ length: 8 }, (_, caller) => order(10, caller));
    for (const args of stock) await seed(world, args, 100000);
    const before = await stored(backend);
    const mark = await backend.admin.logMark();
    const answers: Answer[] = [];
    let done = false;
    // The harness advances its cursor after every poll and refuses a batch of 1000 entries.
    // Start polling before any caller sends, so retention never relies on the cell's final read.
    const collecting = collect(
      backend,
      mark,
      () => answers.length,
      () => done,
      90000,
    ).then(
      (records) => ({ records }),
      (error: unknown) => ({ error }),
    );
    const started = performance.now();
    await Promise.all(
      stock.map(async (template, caller) => {
        let sequence = 0;
        do {
          const orderId = `o${String(caller * 100000 + sequence++).padStart(6, "0")}`;
          answers.push(
            await send(world, {
              ...template,
              requestKey: `k-${orderId}`,
              input: { ...template.input, orderId },
            }),
          );
        } while (performance.now() - started < 10000);
      }),
    );
    const elapsedSeconds = (performance.now() - started) / 1000;
    done = true;
    // Wake a poll that consumed the last completion before the last HTTP response arrived.
    await required(world.client, "client").query(
      api.readModels.listOrderSummaries,
      {
        tenantId: "t-1",
        status: "placed",
        paginationOpts: { cursor: null, numItems: 1 },
      },
    );
    const collected = await collecting;
    if ("error" in collected) throw collected.error;
    const applied = answers.filter(
      (answer) => answer.kind === "applied" && !answer.replayed,
    ).length;
    const ordersPerSecond = applied / elapsedSeconds;
    const throughput = {
      callers: 8,
      lines: 10,
      elapsedSeconds,
      completedOrders: applied,
      ordersPerSecond,
      targetOrdersPerSecond: 20,
      target: ordersPerSecond >= 20 ? "held" : "not held",
      writeCapBytesPerSecond: writeCap,
    };
    const value = recordMeasurement(world, {
      dataset:
        "Eight callers, ten stock items per caller, no item touched by another caller; four grants in one tenant; quantity 100000 received once per stock item; each next order has a fresh fixed-length ID; closed-loop callers; no caller retries a rejected command.",
      lines: 10,
      contention: 8,
      path: "throughput",
      answers,
      records: collected.records,
      before,
      after: await stored(backend),
      extra: {
        timingReading: reading,
        throughput,
        scheduledFunctions: await schedules(backend),
      },
    });
    expect(elapsedSeconds).toBeGreaterThanOrEqual(10);
    for (const record of finals(collected.records).filter(
      (record) => record.error === null,
    )) {
      expect(usageOf(record).databaseReadDocuments).toBe(35);
      expect(usageOf(record).databaseWriteDocuments).toBe(24);
      expect(usageOf(record).databaseWriteBytes).toBe(18410);
      expect(usageOf(record).databaseWriteIndexRows).toBe(97);
      // The first order reads StockReceived; later orders read the larger StockAllocated tail.
      expect([14454, 14614]).toContain(usageOf(record).databaseReadBytes);
    }
    expect(
      finals(collected.records).filter(
        (record) =>
          record.error === null && usageOf(record).databaseReadBytes === 14454,
      ),
    ).toHaveLength(8);
    expect(value.rowsLeftBehind.generations.created).toBe(0);
    console.log(
      JSON.stringify({
        timingReading: reading,
        ...throughput,
        outcomes: value.outcomeCounts,
        engineReruns: value.engineReruns,
      }),
    );
  },
  120000,
);

timing(
  "native timing: component query cost inside a mutation against the same helper read",
  async () => {
    const world: CostWorld = {};
    await prepareCost(world, 100);
    await sampleCost(world, "mutation");
    const medians = required(world.medians, "medians");
    const value = {
      pins: pins(required(world.backend, "backend")),
      composition: "fixture",
      timingReading: reading,
      readsPerSample: 100,
      samplesPerPath: 9,
      medianMs: {
        helper: medians.helper * 1000,
        nested: medians.nested * 1000,
        component: medians.component * 1000,
      },
      componentMinusHelperPerCallMs: (medians.component - medians.helper) * 10,
      productionComponentCallCost: "not exposed",
      quota: "not exposed",
    };
    measure("componentCost", json(value));
    console.log(JSON.stringify(value));
  },
);
