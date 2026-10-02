import {
  codeAnchor,
  codeAnchorId,
  ref,
} from "@libar-dev/software-delivery-protocol";
import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { join, resolve } from "node:path";
import { runChild } from "./child.js";
const anchor = codeAnchor({
  id: codeAnchorId("impl:platform.native-harness.executable"),
  label: "the pinned backend executable",
  satisfies: ref("spec:platform.native-harness"),
});
void anchor;
export interface Executable {
  path: string;
  sha256: string;
  release: string | null;
  source: "cache" | "CONVEX_BACKEND_BINARY";
}
export interface ResolveOptions {
  cacheRoot?: string;
  fetch?: typeof globalThis.fetch;
  // Stops a download in progress; the call then rejects with the signal's reason.
  signal?: AbortSignal;
}
interface ReleasePin {
  release: string;
  assets: Record<
    string,
    { file: string; zipSha256: string; executableSha256: string }
  >;
}
const repositoryRoot = join(import.meta.dirname, "..");
export function sha256OfFile(path: string): Promise<string> {
  return new Promise((done, fail) => {
    const hash = createHash("sha256");
    createReadStream(path)
      .on("data", (chunk) => hash.update(chunk))
      .on("error", fail)
      .on("end", () => done(hash.digest("hex")));
  });
}
// Settles with the work, or rejects with the signal's reason as soon as it aborts. The work's own
// rejection is handled either way.
function untilAborted<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) {
    work.catch(() => undefined);
    return Promise.reject(signal.reason as Error);
  }
  return new Promise((done, fail) => {
    const stop = () => fail(signal.reason as Error);
    signal.addEventListener("abort", stop, { once: true });
    work.then(done, fail).finally(() => {
      signal.removeEventListener("abort", stop);
    });
  });
}
export async function resolveExecutable(
  options: ResolveOptions = {},
): Promise<Executable> {
  const stop = options.signal ?? new AbortController().signal;
  stop.throwIfAborted();
  const pin = JSON.parse(
    await readFile(join(import.meta.dirname, "backend-release.json"), "utf8"),
  ) as ReleasePin;
  const override = process.env.CONVEX_BACKEND_BINARY;
  if (override !== undefined && override !== "") {
    const path = resolve(override);
    const sha256 = await sha256OfFile(path).catch(() => {
      throw new Error(`CONVEX_BACKEND_BINARY names no readable file: ${path}`);
    });
    const pinned = Object.values(pin.assets).some(
      (asset) => asset.executableSha256 === sha256,
    );
    return {
      path,
      sha256,
      release: pinned ? pin.release : null,
      source: "CONVEX_BACKEND_BINARY",
    };
  }
  const asset = pin.assets[`${process.platform}-${process.arch}`];
  if (asset === undefined)
    throw new Error(
      `No backend release is pinned for ${process.platform}/${process.arch}. Set CONVEX_BACKEND_BINARY to a convex-local-backend executable.`,
    );
  const directory = join(
    options.cacheRoot ?? join(repositoryRoot, ".cache"),
    pin.release,
    asset.file,
  );
  const path = join(directory, "convex-local-backend");
  const pinned: Executable = {
    path,
    sha256: asset.executableSha256,
    release: pin.release,
    source: "cache",
  };
  // A cache entry is used only when its hash is the pinned one. Anything else is replaced.
  const cached = await sha256OfFile(path).catch(() => undefined);
  if (cached === asset.executableSha256) return pinned;
  stop.throwIfAborted();
  await mkdir(directory, { recursive: true });
  const work = await mkdtemp(join(directory, "download-"));
  try {
    // An interrupt while the directory was made; the finally removes it.
    stop.throwIfAborted();
    const response = await untilAborted(
      (options.fetch ?? fetch)(
        `https://github.com/get-convex/convex-backend/releases/download/${pin.release}/${asset.file}`,
        { signal: AbortSignal.any([stop, AbortSignal.timeout(300000)]) },
      ),
      stop,
    );
    if (!response.ok)
      throw new Error(
        `Backend download failed with status ${response.status}: ${asset.file}`,
      );
    const bytes = Buffer.from(await untilAborted(response.arrayBuffer(), stop));
    const zipSha256 = createHash("sha256").update(bytes).digest("hex");
    if (zipSha256 !== asset.zipSha256)
      throw new Error(
        `Backend download ${asset.file} has SHA-256 ${zipSha256}; harness/backend-release.json pins ${asset.zipSha256}`,
      );
    const zip = join(work, "backend.zip");
    await writeFile(zip, bytes);
    await runChild("unzip", "unzip", ["-q", zip, "-d", work], {
      timeoutMs: 60000,
      signal: stop,
    });
    const extracted = join(work, "convex-local-backend");
    const sha256 = await sha256OfFile(extracted);
    if (sha256 !== asset.executableSha256)
      throw new Error(
        `The executable inside ${asset.file} has SHA-256 ${sha256}; harness/backend-release.json pins ${asset.executableSha256}`,
      );
    await chmod(extracted, 0o755);
    stop.throwIfAborted();
    // Rename within one directory, so no reader sees a partial file.
    const staged = join(directory, `staged-${randomUUID()}`);
    await rename(extracted, staged);
    await rename(staged, path);
    return pinned;
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}
