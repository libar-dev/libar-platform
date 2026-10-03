import {
  codeAnchor,
  codeAnchorId,
  ref,
} from "@libar-dev/software-delivery-protocol";
import { validate } from "convex-helpers/validators";
import { ConvexError, getConvexSize, v, type Value } from "convex/values";
import { createHash } from "node:crypto";
import { expect, test } from "vitest";
import {
  canonicalJson,
  classifyReceipt,
  classifyThrown,
  commandResponseValidator,
  commandTables,
  errorDataValidator,
  fingerprintOf,
  normalizeThrown,
  refuseTransient,
  reject,
  type Receipt,
} from "../../src/command/index.js";
// Binds the command library under src/command/ to its Specs. The library is bundled into the parent
// deployment, so it carries no Protocol import itself; these tests carry its anchors.
const anchorPipeline = codeAnchor({
  id: codeAnchorId("impl:command.command-pipeline"),
  label: "runPipeline and the command response in src/command",
  satisfies: ref("spec:command.command-pipeline"),
});
const anchorBoundary = codeAnchor({
  id: codeAnchorId("impl:command.outcome-boundary"),
  label: "reject, refuseTransient, normalizeThrown and classifyThrown",
  satisfies: ref("spec:command.outcome-boundary"),
});
const anchorReceipts = codeAnchor({
  id: codeAnchorId("impl:command.idempotency-and-receipts"),
  label: "the receipt key, fingerprint, lookup, classification and insert",
  satisfies: ref("spec:command.idempotency-and-receipts"),
});
const anchorReceiptTable = codeAnchor({
  id: codeAnchorId("impl:command.receipt-table"),
  label: "the receipts table in src/command",
  satisfies: ref("spec:command.receipt-table"),
});
const anchorAuthority = codeAnchor({
  id: codeAnchorId("impl:command.tenancy-and-authority"),
  label: "establishActor, authorize and the grant helpers",
  satisfies: ref("spec:command.tenancy-and-authority"),
});
const anchorActorAndScope = codeAnchor({
  id: codeAnchorId("impl:command.actor-and-scope"),
  label: "the actor, scope, namespace, authority and grants shapes",
  satisfies: ref("spec:command.actor-and-scope"),
});
const anchorDeclaration = codeAnchor({
  id: codeAnchorId("impl:command.command-declaration"),
  label:
    "CommandDeclaration, publicCommand, internalCommand and the depot commands",
  satisfies: ref("spec:command.command-declaration"),
});
void [
  anchorPipeline,
  anchorBoundary,
  anchorReceipts,
  anchorReceiptTable,
  anchorAuthority,
  anchorActorAndScope,
  anchorDeclaration,
];

test("pure: canonicalJson sorts object keys at every depth, keeps array order and omits undefined members", () => {
  expect(canonicalJson({ b: 1, a: { d: [3, 1], c: "x" }, e: undefined })).toBe(
    '{"a":{"c":"x","d":[3,1]},"b":1}',
  );
  expect(canonicalJson({ a: { c: "x", d: [3, 1] }, b: 1 })).toBe(
    canonicalJson({ b: 1, a: { d: [3, 1], c: "x" } }),
  );
  expect(canonicalJson([{ y: 1, x: 2 }])).toBe('[{"x":2,"y":1}]');
  expect(canonicalJson({ z: 2, _b: 1, A: 3 })).toBe('{"A":3,"_b":1,"z":2}');
});

test("pure: canonicalJson writes numbers in shortest round-trip form and no whitespace", () => {
  expect(canonicalJson({ n: [0.1, 1e21, 5, -2.5, 1 / 3] })).toBe(
    `{"n":[0.1,1e+21,5,-2.5,${String(1 / 3)}]}`,
  );
  expect(canonicalJson("a b")).toBe('"a b"');
  expect(canonicalJson(null)).toBe("null");
});

