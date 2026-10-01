import { setTimeout as sleep } from "node:timers/promises";
export const localWriteRateBytesPerSecond = 4 * 1024 * 1024;
export async function paceAfterWrite(bytesWritten: number): Promise<void> {
  await sleep(
    Math.ceil((bytesWritten / localWriteRateBytesPerSecond) * 1000 * 1.25),
  );
}
