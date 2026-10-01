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
export interface Executable {
  path: string;
  sha256: string;
  release: string | null;
  source: "cache" | "CONVEX_BACKEND_BINARY";
}
export interface ResolveOptions {
  cacheRoot?: string;
  fetch?: typeof globalThis.fetch;
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
export async function resolveExecutable(
  options: ResolveOptions = {},
): Promise<Executable> {
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
  await rm(path, { force: true });
  await mkdir(directory, { recursive: true });
  const work = await mkdtemp(join(directory, "download-"));
  try {
    const response = await (options.fetch ?? fetch)(
      `https://github.com/get-convex/convex-backend/releases/download/${pin.release}/${asset.file}`,
      { signal: AbortSignal.timeout(300000) },
    );
    if (!response.ok)
      throw new Error(
        `Backend download failed with status ${response.status}: ${asset.file}`,
      );
    const bytes = Buffer.from(await response.arrayBuffer());
    const zipSha256 = createHash("sha256").update(bytes).digest("hex");
    if (zipSha256 !== asset.zipSha256)
      throw new Error(
        `Backend download ${asset.file} has SHA-256 ${zipSha256}; harness/backend-release.json pins ${asset.zipSha256}`,
      );
    const zip = join(work, "backend.zip");
    await writeFile(zip, bytes);
    await runChild("unzip", "unzip", ["-q", zip, "-d", work], {
      timeoutMs: 60000,
    });
    const extracted = join(work, "convex-local-backend");
    const sha256 = await sha256OfFile(extracted);
    if (sha256 !== asset.executableSha256)
      throw new Error(
        `The executable inside ${asset.file} has SHA-256 ${sha256}; harness/backend-release.json pins ${asset.executableSha256}`,
      );
    await chmod(extracted, 0o755);
    // Rename within one directory, so no reader sees a partial file.
    const staged = join(directory, `staged-${randomUUID()}`);
    await rename(extracted, staged);
    await rename(staged, path);
    return pinned;
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}
