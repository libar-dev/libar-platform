import { expect, test } from "vitest";
import {
  documentTitle,
  projectionFaultTitle,
} from "../../fixture/convex/documentTitles.js";
import {
  copyStream,
  yardFaultTitle,
} from "../../fixture/convex/yard/streams.js";
import { copyDecider } from "../../fixture/domain/copy.js";
import { checkInvariants, fold } from "../../src/kernel/index.js";
const context = {
  now: Date.UTC(2026, 9, 1, 12),
  actor: { kind: "user", id: "fixture-user" },
  facts: {},
} as const;
const meta = {
  tenantId: "t-1",
  contextId: "yard",
  streamType: "copy",
  streamId: "doc-1",
  streamVersion: 1,
  stateSchemaVersion: 1,
};

test("a copy is filed once, with the title and the depot version it was given", () => {
  const command = {
    commandType: "file",
    title: "Filed",
    depotVersion: 3,
  } as const;
  const decision = copyDecider.decide(copyDecider.initial(), command, context);
  expect(decision).toEqual({
    kind: "applied",
    events: [
      {
        eventType: "filed",
        eventSchemaVersion: 1,
        payload: { title: "Filed", depotVersion: 3 },
        occurredAt: context.now,
      },
    ],
    result: { depotVersion: 3 },
  });
  if (decision.kind !== "applied") throw new Error("not applied");
  const filed = fold(
    copyDecider.evolve,
    copyDecider.initial(),
    decision.events,
  );
  expect(filed).toEqual({ filed: true, title: "Filed", depotVersion: 3 });
  expect(checkInvariants(copyDecider.invariants ?? [], filed)).toEqual([]);
  expect(copyDecider.decide(filed, command, context)).toMatchObject({
    kind: "rejection",
    rejection: { code: "alreadyFiled", details: { depotVersion: 3 } },
  });
  expect(
    checkInvariants(copyDecider.invariants ?? [], {
      filed: true,
      title: "x",
      depotVersion: 0,
    }),
  ).toEqual(["aFiledCopyNamesADepotVersion"]);
});

test("the copy's toDto throws for the yard's fault title only, naming the depot version", () => {
  expect(
    copyStream.toDto({ filed: true, title: "Filed", depotVersion: 2 }, meta),
  ).toEqual({
    documentId: "doc-1",
    title: "Filed",
    depotVersion: 2,
    version: {
      tenantId: "t-1",
      contextId: "yard",
      streamType: "copy",
      streamId: "doc-1",
      version: 1,
    },
  });
  expect(() =>
    copyStream.toDto(
      { filed: true, title: yardFaultTitle, depotVersion: 2 },
      meta,
    ),
  ).toThrow(
    `Fault injected: ${yardFaultTitle}, filing document/doc-1 at depot version 2`,
  );
});

test("the document title projection throws for its fault title only", () => {
  // native-harness.sdp.md:90: both versions throw for the fault title.
  for (const projection of documentTitle.projections) {
    expect(
      projection.keyOf("t-1", { documentId: "doc-1", title: "Report" }),
    ).toBe("doc-1");
    expect(
      projection.project("t-1", { documentId: "doc-1", title: "Report" }, []),
    ).toEqual({ documentId: "doc-1", title: "Report" });
    expect(() =>
      projection.project(
        "t-1",
        { documentId: "doc-1", title: projectionFaultTitle },
        [],
      ),
    ).toThrow(
      `Fault injected: ${projectionFaultTitle}, projecting document doc-1`,
    );
  }
});
