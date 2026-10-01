import { getFunctionName } from "convex/server";
import { ConvexError, type Value } from "convex/values";
import { expect, test } from "vitest";
import { internal } from "../../fixture/convex/_generated/api.js";
import { titleCopies } from "../../fixture/convex/depot/streams.js";
import { limitReturnBytesPerCall } from "../../src/context/index.js";
import { fixtureBackend, measure } from "../../harness/native.js";
// The depot's copyTitles creates documents and returns each title titleCopies times, so a call that
// writes well under the write bound returns more than limitReturnBytesPerCall.
const call = (operationId: string, titleLength: number) => ({
  tenantId: "t-1",
  actor: { kind: "operator", id: "native-test" },
  operation: {
    operationId,
    causedBy: { kind: "command", commandType: "fixture" },
  },
  input: {
    documents: Array.from({ length: 10 }, (_, i) => ({
      documentId: `doc-${i}`,
      title: String(i).padEnd(titleLength, "x"),
    })),
  },
});

test("native: an operation whose return measures above 8 MiB fails as a technical failure and commits nothing, and one under it returns", async () => {
  const backend = await fixtureBackend();
  const copyTitles = getFunctionName(internal.depotRelay.copyTitles);
  const error = await backend.admin
    .run(copyTitles, call("copy-large", 15000))
    .then(
      () => undefined,
      (thrown: unknown) => thrown,
    );
  measure("aboveBound", String(error).slice(0, 400));
  expect(error).toBeInstanceOf(Error);
  expect(error).not.toBeInstanceOf(ConvexError);
  expect(String(error)).toMatch(
    new RegExp(
      `Operation copyTitles would return \\d+ bytes, above ${limitReturnBytesPerCall}`,
    ),
  );
  expect(
    await backend.admin.readTable("streams", { component: "depot" }),
  ).toEqual([]);
  expect(
    await backend.admin.readTable("events", { component: "depot" }),
  ).toEqual([]);
  const outcome = (await backend.admin.run(
    copyTitles,
    call("copy-small", 100),
  )) as { kind: string; result: { titles: Value[] } };
  expect(outcome.kind).toBe("applied");
  expect(outcome.result.titles).toHaveLength(10 * titleCopies);
  expect(
    await backend.admin.readTable("streams", { component: "depot" }),
  ).toHaveLength(10);
});
