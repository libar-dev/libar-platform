import { expect } from "vitest";
import { required } from "../../harness/native.js";
import {
  healthyUsage,
  expectUsage,
  measured,
  order,
  seed,
  setup,
} from "./place-order-measurement.js";
export async function contentionCell(lines: 1 | 10 | 100, callers: 2 | 8 | 32) {
  const world = await setup();
  const shared = order(1);
  await seed(world, shared, 1);
  const args = Array.from({ length: callers }, (_, index) => {
    const arg = order(lines, index);
    required(arg.input.lines[0], "first line").stockItemId = "sku-000";
    return arg;
  });
  for (const arg of args)
    if (lines > 1)
      await seed(world, {
        ...arg,
        input: { ...arg.input, lines: arg.input.lines.slice(1) },
      });
  const result = await measured(
    world,
    args,
    `${callers} simultaneous commands, each ${lines} lines; only sku-000 is shared and has quantity one; it is first in each list; every other stock item belongs to one command and was received once with quantity two; four grants, one active generation; seven-character stock and order IDs.`,
    "contention",
    callers,
  );
  expect(result.value.outcomeCounts.applied).toBe(1);
  expect(result.value.outcomeCounts.duplicates).toBe(0);
  expect(result.value.outcomeCounts.businessFailure).toBe(0);
  expect(result.value.topLevelCommits).toBe(1);
  const stockItems = 1 + (lines - 1) * callers;
  expect(result.value.rowsBefore).toEqual({
    grants: 4,
    generations: 1,
    progress: 1,
    tenantFill: 0,
    markers: 0,
    receipts: 0,
    summaries: 0,
    orderStreams: 0,
    orderEvents: 0,
    stockStreams: stockItems,
    stockEvents: stockItems,
    gates: 0,
    auditRecords: 0,
    operatorAudit: 0,
  });
  expect(result.value.rowsAfter).toEqual({
    grants: 4,
    generations: 1,
    progress: 1,
    tenantFill: 0,
    markers: 0,
    receipts: 1,
    summaries: 1,
    orderStreams: 1,
    orderEvents: 1,
    stockStreams: stockItems,
    stockEvents: stockItems + lines,
    gates: 0,
    auditRecords: 0,
    operatorAudit: 0,
  });
  expect(
    result.value.outcomeCounts.rejected + result.value.engineFailedCommands,
  ).toBe(callers - 1);
  if (callers !== 32) {
    expect(result.value.outcomeCounts.rejected).toBe(callers - 1);
    expect(result.value.engineFailedCommands).toBe(0);
  }
  expect(
    result.answers
      .filter((answer) => answer.kind === "rejection")
      .map((answer) => answer.code),
  ).toEqual(
    Array(result.value.outcomeCounts.rejected).fill("insufficientStock"),
  );
  for (const record of result.records) {
    if (record.willRetry) {
      const [reads, , bytes] = healthyUsage[lines];
      expectUsage(record, [reads, 0, bytes, 0]);
    } else if (record.error === null) expectUsage(record, healthyUsage[lines]);
    else if (!record.willRetry && record.occInfo === null)
      expectUsage(record, [5, 0, 1595, 0]);
  }
  expect(result.after.receipts.length - result.before.receipts.length).toBe(1);
  expect(
    result.after.orderStreams.length - result.before.orderStreams.length,
  ).toBe(1);
  expect(
    result.after.orderEvents.length - result.before.orderEvents.length,
  ).toBe(1);
  expect(
    result.after.stockEvents.length - result.before.stockEvents.length,
  ).toBe(lines);
  expect(result.after.summaries.length - result.before.summaries.length).toBe(
    1,
  );
  const stock = required(
    result.after.stockStreams.find((row) => row.streamId === "sku-000"),
    "shared stock",
  );
  expect(stock.state).toEqual({ onHand: 1, allocated: 1 });
  await required(world.backend, "backend").dispose();
  return result.value;
}
