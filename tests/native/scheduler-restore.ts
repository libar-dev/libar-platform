import { expect } from "vitest";
import type { Backend } from "../../harness/backend.js";
import { measure } from "../../harness/native.js";
import { exportData, placeAdditionalOrder } from "./scheduler-cases.js";
import {
  schedulingBackend,
  schedulerRows,
  dataRows,
  scopes,
  options,
  record,
} from "./scheduler-composition.js";
export async function freshImport(backend: Backend, directory: string) {
  const exported = await exportData(backend, directory, Date.now() + 3600000);
  const { backend: fresh } = await schedulingBackend();
  await fresh.admin.setEnvironment({ SCHEDULER_VALUE: "destination" });
  const environment = await fresh.admin.environment();
  await fresh.admin.replaceSnapshot(exported.path);
  const restored = await dataRows(fresh);
  record("fresh restored data", restored);
  expect(restored).toEqual(exported.data);
  const schedules = await schedulerRows(fresh);
  record("fresh scheduler tables", schedules);
  for (const rows of Object.values(schedules)) expect(rows).toEqual([]);
  expect(await fresh.admin.environment()).toEqual(environment);
  record("fresh environment after import", await fresh.admin.environment());
  measure("fresh environment preserved", true);
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
    expect(error).toBeNull();
    expect(read).toBeNull();
    const copies = await fresh.admin.readTable(
      "schedulerReferences",
      options(component),
    );
    expect(copies).toHaveLength(2);
    expect(copies.every((row) => row.dispatchId === id)).toBe(true);
    expect(
      await fresh.admin.readTable("_scheduled_functions", options(component)),
    ).toEqual([]);
  }
  return "documents preserved and schedules absent";
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
      .poll(
        async () =>
          (
            await backend.admin.readTable(
              "_scheduled_functions",
              options(component),
            )
          )
            .map((row) => (row.state as { kind: string }).kind)
            .sort(),
        { timeout: 15000 },
      )
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
  expect(after).toEqual(before);
  const restored = await dataRows(backend);
  record("in-place restored data", restored);
  expect(restored).toEqual(exported.data);
  expect(await backend.admin.environment()).toEqual(environment);
  record(
    "in-place environment after import",
    await backend.admin.environment(),
  );
  measure("in-place environment preserved", true);
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
    expect(found).toEqual(
      before[component ?? "parent"]!.find((row) => row._id === id),
    );
    const canceled = (
      await backend.admin.readTable("_scheduled_functions", options(component))
    ).find((row) => row._id === id);
    record("canceled restored reference", {
      component: component ?? "parent",
      row: canceled!,
    });
    expect(canceled?.state).toEqual({ kind: "canceled" });
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
          ).filter((row) => row.label === "after-export"),
        { timeout: 55000, interval: 200 },
      )
      .toEqual([
        expect.objectContaining({ label: "after-export", value: "exported" }),
      ]);
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
    expect(Number(kept?._creationTime)).toBeGreaterThanOrEqual(due);
    expect(effects.filter((row) => row.label === "exported")).toEqual([]);
  }
  record(
    "in-place scheduler tables after execution",
    await schedulerRows(backend),
  );
  return "documents replaced and schedules preserved";
}
