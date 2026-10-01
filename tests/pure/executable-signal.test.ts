import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ts from "typescript";
import { afterEach, expect, onTestFinished, test, vi } from "vitest";
vi.mock("node:fs/promises", async (original) => {
  const fs = await original<typeof import("node:fs/promises")>();
  return { ...fs, mkdtemp: vi.fn(fs.mkdtemp) };
});
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

// No pure test can make the scripts download cold, so this reads their source. It parses it, so a
// comment does not count, and compares each call to resolveExecutable, and in dev the step that
// makes it, as printed without comments.
async function resolutionCalls(name: string): Promise<string[]> {
  const file = join(import.meta.dirname, "../../scripts", name);
  const source = ts.createSourceFile(
    file,
    await readFile(file, "utf8"),
    ts.ScriptTarget.Latest,
    true,
  );
  const printer = ts.createPrinter({ removeComments: true });
  const found: string[] = [];
  const visit = (node: ts.Node) => {
    if (
      (ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === "resolveExecutable") ||
      (ts.isPropertyAssignment(node) &&
        ts.isIdentifier(node.name) &&
        node.name.text === "resolveExecutable")
    )
      found.push(printer.printNode(ts.EmitHint.Unspecified, node, source));
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}
test("pure: reading their source, codegen and dev hand their interrupt to executable resolution", async () => {
  expect(await resolutionCalls("codegen.mjs")).toEqual([
    "resolveExecutable({ signal: controller.signal })",
  ]);
  expect(await resolutionCalls("dev.mjs")).toEqual([
    "resolveExecutable: (signal) => resolveExecutable({ signal })",
    "resolveExecutable({ signal })",
  ]);
});

// Collects the unhandled rejections of one test, after letting the event loop turn.
async function unhandledDuring(run: () => Promise<void>): Promise<unknown[]> {
  const unhandled: unknown[] = [];
  const keep = (reason: unknown) => unhandled.push(reason);
  process.on("unhandledRejection", keep);
  try {
    await run();
    await new Promise((done) => setTimeout(done, 50));
  } finally {
    process.off("unhandledRejection", keep);
  }
  return unhandled;
}
// Like fetch, it rejects with the reason of a signal that is already aborted.
const fetchLike: typeof globalThis.fetch = async (_input, init) => {
  init?.signal?.throwIfAborted();
  return new Promise<Response>(() => undefined);
};

test.skipIf(asset === undefined)(
  "pure: an interrupt while the download directory is made ends in the interrupt, the directory removed and no unhandled rejection",
  async () => {
    vi.stubEnv("CONVEX_BACKEND_BINARY", "");
    const cacheRoot = await scratch();
    const controller = new AbortController();
    const interrupt = new Error("Interrupted by SIGINT");
    const actual = (
      await vi.importActual<typeof import("node:fs/promises")>(
        "node:fs/promises",
      )
    ).mkdtemp;
    vi.mocked(mkdtemp).mockImplementationOnce(async (prefix) => {
      const made = await actual(prefix as string);
      controller.abort(interrupt);
      return made;
    });
    const unhandled = await unhandledDuring(async () => {
      await expect(
        resolveExecutable({
          cacheRoot,
          fetch: fetchLike,
          signal: controller.signal,
        }),
      ).rejects.toBe(interrupt);
    });
    expect(unhandled).toEqual([]);
    expect(
      await readdir(join(cacheRoot, pin.release, asset?.file ?? "")),
    ).toEqual([]);
  },
);

test.skipIf(asset === undefined)(
  "pure: an interrupt as the download starts ends in the interrupt with the download's own rejection handled",
  async () => {
    vi.stubEnv("CONVEX_BACKEND_BINARY", "");
    const cacheRoot = await scratch();
    const controller = new AbortController();
    const interrupt = new Error("Interrupted by SIGTERM");
    const fetch: typeof globalThis.fetch = (input, init) => {
      controller.abort(interrupt);
      return fetchLike(input, init);
    };
    const unhandled = await unhandledDuring(async () => {
      await expect(
        resolveExecutable({ cacheRoot, fetch, signal: controller.signal }),
      ).rejects.toBe(interrupt);
    });
    expect(unhandled).toEqual([]);
    expect(
      await readdir(join(cacheRoot, pin.release, asset?.file ?? "")),
    ).toEqual([]);
  },
);
