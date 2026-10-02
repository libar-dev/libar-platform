import {
  codeAnchor,
  codeAnchorId,
  ref,
} from "@libar-dev/software-delivery-protocol";
import { expect, test } from "vitest";
import { documentSummary } from "../../fixture/convex/summaries.js";
import { limitListBytes } from "../../src/context/index.js";
import {
  defaultRowBudgetBytes,
  fromSource,
  limitReadModelList,
  limitReadModelWritesPerCommand,
  limitRowBudgetBytes,
  readModelView,
} from "../../src/read-model/index.js";
// Binds the read-model library under src/read-model/ to its Specs. The library is bundled into the
// parent deployment, so it carries no Protocol import itself; these tests carry its anchors.
const anchorProjection = codeAnchor({
  id: codeAnchorId("impl:application.projection-contract"),
  label: "ReadModel, Projection, rowConventions and applyProjection",
  satisfies: ref("spec:application.projection-contract"),
});
const anchorRegistry = codeAnchor({
  id: codeAnchorId("impl:application.generation-registry"),
  label:
    "the generations table, activateFirstGeneration, generationsToWrite and activeGeneration",
  satisfies: ref("spec:application.generation-registry"),
});
const anchorReadModels = codeAnchor({
  id: codeAnchorId("impl:application.read-models"),
  label: "writeReadModels, readModelView and limitReadModelList",
  satisfies: ref("spec:application.read-models"),
});
void [anchorProjection, anchorRegistry, anchorReadModels];
const version = {
  tenantId: "t-1",
  contextId: "depot",
  streamType: "document",
  streamId: "doc-1",
  version: 3,
};

test("pure: a read-model row as a query returns it keeps the tenant, key, projection version, source versions and fields, and drops the document ID, creation time and generation", () => {
  const row = {
    _id: "id-1",
    _creationTime: 1,
    tenantId: "t-1",
    generation: 2,
    key: "doc-1",
    projectionVersion: 1,
    sourceVersions: [version],
    documentId: "doc-1",
    status: "draft",
    title: "Report",
  };
  expect(readModelView(row)).toStrictEqual({
    tenantId: "t-1",
    key: "doc-1",
    projectionVersion: 1,
    sourceVersions: [version],
    documentId: "doc-1",
    status: "draft",
    title: "Report",
  });
  expect(row._id).toBe("id-1");
});

test("pure: a read-model list page holds 100 items at the default 16 KiB row budget and 64 at the 64 KiB ceiling, with the list byte cap", () => {
  expect(defaultRowBudgetBytes).toBe(16384);
  expect(limitRowBudgetBytes).toBe(65536);
  expect(limitReadModelList(documentSummary)).toEqual({
    items: 100,
    bytes: limitListBytes,
  });
  expect(
    limitReadModelList({ ...documentSummary, rowBudgetBytes: 65536 }),
  ).toEqual({ items: 64, bytes: limitListBytes });
  expect(limitReadModelWritesPerCommand).toBe(4);
});

test("pure: a streams entry is of a source when its context and stream type both match", () => {
  const source = { contextId: "depot", streamType: "document" };
  expect(fromSource(source, { version })).toBe(true);
  expect(
    fromSource(source, { version: { ...version, contextId: "yard" } }),
  ).toBe(false);
  expect(
    fromSource(source, { version: { ...version, streamType: "stock" } }),
  ).toBe(false);
});

test("pure: the fixture's projection keys a summary by document ID and keeps its status and title", () => {
  const dto = {
    documentId: "doc-1",
    status: "submitted" as const,
    title: "Report",
    amendments: 2,
    version,
  };
  const { projection } = documentSummary;
  expect(projection.keyOf("t-1", dto)).toBe("doc-1");
  expect(projection.project("t-1", dto, [version])).toStrictEqual({
    documentId: "doc-1",
    status: "submitted",
    title: "Report",
  });
  // The same input gives the same row.
  expect(projection.project("t-1", dto, [version])).toStrictEqual(
    projection.project("t-1", dto, [version]),
  );
});
