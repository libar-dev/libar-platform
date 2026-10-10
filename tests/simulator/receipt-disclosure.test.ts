import { expect, test } from "vitest";
import { api } from "../../fixture/convex/_generated/api.js";
import {
  app,
  caller,
  create,
  rejection,
  stored,
  name,
} from "./command-boundary-support.js";

async function twoSubjects() {
  const t = app();
  const alice = await caller(t, "alice", "a");
  const bob = await caller(t, "bob", "b");
  const original = await bob.mutation(
    api.depotCommands.createDocument,
    create("b"),
  );
  return { t, alice, bob, original, before: await stored(t) };
}
// spec:command.outcome-boundary, errorCodeIdempotencyConflict.
test(
  name(
    "a shared key conflict discloses no receipt facts to another subject's caller",
  ),
  async () => {
    const { alice, original } = await twoSubjects();
    const data = await rejection(
      alice.mutation(api.depotCommands.createDocument, create()),
    );
    expect.soft(data).toEqual({
      kind: "rejection",
      entry: "CreateDocument",
      code: "idempotencyConflict",
      message: "This request key was used with other input",
    });
    expect.soft(data).not.toHaveProperty("details");
    expect.soft(JSON.stringify(data)).not.toContain(original.operationId);
  },
);
test(
  name("the caller has no authority over the stored receipt's subject"),
  async () => {
    const { t, alice, before } = await twoSubjects();
    expect(
      await rejection(
        alice.mutation(api.depotCommands.createDocument, {
          ...create("b"),
          requestKey: "unused",
        }),
      ),
    ).toMatchObject({
      kind: "rejection",
      code: "forbidden",
      entry: "CreateDocument",
    });
    expect(await stored(t)).toEqual(before);
  },
);
test(
  name(
    "a conflicting call leaves one unchanged receipt and no stream for its subject",
  ),
  async () => {
    const { t, alice, before } = await twoSubjects();
    expect(
      await rejection(
        alice.mutation(api.depotCommands.createDocument, create()),
      ),
    ).toMatchObject({ code: "idempotencyConflict" });
    const after = await stored(t);
    expect(after).toEqual(before);
    expect(
      after.receipts.filter((row) => row.requestKey === "shared-key"),
    ).toHaveLength(1);
    expect(after.streams.some((row) => row.streamId === "a")).toBe(false);
  },
);
test.each(["same input", "other subject"])(
  name("an unsupported contract version discloses no stored facts with %s"),
  async (input) => {
    const { t, alice, bob, original } = await twoSubjects();
    await t.run(async (ctx) => {
      const row = await ctx.db.query("receipts").unique();
      if (row === null) throw new Error("No receipt");
      await ctx.db.patch("receipts", row._id, { contractVersion: 99 });
    });
    const before = await stored(t);
    const data = await rejection(
      (input === "same input" ? bob : alice).mutation(
        api.depotCommands.createDocument,
        create(input === "same input" ? "b" : "a"),
      ),
    );
    expect.soft(data).toEqual({
      kind: "rejection",
      entry: "CreateDocument",
      code: "unsupportedContractVersion",
      message: "This request key was used under another contract version",
    });
    expect.soft(data).not.toHaveProperty("details");
    // Compare the named field and the fixed message: UUIDs may themselves contain the digits 99.
    expect.soft(data.message).not.toContain("99");
    expect.soft(JSON.stringify(data)).not.toContain(original.operationId);
    expect(await stored(t)).toEqual(before);
  },
);
test(
  name("an authorized duplicate still receives the stored operation ID"),
  async () => {
    const { t, bob, original, before } = await twoSubjects();
    const duplicate = await bob.mutation(
      api.depotCommands.createDocument,
      create("b"),
    );
    expect(duplicate).toMatchObject({
      kind: "applied",
      replayed: true,
      operationId: original.operationId,
      result: null,
    });
    expect(await stored(t)).toEqual(before);
  },
);
