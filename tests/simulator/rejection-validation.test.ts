import { expect, test } from "vitest";
import { api } from "../../fixture/convex/_generated/api.js";
import { classifyThrown } from "../../src/command/index.js";
import {
  app,
  caller,
  expectEmpty,
  failure,
} from "./command-boundary-support.js";

// spec:command.outcome-boundary, fnNormalizeThrown and transactionBoundary.
test("a registered command's invalid wire rejection becomes a technical failure and rolls back", async () => {
  const t = app();
  const alice = await caller(t);
  const error = await failure(
    alice.mutation(api.rejectionCommands.createRejectedDocument, {
      tenantId: "t-1",
      requestKey: "rejected",
      input: { documentId: "a" },
    }),
  );
  expect.soft(classifyThrown(error).kind).toBe("technical");
  expect.soft(String(error)).toContain("notDeclared");
  expect.soft(String(error)).toContain("CreateRejectedDocument");
  await expectEmpty(t);
});
