// The operator check, the scopes of a use case and the shapes of the gate and audit tables
// (spec:command.actor-and-scope, spec:application.write-pause, spec:operations.baseline-operations).
import { expect, test } from "vitest";
import { auditTables } from "../../src/audit/index.js";
import { assertOperator, limitOperatorBytes } from "../../src/command/index.js";
import {
  gateTables,
  limitClosedScopes,
  limitGateReasonBytes,
  scopesOfUseCase,
} from "../../src/gate/index.js";

test("pure: assertOperator refuses an empty or whitespace-only operator and one above 512 bytes, and returns any other trimmed", () => {
  for (const operator of ["", " ", "\t\n "])
    expect(() => assertOperator(operator)).toThrow(
      "An operator entry needs a stated operator",
    );
  expect(limitOperatorBytes).toBe(512);
  expect(assertOperator("x".repeat(512))).toBe("x".repeat(512));
  expect(() => assertOperator("x".repeat(513))).toThrow(
    "The stated operator is 513 bytes, above the limit of 512",
  );
  // 256 two-byte characters are 512 bytes, and one more ASCII byte is 513.
  expect(assertOperator("é".repeat(256))).toBe("é".repeat(256));
  expect(() => assertOperator("é".repeat(256) + "x")).toThrow(
    "The stated operator is 513 bytes, above the limit of 512",
  );
  expect(assertOperator(" ops-1 ")).toBe("ops-1");
});

test("pure: the trimmed text is the operator, so whitespace of any length is empty and the bound counts the trimmed bytes", () => {
  expect(() => assertOperator(" ".repeat(600))).toThrow(
    "An operator entry needs a stated operator",
  );
  const padded = " ".repeat(300) + "x".repeat(512) + "\t";
  expect(assertOperator(padded)).toBe("x".repeat(512));
  expect(() => assertOperator(" " + "x".repeat(513) + " ")).toThrow(
    "The stated operator is 513 bytes, above the limit of 512",
  );
});

test("pure: scopesOfUseCase answers all, the tenant scope, then one source scope per stream type the declaration writes, in that order", () => {
  expect(
    scopesOfUseCase("t-1", [
      { contextId: "orders", streamType: "order" },
      { contextId: "inventory", streamType: "stockItem" },
    ]),
  ).toEqual([
    "all",
    "tenant:t-1",
    "source:orders:order",
    "source:inventory:stockItem",
  ]);
  expect(scopesOfUseCase("t-2", [])).toEqual(["all", "tenant:t-2"]);
});

test("pure: the gate's limits, its one index, and the audit indexes, which lead with the tenant except operatorAudit's", () => {
  expect([limitClosedScopes, limitGateReasonBytes]).toEqual([16, 256]);
  const indexes = (tables: Record<string, { " indexes": () => unknown[] }>) =>
    Object.entries(tables).flatMap(([table, definition]) =>
      (
        definition[" indexes"]() as {
          indexDescriptor: string;
          fields: string[];
        }[]
      ).map(({ indexDescriptor, fields }) => [table, indexDescriptor, fields]),
    );
  expect(indexes(gateTables)).toEqual([
    ["maintenanceGates", "by_key", ["key"]],
  ]);
  expect(indexes(auditTables)).toEqual([
    ["auditRecords", "by_operation", ["tenantId", "operationId"]],
    [
      "auditRecords",
      "by_subject",
      [
        "tenantId",
        "subject.contextId",
        "subject.streamType",
        "subject.streamId",
        "recordedAt",
      ],
    ],
    ["auditRecords", "by_request_key", ["tenantId", "requestKey"]],
    ["operatorAudit", "by_scope", ["scopeKey", "recordedAt"]],
  ]);
});
