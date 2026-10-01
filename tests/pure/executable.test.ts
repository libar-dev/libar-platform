import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, onTestFinished, test, vi } from "vitest";
import { resolveExecutable, sha256OfFile } from "../../harness/executable.js";
interface ReleasePin {
  release: string;
  assets: Record<string, { file: string; executableSha256: string }>;
}
async function scratch(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "libar-executable-"));
  onTestFinished(() => rm(directory, { recursive: true, force: true }));
  return directory;
}
const pin = JSON.parse(
  await readFile(
    join(import.meta.dirname, "../../harness/backend-release.json"),
    "utf8",
  ),
) as ReleasePin;
const asset = pin.assets[`${process.platform}-${process.arch}`];
afterEach(() => vi.unstubAllEnvs());
test("pure: an executable named by CONVEX_BACKEND_BINARY whose hash is not pinned is recorded by its hash and with no release", async () => {
  const path = join(await scratch(), "some-backend");
  await writeFile(path, "not the pinned executable");
  vi.stubEnv("CONVEX_BACKEND_BINARY", path);
  expect(await resolveExecutable()).toEqual({
    path,
    sha256: await sha256OfFile(path),
    release: null,
    source: "CONVEX_BACKEND_BINARY",
  });
});
test("pure: CONVEX_BACKEND_BINARY that names no file fails", async () => {
  vi.stubEnv("CONVEX_BACKEND_BINARY", "/no/such/backend");
  await expect(resolveExecutable()).rejects.toThrow(
    "CONVEX_BACKEND_BINARY names no readable file: /no/such/backend",
  );
});
test.skipIf(asset === undefined)(
  "pure: a cache entry whose hash is not the pinned one is removed and downloaded again",
  async () => {
    vi.stubEnv("CONVEX_BACKEND_BINARY", "");
    const cacheRoot = await scratch();
    const directory = join(cacheRoot, pin.release, asset?.file ?? "");
    const cached = join(directory, "convex-local-backend");
    await mkdir(directory, { recursive: true });
    await writeFile(cached, "a damaged executable");
    const requested: string[] = [];
    const refuse: typeof fetch = async (input) => {
      requested.push(String(input));
      return new Response("", { status: 404 });
    };
    await expect(
      resolveExecutable({ cacheRoot, fetch: refuse }),
    ).rejects.toThrow("Backend download failed with status 404");
    expect(requested).toEqual([
      `https://github.com/get-convex/convex-backend/releases/download/${pin.release}/${asset?.file}`,
    ]);
    await expect(stat(cached)).rejects.toThrow();
  },
);
