import { convexTest } from "convex-test";
import { ConvexError } from "convex/values";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";
import { api, internal } from "../../fixture/convex/_generated/api.js";
import annexSchema from "../../fixture/convex/annex/schema.js";
import depotSchema from "../../fixture/convex/depot/schema.js";
import { permissions } from "../../fixture/convex/depotCommands.js";
import { projectionFaultTitle } from "../../fixture/convex/documentTitles.js";
import { createTwiceSummarizedDocumentDeclaration } from "../../fixture/convex/summarizedTwice.js";
import schema from "../../fixture/convex/schema.js";
import yardSchema from "../../fixture/convex/yard/schema.js";
import { yardFaultTitle } from "../../fixture/convex/yard/streams.js";
import type { StreamDto } from "../../src/context/index.js";
import { writeReadModels } from "../../src/read-model/index.js";
const { version } = JSON.parse(
  readFileSync(
    join(import.meta.dirname, "../../node_modules/convex-test/package.json"),
    "utf8",
  ),
) as { version: string };
const name = (text: string) => `convex-test ${version}: ${text}`;
// The fixture composition with its three components, as the native backend deploys it.
function app() {
  const t = convexTest(
    schema,
    import.meta.glob("../../fixture/convex/**/*.ts"),
  );
  t.registerComponent(
    "annex",
    annexSchema,
    import.meta.glob("../../fixture/convex/annex/**/*.ts"),
  );
  t.registerComponent(
    "depot",
    depotSchema,
    import.meta.glob("../../fixture/convex/depot/**/*.ts"),
  );
  t.registerComponent(
    "yard",
    yardSchema,
    import.meta.glob("../../fixture/convex/yard/**/*.ts"),
  );
  return t;
}
const issuer = "https://fixture-issuer.test";
async function writer(t: ReturnType<typeof app>) {
  await t.mutation(internal.grants.grant, {
    tenantId: "t-1",
    principalKind: "human",
    principalId: `${issuer}|user-1`,
    permission: permissions.documents,
    grantedBy: "operator",
  });
  return t.withIdentity({ issuer, subject: "user-1" });
}
async function failure(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => {
      throw new Error("The call did not fail");
    },
    (error: unknown) => error,
  );
}

test(
  name(
    "FileDocument calls the depot and then the yard, whose copy names the depot version the depot's call returned",
  ),
  async () => {
    const t = app();
    const user = await writer(t);
    const response = await user.mutation(api.filing.fileDocument, {
      tenantId: "t-1",
      requestKey: "k-1",
      input: { documentId: "doc-1", title: "Filed" },
    });
    expect(response).toMatchObject({
      kind: "applied",
      replayed: false,
      result: { documentId: "doc-1", depotVersion: 1 },
      versions: [
        {
          contextId: "depot",
          streamType: "document",
          streamId: "doc-1",
          version: 1,
        },
        {
          contextId: "yard",
          streamType: "copy",
          streamId: "doc-1",
          version: 1,
        },
      ],
    });
  },
);

test(
  name(
    "the yard's fault title fails FileDocument with a plain error after the depot's call returned, and nothing is stored",
  ),
  async () => {
    const t = app();
    const user = await writer(t);
    const error = await failure(
      user.mutation(api.filing.fileDocument, {
        tenantId: "t-1",
        requestKey: "k-1",
        input: { documentId: "doc-1", title: yardFaultTitle },
      }),
    );
    expect(error).not.toBeInstanceOf(ConvexError);
    expect(String(error)).toContain(
      `Fault injected: ${yardFaultTitle}, filing document/doc-1 at depot version 1`,
    );
    expect(await t.run((ctx) => ctx.db.query("receipts").collect())).toEqual(
      [],
    );
    // The same key without the fault is new intent, and the depot's create of doc-1 at version 0 is
    // accepted again, so the depot kept nothing of the failed call.
    const response = await user.mutation(api.filing.fileDocument, {
      tenantId: "t-1",
      requestKey: "k-1",
      input: { documentId: "doc-1", title: "Filed" },
    });
    expect(response).toMatchObject({ kind: "applied", replayed: false });
  },
);

// Step 9 applies the bindings in their order, so the document title's projection throws after the
// document summary's row is written. Inside the one transaction the row is there when the error
// arrives; the throw that ends the transaction takes it away.
test(
  name(
    "step 9 writes the first binding's row before the second binding's projection throws, and the throw rolls the row back",
  ),
  async () => {
    const t = app();
    for (const readModel of ["documentSummary", "documentTitle"])
      await t.mutation(internal.readModels.activate, {
        readModel,
        startedBy: { kind: "operator", id: "operator-1" },
      });
    const documentVersion = {
      tenantId: "t-1",
      contextId: "depot",
      streamType: "document",
      streamId: "doc-1",
      version: 1,
    };
    const entry: StreamDto = {
      dto: {
        documentId: "doc-1",
        status: "draft",
        title: projectionFaultTitle,
        amendments: 0,
        version: documentVersion,
      },
      version: documentVersion,
      appended: 1,
      created: true,
      events: [],
    };
    const { name: commandType, readModels } =
      createTwiceSummarizedDocumentDeclaration;
    const error = await failure(
      t.run(async (ctx) => {
        // Step 9's own call, with the declaration's bindings in their order.
        const thrown = await failure(
          writeReadModels(ctx, commandType, readModels ?? [], {
            tenantId: "t-1",
            streams: [entry],
          }),
        );
        expect(await ctx.db.query("documentSummaries").collect()).toMatchObject(
          [{ key: "doc-1", generation: 1, title: projectionFaultTitle }],
        );
        expect(await ctx.db.query("documentTitles").collect()).toEqual([]);
        throw thrown;
      }),
    );
    expect(String(error)).toContain(
      `Fault injected: ${projectionFaultTitle}, projecting document doc-1`,
    );
    expect(
      await t.run((ctx) => ctx.db.query("documentSummaries").collect()),
    ).toEqual([]);
  },
);