test("pure: canonicalJson gives an int64, bytes and a non-finite number one tagged encoding each, so they never collide", () => {
  const int = canonicalJson({ q: 1n });
  expect(int).toMatch(/^\{"q":\{"\$integer":"[A-Za-z0-9+/=]+"\}\}$/);
  expect(int).not.toBe(canonicalJson({ q: 1 }));
  const bytes = (values: number[]) =>
    canonicalJson({ b: new Uint8Array(values).buffer });
  expect(bytes([0, 255])).toMatch(/^\{"b":\{"\$bytes":"[A-Za-z0-9+/=]*"\}\}$/);
  expect(bytes([0, 255])).not.toBe(bytes([0, 254]));
  expect(bytes([])).not.toBe(canonicalJson({ b: {} }));
  for (const special of [NaN, Infinity, -Infinity, -0])
    expect(canonicalJson(special)).toMatch(/^\{"\$float":"[A-Za-z0-9+/=]+"\}$/);
  expect(canonicalJson(-0)).not.toBe(canonicalJson(0));
});

test("pure: canonicalJson refuses a value that is not a Convex value", () => {
  expect(() => canonicalJson({ f: () => 1 })).toThrow();
  expect(() => canonicalJson(undefined)).toThrow();
});

test("pure: fingerprintOf is the lowercase hex SHA-256 of the canonical input, a newline and the contract version", async () => {
  const expected = createHash("sha256")
    .update('{"a":1,"b":"é"}\n3')
    .digest("hex");
  expect(await fingerprintOf({ b: "é", a: 1 }, 3)).toBe(expected);
  expect(expected).toMatch(/^[0-9a-f]{64}$/);
  expect(await fingerprintOf({ a: 1, b: "é" }, 3)).toBe(expected);
  expect(await fingerprintOf({ a: 1, b: "é" }, 4)).not.toBe(expected);
  expect(await fingerprintOf({ a: 2, b: "é" }, 3)).not.toBe(expected);
});

const receipt = (fields: Partial<Receipt> = {}): Receipt =>
  ({
    _id: "r1",
    _creationTime: 0,
    tenantId: "t-1",
    namespace: "worker",
    commandType: "CreateDocument",
    requestKey: "k-1",
    fingerprint: "f-1",
    contractVersion: 1,
    outcome: "applied",
    operationId: "op-1",
    affected: [],
    versions: [],
    actorId: "a",
    recordedAt: 0,
    expiresAt: 1000,
    tombstone: false,
    ...fields,
  }) as Receipt;

test("pure: classifyReceipt answers new, duplicate or conflict by the fingerprint", () => {
  expect(classifyReceipt(null, "f-1", 1, 0)).toEqual({ class: "new" });
  const found = receipt();
  expect(classifyReceipt(found, "f-1", 1, 999)).toEqual({
    class: "duplicate",
    receipt: found,
  });
  expect(classifyReceipt(found, "f-2", 1, 999)).toEqual({
    class: "conflict",
  });
});

test("pure: classifyReceipt compares the contract version before the fingerprint", () => {
  for (const fingerprint of ["f-1", "f-2"])
    expect(classifyReceipt(receipt(), fingerprint, 2, 999)).toEqual({
      class: "unsupportedVersion",
    });
});

test("pure: classifyReceipt treats a receipt at or past its expiry as absent, before any other check", () => {
  for (const fields of [{}, { contractVersion: 9 }, { fingerprint: "f-9" }])
    expect(classifyReceipt(receipt(fields), "f-1", 1, 1000)).toEqual({
      class: "new",
    });
  expect(classifyReceipt(receipt(), "f-1", 1, 999).class).toBe("duplicate");
});

test("pure: classifyReceipt fails on a tombstone, which no retention writes", () => {
  expect(() =>
    classifyReceipt(receipt({ tombstone: true }), "f-1", 1, 0),
  ).toThrow("is a tombstone, which no retention writes");
});

function thrown(run: () => unknown): unknown {
  try {
    run();
  } catch (error) {
    return error;
  }
  throw new Error("Nothing was thrown");
}

test("pure: reject and refuseTransient throw ConvexErrors whose data fits errorDataValidator", () => {
  const rejection = thrown(() =>
    reject({
      code: "forbidden",
      entry: "CreateDocument",
      message: "No",
      details: { reason: "no_grant" },
    }),
  );
  expect(rejection).toBeInstanceOf(ConvexError);
  expect((rejection as ConvexError<Value>).data).toEqual({
    kind: "rejection",
    code: "forbidden",
    entry: "CreateDocument",
    message: "No",
    details: { reason: "no_grant" },
  });
  const transient = thrown(() =>
    refuseTransient({ code: "rateLimited", message: "Later", retryAfterMs: 5 }),
  );
  expect((transient as ConvexError<Value>).data).toEqual({
    kind: "transient",
    code: "rateLimited",
    message: "Later",
    retryAfterMs: 5,
  });
  for (const error of [rejection, transient])
    expect(
      validate(errorDataValidator, (error as ConvexError<Value>).data),
    ).toBe(true);
});

