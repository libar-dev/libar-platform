import {
  createReader,
  ref,
  specTest,
  testAnchorId,
} from "@libar-dev/software-delivery-protocol";
import type { GraphSchema } from "@libar-dev/software-delivery-protocol";
import { readdir, readFile } from "node:fs/promises";
import { setTimeout as sleep } from "node:timers/promises";
import { join } from "node:path";
import { expect, test, vi } from "vitest";
vi.mock("node:timers/promises", async (original) => ({
  ...(await original<typeof import("node:timers/promises")>()),
  setTimeout: vi.fn(async () => undefined),
}));
import { redactedBuffer } from "../../harness/child.js";
import { invocation } from "../../harness/evidence.js";
import { createAdminAccess } from "../../harness/admin.js";
import { fixtureComposition } from "../../harness/composition.js";
import {
  localWriteRateBytesPerSecond,
  paceAfterWrite,
} from "../../harness/local-write-rate.js";
import * as wait from "../../harness/wait.js";
// Binds this file to the harness Spec, whose rules it checks directly.
const anchor = specTest({
  id: testAnchorId("test:platform.native-harness.rules"),
  verifies: ref("spec:platform.native-harness"),
});
void anchor;

test("pure: native sources read adminKey only in the acting-as demonstration", async () => {
  const directory = join(import.meta.dirname, "../native");
  const violations: string[] = [];
  async function inspect(relative = ""): Promise<void> {
    for (const entry of await readdir(join(directory, relative), {
      withFileTypes: true,
    })) {
      const file = join(relative, entry.name);
      if (entry.isDirectory()) {
        await inspect(file);
        continue;
      }
      if (
        !file.endsWith(".ts") ||
        file ===
          "admin-key-acting-as-identity-reaches-internal-function.test.ts"
      )
        continue;
      if (/\badminKey\b/.test(await readFile(join(directory, file), "utf8")))
        violations.push(file);
    }
  }
  await inspect();
  expect(violations).toEqual([]);
});

test("pure: a rolling buffer redacts a secret split at every chunk boundary before clipping", () => {
  const key = "REVIEW_DUMMY_SECRET_0123456789abcdef";
  for (let split = 1; split < key.length; split++) {
    const buffer = redactedBuffer([key], 4000);
    buffer.append(key.slice(0, split));
    expect(buffer.text()).toBe("");
    buffer.append(key.slice(split) + "x".repeat(3990));
    expect(buffer.text()).toContain("redacted]");
    expect(buffer.text()).not.toContain("6789abcdef");
  }
});

test("pure: the backend buffer redacts secrets across interleaved stdout, stderr and errors", () => {
  const key = "DUMMYSECRET0123456789abcdef";
  const reproduction = redactedBuffer([key], 16000);
  reproduction.append("DUMMYSECRET01", "stdout");
  reproduction.append("status ok\n", "stderr");
  expect(reproduction.text()).toBe("status ok\n");
  reproduction.append("23456789abcdef", "stdout");
  expect(reproduction.text()).toBe("status ok\n[redacted]");

  // All six orders that preserve the order within each two-chunk stream.
  const orders = ["ooss", "osos", "osso", "soos", "soso", "ssoo"];
  for (let split = 1; split < key.length; split++) {
    for (const order of orders) {
      for (let errorAt = 0; errorAt <= order.length; errorAt++) {
        const buffer = redactedBuffer([key], 16000);
        const offsets = { stdout: 0, stderr: 0 };
        for (let index = 0; index <= order.length; index++) {
          if (index === errorAt) buffer.append("status ok\n", "error");
          if (index === order.length) break;
          const stream = order[index] === "o" ? "stdout" : "stderr";
          const chunk =
            offsets[stream]++ === 0 ? key.slice(0, split) : key.slice(split);
          buffer.append(chunk, stream);
          expect(buffer.text().replaceAll("[redacted]", "")).toBe(
            index >= errorAt ? "status ok\n" : "",
          );
        }
        expect(buffer.text().match(/\[redacted\]/g)).toHaveLength(2);
        expect(buffer.text().replaceAll("[redacted]", "")).toBe("status ok\n");
      }
    }
  }
});

test("pure: the effective vitest invocation keeps forwarded arguments under npm", () => {
  vi.stubEnv("npm_command", "run-script");
  vi.stubEnv("npm_lifecycle_event", "test:native");
  try {
    expect(
      invocation([
        "run",
        "--project",
        "native",
        "--maxWorkers=1",
        "-t",
        "name with spaces",
      ]),
    ).toBe("vitest run --project native --maxWorkers=1 -t 'name with spaces'");
  } finally {
    vi.unstubAllEnvs();
  }
});

test("pure: function log marks reject a changed process even when the predicate already matches", async () => {
  const state = {
    deployed: undefined,
    environment: new Set<string>(),
    logProcess: {},
  };
  const admin = createAdminAccess(
    {
      url: "http://127.0.0.1:1",
      adminKey: "dummy",
      home: "unused",
      composition: fixtureComposition,
      secrets: [],
    },
    state,
  );
  const mark = await admin.logMark();
  expect(await admin.completionsSince(mark, () => true)).toEqual([]);
  state.logProcess = {};
  await expect(admin.completionsSince(mark, () => true)).rejects.toThrow(
    "another backend process",
  );
});

test("pure: local write pacing is exported by its named module and remains compatible", async () => {
  expect(localWriteRateBytesPerSecond).toBe(4 * 1024 * 1024);
  expect(wait.paceAfterWrite).toBe(paceAfterWrite);
  expect(wait.localWriteRateBytesPerSecond).toBe(localWriteRateBytesPerSecond);
  await paceAfterWrite(localWriteRateBytesPerSecond + 1);
  expect(sleep).toHaveBeenLastCalledWith(1251);
});

test("pure: every TypeScript file under harness/ reaches a Spec through its own anchor, and none is of unknown coverage", async () => {
  const root = join(import.meta.dirname, "../..");
  const graph = createReader(
    JSON.parse(
      await readFile(join(root, "generated/graph.json"), "utf8"),
    ) as GraphSchema,
  );
  const files = (await readdir(join(root, "harness")))
    .filter((name) => name.endsWith(".ts"))
    .map((name) => `harness/${name}`);
  expect(files.length).toBeGreaterThan(0);
  for (const file of files) {
    const radius = graph.blastRadius([file]);
    expect({ file, unknown: radius.coverageUnknown }).toEqual({
      file,
      unknown: [],
    });
    expect({
      file,
      reached: radius.impactedSpecs.some((spec) =>
        spec.reasons.some((reason) => reason.file === file),
      ),
    }).toEqual({ file, reached: true });
  }
});
