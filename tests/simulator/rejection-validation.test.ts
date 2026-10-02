import { ConvexError } from "convex/values";
import { expect, test } from "vitest";
import { api } from "../../fixture/convex/_generated/api.js";
import { listedDetail } from "../../fixture/convex/depot/streams.js";
import { classifyThrown } from "../../src/command/index.js";
import {
  app,
  caller,
  expectEmpty,
  failure,
  name,
} from "./command-boundary-support.js";

// spec:command.outcome-boundary, fnNormalizeThrown and transactionBoundary.
test(
  name(
    "a registered command's invalid wire rejection becomes a technical failure and rolls back",
  ),
  async () => {
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
  },
);
test(
  name(
    "a context's bare rejection whose details are a list becomes a technical failure that carries none of them, and rolls back",
  ),
  async () => {
    const t = app();
    const alice = await caller(t);
    const error = await failure(
      alice.mutation(api.rejectionCommands.createListRejectedDocuments, {
        tenantId: "t-1",
        requestKey: "listed",
        input: { documentId: "a", refusedId: "b" },
      }),
    );
    expect.soft(error).toBeInstanceOf(Error);
    expect.soft(error).not.toBeInstanceOf(ConvexError);
    expect.soft(classifyThrown(error).kind).toBe("technical");
    expect.soft(String(error)).toContain("CreateListRejectedDocuments");
    expect.soft(JSON.stringify(error)).not.toContain(listedDetail);
    expect.soft(String(error)).not.toContain(listedDetail);
    await expectEmpty(t);
  },
);