test("pure: reject throws a plain Error when its details measure above 16,384 bytes", () => {
  const detailsOf = (length: number) => ({ text: "x".repeat(length) });
  const atBound = detailsOf(16384 - getConvexSize(detailsOf(0)));
  expect(getConvexSize(atBound)).toBe(16384);
  const data = {
    code: "forbidden" as const,
    entry: "CreateDocument",
    message: "No",
  };
  expect(thrown(() => reject({ ...data, details: atBound }))).toBeInstanceOf(
    ConvexError,
  );
  const above = thrown(() =>
    reject({ ...data, details: { ...atBound, text: `${atBound.text}x` } }),
  );
  expect(above).not.toBeInstanceOf(ConvexError);
  expect(above).toBeInstanceOf(Error);
  expect(String(above)).toContain("16385 bytes of details");
});

test("pure: normalizeThrown wraps a bare kernel rejection with the discriminator and the entry", () => {
  const bare = new ConvexError({
    code: "invalidTransition",
    message: "A document cannot ship from draft",
    details: { from: "draft", trigger: "ship" },
  });
  const rethrown = thrown(() =>
    normalizeThrown(bare, "ShipDocument", ["invalidTransition"]),
  );
  expect(rethrown).toBeInstanceOf(ConvexError);
  expect((rethrown as ConvexError<Value>).data).toEqual({
    kind: "rejection",
    entry: "ShipDocument",
    code: "invalidTransition",
    message: "A document cannot ship from draft",
    details: { from: "draft", trigger: "ship" },
  });
});

test("pure: normalizeThrown rejects another entry's name and rethrows a plain error, a transient refusal, a ConvexError carrying other data and a thrown string unchanged", () => {
  const passed = [
    new Error("Fault injected"),
    new ConvexError({ kind: "transient", code: "capacity", message: "Full" }),
    new ConvexError("a string"),
    new ConvexError({ message: "y", extra: 1 }),
    "a thrown string",
  ];
  const mismatched = new ConvexError({
    kind: "rejection",
    code: "forbidden",
    entry: "Other",
    message: "No",
  });
  const normalized = thrown(() =>
    normalizeThrown(mismatched, "ShipDocument", []),
  );
  expect(normalized).toBeInstanceOf(Error);
  expect(normalized).not.toBeInstanceOf(ConvexError);
  expect(String(normalized)).toContain("Other");
  expect(String(normalized)).toContain("ShipDocument");
  for (const error of passed)
    expect(thrown(() => normalizeThrown(error, "ShipDocument", []))).toBe(
      error,
    );
});

test("pure: normalizeThrown wraps a kernel rejection with a platform code that the declaration does not list", () => {
  const bare = new ConvexError({
    code: "staleVersion",
    message: "Stream document/doc-1 is at version 2, not 1",
    details: { expected: 1, current: 2 },
  });
  const rethrown = thrown(() => normalizeThrown(bare, "ShipDocument", []));
  expect((rethrown as ConvexError<Value>).data).toEqual({
    kind: "rejection",
    entry: "ShipDocument",
    code: "staleVersion",
    message: "Stream document/doc-1 is at version 2, not 1",
    details: { expected: 1, current: 2 },
  });
});

test("pure: normalizeThrown rethrows a kernel rejection whose code is neither a platform code nor in rejections as a plain Error naming the code and the entry", () => {
  const bare = new ConvexError({
    code: "insufficientStock",
    message: "Cannot claim 2 when 1 are on hand",
  });
  for (const rejections of [[], ["invalidTransition"]]) {
    const rethrown = thrown(() =>
      normalizeThrown(bare, "ShipDocument", rejections),
    );
    expect(rethrown).not.toBeInstanceOf(ConvexError);
    expect(rethrown).toBeInstanceOf(Error);
    expect(String(rethrown)).toContain("insufficientStock");
    expect(String(rethrown)).toContain("ShipDocument");
    expect(classifyThrown(rethrown).kind).toBe("technical");
  }
});

