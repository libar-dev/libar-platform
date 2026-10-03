import {
  cp,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { onTestFinished, expect } from "vitest";
import type { Backend } from "../../harness/backend.js";
import { productionBackend, measure } from "../../harness/native.js";
import { convexToJson, type Value } from "convex/values";
const root = join(import.meta.dirname, "../..");
export const scopes = [undefined, "orders", "inventory"] as const;
export const options = (component: string | undefined) =>
  component === undefined ? {} : { component };
export async function schedulingBackend() {
  const directory = await mkdtemp(join(tmpdir(), "scheduler-composition-"));
  onTestFinished(() => rm(directory, { recursive: true, force: true }));
  for (const path of ["example", "src", "package.json"])
    await cp(join(root, path), join(directory, path), { recursive: true });
  await symlink(join(root, "node_modules"), join(directory, "node_modules"));
  const functions = await readFile(
    join(import.meta.dirname, "scheduler-functions.ts"),
    "utf8",
  );
  const schemas: Record<string, string> = {};
  for (const component of scopes) {
    const path = join(directory, "example/convex", component ?? "");
    await writeFile(join(path, "scheduling.ts"), functions);
    let schema = await readFile(join(path, "schema.ts"), "utf8");
    schema = 'import { v } from "convex/values";\n' + schema;
    if (!schema.includes("defineTable"))
      schema = schema.replace(
        "{ defineSchema }",
        "{ defineSchema, defineTable }",
      );
    schema = schema.replace(
      "defineSchema({",
      'defineSchema({ schedulerData: defineTable({ value: v.string(), held: v.boolean() }), schedulerReferences: defineTable({ dispatchId: v.id("_scheduled_functions"), label: v.string() }), schedulerEffects: defineTable({ label: v.string(), value: v.string() }),',
    );
    await writeFile(join(path, "schema.ts"), schema);
    schemas[component ?? "parent"] = createHash("sha256")
      .update(schema)
      .digest("hex");
  }
  const backend = await productionBackend();
  const deployed = await backend.admin.deployTemporary(
    join(directory, "example"),
  );
  measure("temporary deployment", {
    baseComposition: "production",
    addedModule: "scheduling",
    scopes: scopes.map((s) => s ?? "parent"),
    functionSha256: createHash("sha256").update(functions).digest("hex"),
    schemas,
    ...deployed,
  });
  expect(backend.facts().composition).toBeNull();
  return { backend, directory };
}
// The kinds of the scheduler states' rows in one scope. A setup that installs a read model through
// its first rebuild leaves its batches' rows in the parent; they are the setup's, not the states'.
export async function stateKinds(
  backend: Backend,
  component: (typeof scopes)[number],
) {
  return (
    await backend.admin.readTable("_scheduled_functions", options(component))
  )
    .filter((row) => !String(row.name).startsWith("rebuild"))
    .map((row) => (row.state as { kind: string }).kind)
    .sort();
}
export async function initialize(
  backend: Backend,
  due: number,
  label = "exported",
) {
  for (const component of scopes) {
    await backend.admin.writeTable(
      "schedulerData",
      { insert: { value: "exported", held: true } },
      options(component),
    );
    await backend.admin.run(
      "scheduling:states",
      { label, due },
      options(component),
    );
  }
  for (const component of scopes)
    await expect
      .poll(() => stateKinds(backend, component), { timeout: 15000 })
      .toEqual(["canceled", "failed", "inProgress", "pending", "success"]);
}
export async function schedulerRows(backend: Backend) {
  const result: Record<string, Record<string, Value>[]> = {};
  for (const component of scopes)
    result[component ?? "parent"] = await backend.admin.readTable(
      "_scheduled_functions",
      options(component),
    );
  return result;
}
export async function dataRows(backend: Backend) {
  const result: Record<string, Record<string, Value>[]> = {};
  for (const component of scopes)
    for (const table of component === undefined
      ? [
          "receipts",
          "grants",
          "tenants",
          "maintenanceGates",
          "auditRecords",
          "operatorAudit",
          "generations",
          "orderSummaries",
          "schedulerData",
          "schedulerReferences",
          "schedulerEffects",
        ]
      : [
          "streams",
          "events",
          "schedulerData",
          "schedulerReferences",
          "schedulerEffects",
        ])
      result[`${component ?? "parent"}/${table}`] =
        await backend.admin.readTable(table, options(component));
  return result;
}
export const record = (name: string, value: Value) =>
  measure(name, convexToJson(value));
