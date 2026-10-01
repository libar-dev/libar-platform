import { expect, test } from "vitest";
import { redact, runChild } from "../../harness/child.js";
const secret = "0123456789abcdef-instance-secret";
test("pure: a failed child's error holds its exit code and its output, and neither its arguments nor a secret", async () => {
  const error: unknown = await runChild(
    "the child",
    process.execPath,
    [
      "-e",
      "console.error('refused ' + process.argv[1]); process.exit(3)",
      secret,
    ],
    { timeoutMs: 10000, secrets: [secret] },
  ).then(
    () => undefined,
    (thrown: unknown) => thrown,
  );
  expect(error).toBeInstanceOf(Error);
  const seen = JSON.stringify(
    Object.getOwnPropertyNames(error).map((name) => [
      name,
      String((error as Record<string, unknown>)[name]),
    ]),
  );
  expect(seen).toContain("the child failed with exit code 3");
  expect(seen).toContain("refused [redacted]");
  expect(seen).not.toContain(secret);
  expect(seen).not.toContain("process.exit");
});
test("pure: a child that outlives its deadline is killed and reported", async () => {
  await expect(
    runChild(
      "the slow child",
      process.execPath,
      ["-e", "setInterval(() => {}, 1000)"],
      { timeoutMs: 300 },
    ),
  ).rejects.toThrow("the slow child did not finish in 300 ms");
});
test("pure: a child that cannot start is reported without its arguments", async () => {
  await expect(
    runChild("the missing child", "/no/such/executable", [secret], {
      timeoutMs: 1000,
    }),
  ).rejects.toThrow("the missing child could not start: ENOENT");
});
test("pure: redact replaces every occurrence of every secret", () => {
  expect(redact("a KEY b KEY c OTHER", ["KEY", "OTHER"])).toBe(
    "a [redacted] b [redacted] c [redacted]",
  );
});
