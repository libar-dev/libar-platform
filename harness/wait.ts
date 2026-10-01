import { setTimeout as delay } from "node:timers/promises";
export async function waitUntil(
  description: string,
  condition: () => boolean | Promise<boolean>,
  timeoutMs = 5000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await condition()) return;
    await delay(10);
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
