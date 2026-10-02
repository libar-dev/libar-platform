import { readFile } from "node:fs/promises";
// ZIP central-directory names need no decompressor or external executable.
export async function archiveEntries(path: string): Promise<string[]> {
  const bytes = await readFile(path);
  let end = bytes.length - 22;
  for (; end >= Math.max(0, bytes.length - 65557); end--) {
    if (
      bytes.readUInt32LE(end) === 0x06054b50 &&
      end + 22 + bytes.readUInt16LE(end + 20) === bytes.length
    )
      break;
  }
  if (end < 0 || bytes.readUInt32LE(end) !== 0x06054b50)
    throw new Error("ZIP end record missing");
  const count = bytes.readUInt16LE(end + 10);
  let cursor = bytes.readUInt32LE(end + 16);
  if (count === 65535 || cursor === 0xffffffff)
    throw new Error("ZIP64 directory not supported");
  const entries: string[] = [];
  for (let i = 0; i < count; i++) {
    if (bytes.readUInt32LE(cursor) !== 0x02014b50)
      throw new Error("ZIP directory entry missing");
    const length = bytes.readUInt16LE(cursor + 28);
    entries.push(
      bytes.subarray(cursor + 46, cursor + 46 + length).toString("utf8"),
    );
    cursor +=
      46 +
      length +
      bytes.readUInt16LE(cursor + 30) +
      bytes.readUInt16LE(cursor + 32);
  }
  return entries;
}
