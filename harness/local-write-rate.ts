import {
  codeAnchor,
  codeAnchorId,
  ref,
} from "@libar-dev/software-delivery-protocol";
import { setTimeout as sleep } from "node:timers/promises";
const anchor = codeAnchor({
  id: codeAnchorId("impl:platform.native-harness.local-write-rate"),
  label: "pacing under the local write rate",
  satisfies: ref("spec:platform.native-harness"),
});
void anchor;
export const localWriteRateBytesPerSecond = 4 * 1024 * 1024;
export async function paceAfterWrite(bytesWritten: number): Promise<void> {
  await sleep(
    Math.ceil((bytesWritten / localWriteRateBytesPerSecond) * 1000 * 1.25),
  );
}
