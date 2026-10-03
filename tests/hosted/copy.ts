// The temporary copy of the fixture composition that the hosted driver deploys, and that the local
// example of an undeclared table deploys. It adds, from modules outside every composition, the
// table plantedSchedules of planting records and its planting module in the parent, and the
// scheduler references and reactions of the local in-place example in the parent and in the two
// fixture contexts. The fixture composition itself gains nothing.
import { createHash } from "node:crypto";
import {
  cp,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, onTestFinished } from "vitest";
import type { Backend } from "../../harness/backend.js";
import type { JsonValue } from "../../harness/evidence.js";
const root = join(import.meta.dirname, "../..");
// The parent and the fixture contexts whose sources the copy holds. The annex is mounted twice and
// the migrations component comes from a package, so neither gets a module.
export const copyScopes = [undefined, "depot", "yard"] as const;
export type CopyScope = (typeof copyScopes)[number];
export const scopeOptions = (scope: CopyScope) =>
  scope === undefined ? {} : { component: scope };
const schedulerTables =
  'schedulerData: defineTable({ value: v.string(), held: v.boolean() }), schedulerReferences: defineTable({ dispatchId: v.id("_scheduled_functions"), label: v.string() }), schedulerEffects: defineTable({ label: v.string(), value: v.string() }),';
const plantingTable =
  'plantedSchedules: defineTable({ scheduledId: v.id("_scheduled_functions"), planted: v.string(), startedAt: v.string(), state: v.union(v.string(), v.null()), completedTime: v.union(v.number(), v.null()), imports: v.number() }),';
const sha256 = (text: string) =>
  createHash("sha256").update(text).digest("hex");
export interface HostedCopy {
  directory: string;
  // What the copy adds, recorded beside its deploy.
  added: { [key: string]: JsonValue };
}
// Writes the copy into a directory the test removes when it finishes.
export async function hostedCopy(): Promise<HostedCopy> {
  const directory = await mkdtemp(join(tmpdir(), "libar-hosted-copy-"));
  onTestFinished(() => rm(directory, { recursive: true, force: true }));
  for (const path of ["fixture", "src", "package.json", "convex.json"])
    await cp(join(root, path), join(directory, path), { recursive: true });
  await symlink(join(root, "node_modules"), join(directory, "node_modules"));
  const planting = await readFile(
    join(import.meta.dirname, "planting.ts"),
    "utf8",
  );
  const scheduling = await readFile(
    join(root, "tests/native/scheduler-functions.ts"),
    "utf8",
  );
  await writeFile(join(directory, "fixture/convex/planting.ts"), planting);
  const schemas: { [scope: string]: string } = {};
  for (const scope of copyScopes) {
    const path = join(directory, "fixture/convex", scope ?? "");
    await writeFile(join(path, "scheduling.ts"), scheduling);
    let schema = await readFile(join(path, "schema.ts"), "utf8");
    if (!schema.includes('from "convex/values"'))
      schema = 'import { v } from "convex/values";\n' + schema;
    if (!schema.includes("defineTable"))
      schema = schema.replace(
        "{ defineSchema }",
        "{ defineSchema, defineTable }",
      );
    if (schema.split("defineSchema({").length !== 2)
      throw new Error(`The schema of ${scope ?? "the parent"} changed shape`);
    schema = schema.replace(
      "defineSchema({",
      `defineSchema({ ${schedulerTables}${scope === undefined ? plantingTable : ""}`,
    );
    await writeFile(join(path, "schema.ts"), schema);
    schemas[scope ?? "parent"] = sha256(schema);
  }
  return {
    directory,
    added: {
      baseComposition: "fixture",
      addedModules: ["planting", "scheduling"],
      scopes: copyScopes.map((scope) => scope ?? "parent"),
      plantingSha256: sha256(planting),
      schedulingSha256: sha256(scheduling),
      schemas,
    },
  };
}
// Plants one succeeded, one failed and one canceled schedule in the parent, with their planting
// records, and waits until each record holds its schedule's terminal state and completedTime.
export async function plantSchedules(backend: Backend, startedAt: string) {
  await backend.admin.run("planting:plant", { startedAt });
  await expect
    .poll(() => backend.admin.run("planting:settle", { startedAt }), {
      timeout: 60000,
      interval: 500,
    })
    .toBe(true);
}