test("pure: normalizeThrown rethrows a kernel rejection whose details measure above 16,384 bytes as a plain Error naming the code and the entry", () => {
  const bare = (documentId: string) =>
    new ConvexError({
      code: "invalidInput",
      message: "Document listed twice with different commands",
      details: { documentId },
    });
  const size = (documentId: string) => getConvexSize({ documentId });
  const atBound = "d".repeat(16384 - size(""));
  expect(size(atBound)).toBe(16384);
  expect(
    thrown(() => normalizeThrown(bare(atBound), "AmendDocument", [])),
  ).toBeInstanceOf(ConvexError);
  const rethrown = thrown(() =>
    normalizeThrown(bare(`${atBound}d`), "AmendDocument", []),
  );
  expect(rethrown).not.toBeInstanceOf(ConvexError);
  expect(rethrown).toBeInstanceOf(Error);
  expect(String(rethrown)).toContain(
    "A invalidInput rejection of AmendDocument carries 16385 bytes of details",
  );
  expect(classifyThrown(rethrown).kind).toBe("technical");
});

test("pure: classifyThrown tells a rejection from a transient refusal from a technical failure", () => {
  const rejection = thrown(() =>
    reject({ code: "forbidden", entry: "C", message: "No" }),
  );
  expect(classifyThrown(rejection)).toEqual({
    kind: "rejection",
    data: {
      kind: "rejection",
      code: "forbidden",
      entry: "C",
      message: "No",
    },
  });
  const transient = thrown(() =>
    refuseTransient({ code: "capacity", message: "Full" }),
  );
  expect(classifyThrown(transient)).toEqual({
    kind: "transient",
    data: { kind: "transient", code: "capacity", message: "Full" },
  });
  const technical = [
    new Error("Fault injected"),
    new ConvexError({ code: "invalidTransition", message: "bare" }),
    new ConvexError({ kind: "transient", code: "other", message: "x" }),
    new ConvexError({ kind: "rejection", code: "x", message: "no type" }),
    new ConvexError({
      kind: "rejection",
      code: "forbidden",
      entry: "C",
      message: "No",
      details: ["listed"],
    }),
  ];
  for (const error of technical)
    expect(classifyThrown(error)).toEqual({ kind: "technical", error });
});

test("pure: the receipts, grants and tenants indexes lead with tenantId, and a receipt has no field for input or result", () => {
  const indexes = Object.values(commandTables).flatMap((table) =>
    table[" indexes"](),
  );
  expect(
    indexes.map(({ indexDescriptor, fields }) => [indexDescriptor, fields]),
  ).toEqual([
    ["by_key", ["tenantId", "namespace", "commandType", "requestKey"]],
    ["by_operation", ["tenantId", "operationId"]],
    ["by_tenant_expiry", ["tenantId", "expiresAt"]],
    ["by_principal", ["tenantId", "principalKind", "principalId"]],
    ["by_permission", ["tenantId", "permission"]],
    ["by_tenant", ["tenantId"]],
  ]);
  expect(Object.keys(commandTables.receipts.validator.fields).sort()).toEqual([
    "actorId",
    "affected",
    "commandType",
    "contractVersion",
    "expiresAt",
    "fingerprint",
    "namespace",
    "operationId",
    "outcome",
    "recordedAt",
    "requestKey",
    "tenantId",
    "tombstone",
    "versions",
  ]);
});

test("pure: the command response admits a replay with result null and an execution only with the declared result", () => {
  const response = commandResponseValidator(v.object({ id: v.string() }));
  const common = {
    kind: "applied",
    operationId: "op-1",
    affected: [],
    versions: [],
  };
  expect(validate(response, { ...common, replayed: true, result: null })).toBe(
    true,
  );
  expect(
    validate(response, { ...common, replayed: false, result: { id: "x" } }),
  ).toBe(true);
  expect(validate(response, { ...common, replayed: false, result: null })).toBe(
    false,
  );
  expect(
    validate(response, { ...common, replayed: true, result: { id: "x" } }),
  ).toBe(false);
});
