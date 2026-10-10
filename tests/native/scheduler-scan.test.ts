import { expect, test, vi } from "vitest";
import { schedulingBackend } from "./scheduler-composition.js";
// The failed-reaction scan of the Probe 7 scan example, on the temporary scheduling composition: a
// failed run of another function sits in the same system table and is left out of both scans.
vi.setConfig({ testTimeout: 300000 });

test("native: the failed-schedule scans return the failed reaction and leave out a failed run of another function", async () => {
  const { backend } = await schedulingBackend();
  await backend.admin.run("scheduling:states", {
    label: "local",
    due: Date.now() + 3600000,
  });
  await backend.admin.run("scheduling:scheduleRefused");
  const failed = async () =>
    (await backend.admin.readTable("_scheduled_functions"))
      .filter((row) => (row.state as { kind: string }).kind === "failed")
      .map((row) => row.name)
      .sort();
  await expect
    .poll(failed, { timeout: 30000 })
    .toEqual(["scheduling.js:reaction", "scheduling.js:refused"]);
  const { rows } = (await backend.admin.run("scheduling:scan")) as {
    rows: { name: string; args: { label: string }[] }[];
  };
  const plain = (await backend.admin.run("scheduling:scanPlain")) as {
    name: string;
    args: { label: string }[];
  }[];
  for (const answer of [rows, plain])
    expect(answer.map((row) => [row.name, row.args[0]?.label])).toEqual([
      ["scheduling.js:reaction", "local-failed"],
    ]);
});
