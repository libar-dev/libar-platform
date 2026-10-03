import { expect } from "vitest";
import type { Backend } from "../../harness/backend.js";
import { exportData, placeAdditionalOrder } from "./scheduler-cases.js";
import {
  schedulingBackend,
  schedulerRows,
  dataRows,
  scopes,
  options,
  record,
  stateKinds,
} from "./scheduler-composition.js";
export async function freshImport(backend: Backend, directory: string) {
  const exported = await exportData(backend, directory, Date.now() + 3600000);
  const { backend: fresh } = await schedulingBackend();
  await fresh.admin.setEnvironment({ SCHEDULER_VALUE: "destination" });
  const environment = await fresh.admin.environment();
  await fresh.admin.replaceSnapshot(exported.path);
  const restored = await dataRows(fresh);
  record("fresh restored data", restored);

  const schedules = await schedulerRows(fresh);
  record("fresh scheduler tables", schedules);
  const environmentAfter = await fresh.admin.environment();
  const references = [];
  record("fresh environment after import", await fresh.admin.environment());

  for (const component of scopes) {
    const stored = await fresh.admin.readTable(
      "schedulerReferences",
      options(component),
    );
    expect(stored).toHaveLength(1);
    const id = stored[0]!.dispatchId!;
    let read: unknown;
    let error: string | null = null;
    try {
      read = await fresh.admin.run(
        "scheduling:reference",
        { id, cancel: true },
        options(component),
      );
    } catch (caught) {
      error = String(caught);
    }
    record("fresh scheduler reference", {
      component: component ?? "parent",
      id,
      error,
      row: read === undefined ? null : (read as null),
    });

    const copies = await fresh.admin.readTable(
      "schedulerReferences",
      options(component),
    );
    references.push({
      component: component ?? "parent",
      id,
      read,
      error,
      copies,
      schedules: await fresh.admin.readTable(
        "_scheduled_functions",
        options(component),
      ),
    });
  }
  return {
    exported: exported.data,
    restored,
    schedules,
    environment,
    environmentAfter,
    references,
  };
}
export async function inPlaceImport(backend: Backend, directory: string) {
  const due = Date.now() + 45000;
  const exported = await exportData(backend, directory, due);
  await placeAdditionalOrder(backend);
  for (const component of scopes) {
    const rows = await backend.admin.readTable(
      "schedulerData",
      options(component),
    );
    await backend.admin.writeTable(
      "schedulerData",
      { patch: String(rows[0]!._id), fields: { value: "after-export" } },
      options(component),
    );
    await backend.admin.run(
      "scheduling:states",
      { label: "after-export", due },
      options(component),
    );
  }
  for (const component of scopes)
    await expect
      .poll(() => stateKinds(backend, component), { timeout: 15000 })
      .toEqual([
        "canceled",
        "canceled",
        "failed",
        "failed",
        "inProgress",
        "inProgress",
        "pending",
        "pending",
        "success",
        "success",
      ]);
  await backend.admin.setEnvironment({ SCHEDULER_VALUE: "after-export" });
  const environment = await backend.admin.environment();
  const changedData = await dataRows(backend);
  record("in-place data before import", changedData);
  for (const table of [
    "orders/streams",
    "orders/events",
    "inventory/streams",
    "inventory/events",
    "parent/receipts",
    "parent/orderSummaries",
  ])
    expect(changedData[table]).not.toEqual(exported.data[table]);
  const before = await schedulerRows(backend);
  record("in-place scheduler tables before import", before);
  await backend.admin.replaceSnapshot(exported.path);
  expect(Date.now()).toBeLessThan(due);
  const after = await schedulerRows(backend);
  record("in-place scheduler tables after import", after);

  const restored = await dataRows(backend);
  record("in-place restored data", restored);

  const environmentAfter = await backend.admin.environment();
  const references = [];
  const reactions = [];
  record(
    "in-place environment after import",
    await backend.admin.environment(),
  );

  for (const component of scopes) {
    const id =
      exported.data[`${component ?? "parent"}/schedulerReferences`]![0]!
        .dispatchId!;
    const found = await backend.admin.run(
      "scheduling:reference",
      { id, cancel: true },
      options(component),
    );
    record("in-place scheduler reference", {
      component: component ?? "parent",
      id,
      row: found,
    });
    const canceled = (
      await backend.admin.readTable("_scheduled_functions", options(component))
    ).find((row) => row._id === id);
    record("canceled restored reference", {
      component: component ?? "parent",
      row: canceled!,
    });
    references.push({ component: component ?? "parent", id, found, canceled });
  }
  for (const component of scopes) {
    await expect
      .poll(
        async () =>
          (
            await backend.admin.readTable(
              "schedulerEffects",
              options(component),
            )
          ).filter((row) => row.label === "after-export").length,
        { timeout: 55000, interval: 200 },
      )
      .toBe(1);
    const effects = await backend.admin.readTable(
      "schedulerEffects",
      options(component),
    );
    record("kept reactions after their scheduled time", {
      component: component ?? "parent",
      due,
      observedAt: Date.now(),
      effects,
    });
    const kept = effects.find((row) => row.label === "after-export");
    reactions.push({ component: component ?? "parent", kept, effects });
  }
  record(
    "in-place scheduler tables after execution",
    await schedulerRows(backend),
  );
  return {
    exported: exported.data,
    changedData,
    restored,
    before,
    after,
    environment,
    environmentAfter,
    references,
    reactions,
    due,
  };
}
