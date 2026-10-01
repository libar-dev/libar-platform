import { setTimeout as sleep } from "node:timers/promises";
export const localWriteRateBytesPerSecond = 4 * 1024 * 1024;
export async function waitUntil(
  description: string,
  condition: () => boolean | Promise<boolean>,
  timeoutMs = 5000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await condition()) return;
    await sleep(10);
  }
  throw new Error(`Timed out after ${timeoutMs} ms waiting for ${description}`);
}
export async function within<T>(
  promise: Promise<T>,
  description: string,
  timeoutMs = 10000,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () =>
            reject(
              new Error(
                `Timed out after ${timeoutMs} ms waiting for ${description}`,
              ),
            ),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
export async function paceAfterWrite(bytesWritten: number): Promise<void> {
  await sleep(
    Math.ceil((bytesWritten / localWriteRateBytesPerSecond) * 1000 * 1.25),
  );
}
