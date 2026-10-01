import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, onTestFinished, test, vi } from "vitest";
import { resolveExecutable } from "../../harness/executable.js";
interface ReleasePin {
  release: string;
  assets: Record<string, { file: string }>;
}
const pin = JSON.parse(
  await readFile(
    join(import.meta.dirname, "../../harness/backend-release.json"),
    "utf8",
  ),
) as ReleasePin;
const asset = pin.assets[`${process.platform}-${process.arch}`];
async function scratch(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "libar-executable-signal-"));
  onTestFinished(() => rm(directory, { recursive: true, force: true }));
  return directory;
}
afterEach(() => vi.unstubAllEnvs());

// A download that never answers, as a stalled network does.
function stalled(phase: "headers" | "body") {
  const seen: { signal: AbortSignal | undefined; started: () => void } = {
    signal: undefined,
    started: () => undefined,
  };
  const started = new Promise<void>((done) => (seen.started = done));
  const fetch: typeof globalThis.fetch = async (_input, init) => {
    seen.signal = init?.signal ?? undefined;
    if (phase === "headers") {
      seen.started();
      return new Promise<Response>(() => undefined);
    }
    // Headers arrive. The body is first read after that and never ends; it ignores the fetch's
    // signal, as a body handed over by another fetch implementation may.
    return new Response(
      new ReadableStream(
        {
          pull: () => {
            seen.started();
            return new Promise<void>(() => undefined);
          },
        },
        { highWaterMark: 0 },
      ),
    );
  };
  return { fetch, started, seen };
}

test.skipIf(asset === undefined).each(["headers", "body"] as const)(
  "pure: an interrupt while the download waits for its %s stops it at once and removes the download's work directory",
  async (phase) => {
    vi.stubEnv("CONVEX_BACKEND_BINARY", "");
    const cacheRoot = await scratch();
    const download = stalled(phase);
    const controller = new AbortController();
    const interrupt = new Error("Interrupted by SIGINT");
    const resolving = resolveExecutable({
      cacheRoot,
      fetch: download.fetch,
      signal: controller.signal,
    });
    await download.started;
    controller.abort(interrupt);
    const started = Date.now();
    await expect(resolving).rejects.toBe(interrupt);
    expect(Date.now() - started).toBeLessThan(1000);
    // The download itself was told to stop, not only abandoned.
    expect(download.seen.signal?.aborted).toBe(true);
    expect(
      await readdir(join(cacheRoot, pin.release, asset?.file ?? "")),
    ).toEqual([]);
  },
);

test.skipIf(asset === undefined)(
  "pure: an interrupt before resolution starts no download",
  async () => {
    vi.stubEnv("CONVEX_BACKEND_BINARY", "");
    const cacheRoot = await scratch();
    const fetch = vi.fn<typeof globalThis.fetch>();
    const controller = new AbortController();
    const interrupt = new Error("Interrupted by SIGTERM");
    controller.abort(interrupt);
    await expect(
      resolveExecutable({ cacheRoot, fetch, signal: controller.signal }),
    ).rejects.toBe(interrupt);
    expect(fetch).not.toHaveBeenCalled();
  },
);

// A source check: no pure test can make the scripts download cold. It fails when a script stops
// handing its interrupt to executable resolution.
test("pure: codegen and dev hand their interrupt to executable resolution", async () => {
  const source = (name: string) =>
    readFile(join(import.meta.dirname, "../../scripts", name), "utf8");
  expect(await source("codegen.mjs")).toContain(
    "resolveExecutable({ signal: controller.signal })",
  );
  expect(await source("dev.mjs")).toContain(
    "resolveExecutable: (signal) => resolveExecutable({ signal })",
  );
});
