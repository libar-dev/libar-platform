import { expect, test } from "vitest";
import { deletedTitle } from "../../fixture/convex/depot/streams.js";
import {
  documentTitle,
  projectionFaultTitle,
} from "../../fixture/convex/documentTitles.js";
import {
  applyProjection,
  projectionOf,
} from "../../src/read-model/projection.js";
import {
  candidateRow,
  dto,
  memoryWriter,
  priorRow,
  projectionCases,
  readModel,
  version,
} from "./rebuild-support.js";

// projection-contract.sdp.md fnProjectionOf:68, typeReadModel:67; native-harness.sdp.md fixtureReadModel:90.
test("pure: projectionOf selects the declared version and the latest projection is first", () => {
  expect(readModel.projections.map((p) => p.version)).toEqual([2, 1]);
  expect(documentTitle.projections.map((p) => p.version)).toEqual([2, 1]);
  expect(projectionOf(readModel, 1)).toBe(readModel.projections[1]);
  expect(projectionOf(readModel, 2)).toBe(readModel.projections[0]);
  expect(() => projectionOf(readModel, 7)).toThrowError(
    new Error("Read model documentTitle declares no projection of version 7"),
  );
});

// native-harness.sdp.md fixtureReadModel:90: version 2 projects the deleted document to null,
// version 1 projects it as any other, and both throw for the fault title.
test("pure: the fixture's documentTitle versions differ only on the deleted document", () => {
  const [second, first] = documentTitle.projections;
  const live = { documentId: "d", title: "live" };
  const deleted = { documentId: "d", title: deletedTitle };
  expect(second.project("tenant-a", live, [])).toStrictEqual(live);
  expect(first?.project("tenant-a", live, [])).toStrictEqual(live);
  expect(second.project("tenant-a", deleted, [])).toBeNull();
  expect(first?.project("tenant-a", deleted, [])).toStrictEqual(deleted);
  for (const projection of [second, first])
    expect(() =>
      projection?.project(
        "tenant-a",
        { documentId: "d", title: projectionFaultTitle },
        [],
      ),
    ).toThrow();
});

// rebuild.sdp.md fnBatchSizeFor:116, limitBatchSize:146, limitPurgeBatch:147.
test.each([
  [16384, 100, 256],
  [65536, 32, 64],
])(
  "pure: batch and purge bounds at row budget %i",
  async (rowBudgetBytes, ceiling, purge) => {
    const { batchSizeFor, rebuildBatchCeiling, limitPurgeBatch } =
      await import("../../src/read-model/rebuild.js");
    const model = { ...readModel, rowBudgetBytes };
    expect(rebuildBatchCeiling(model)).toBe(ceiling);
    expect(limitPurgeBatch(model)).toBe(purge);
    expect(batchSizeFor(model)).toBe(ceiling);
    for (const n of [1, ceiling, ceiling + 1, 10000])
      expect(batchSizeFor(model, n)).toBe(Math.min(n, ceiling));
    for (const n of [0, -1, 1.5, NaN, Infinity, -Infinity]) {
      expect(() => batchSizeFor(model, n)).toThrowError(
        new Error(
          `The batch size must be a whole number of at least 1, and ${n} is not`,
        ),
      );
    }
  },
);

// projection-contract.sdp.md:64, step1:90, step2:91, step3:92, step4:93.
test.each(projectionCases)(
  "pure: $mode / $role / $state / null=$isNull",
  async ({ mode, role, state, isNull, expected }) => {
    const memory = memoryWriter(priorRow(state));
    const before = memory.row();
    expect(
      await applyProjection(memory.ctx, readModel, {
        tenantId: "tenant-a",
        dto: { ...dto, title: isNull ? "(deleted)" : "candidate" },
        versions: [version(3)],
        mode,
        generations: [{ role, generation: 1, projectionVersion: 2 }],
      }),
    ).toEqual([expected]);
    if (expected === "inserted" || expected === "updated") {
      expect(memory.row()).toStrictEqual({
        ...candidateRow,
        _id: "row",
        _creationTime: 1,
      });
      expect(memory.writes()).toBe(1);
    } else if (expected === "deleted") {
      expect(memory.row()).toBeNull();
      expect(memory.writes()).toBe(1);
    } else {
      expect(memory.row()).toStrictEqual(before);
      expect(memory.writes()).toBe(0);
    }
  },
);
// rebuild.sdp.md step6:126 and verifySteps:127 expose no pure cursor function.
// The direct batch tests in tests/simulator/rebuild.test.ts prove those cursor steps.

// rebuild.sdp.md limitTenantFillBatch:142, limitGenerationsListed:151.
test("pure: tenant fill and generation listing have their pinned bounds", async () => {
  const { limitTenantFillBatch, limitGenerationsListed } =
    await import("../../src/read-model/rebuild.js");
  expect(limitTenantFillBatch).toBe(8);
  expect(limitGenerationsListed).toBe(20);
});
