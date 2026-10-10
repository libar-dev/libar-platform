// Scans what a native run on a hosted deployment leaves, its captured log and its record, for any
// form of the deploy key before the continuous integration prints or uploads them:
// `node scripts/hosted-record-check.mjs <file>...`. It reads the key from HOSTED_DEPLOY_KEY in its
// own environment and never prints it. The forms are those of harness/hosted.ts: the whole key,
// its part after the |, and both URL-encoded.
// Exit 0: no form in any file. 1: a form in a file, which it names with the form's kind and not its
// value. 2: it cannot check: no key, no file named, or a file it cannot read.
import { readFileSync } from "node:fs";

const key = process.env.HOSTED_DEPLOY_KEY ?? "";
function cannot(reason) {
  console.log(`hosted record check: cannot check · ${reason}`);
  process.exit(2);
}
if (key === "") cannot("HOSTED_DEPLOY_KEY is not set");
const files = process.argv.slice(2);
if (files.length === 0) cannot("no file is named");
const secret = key.slice(key.indexOf("|") + 1);
const forms = [
  ["the whole key", key],
  ["its part after the |", secret],
  ["the whole key URL-encoded", encodeURIComponent(key)],
  ["its part after the | URL-encoded", encodeURIComponent(secret)],
].filter(([, form]) => form !== "");
let found = false;
for (const file of files) {
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch (error) {
    cannot(`${file} cannot be read: ${error.code ?? "unknown error"}`);
  }
  const held = forms.filter(([, form]) => text.includes(form));
  if (held.length === 0) continue;
  found = true;
  console.log(
    `hosted record check: ${file} holds ${held.map(([kind]) => kind).join(", ")}`,
  );
}
console.log(
  found
    ? "hosted record check: a form of the deploy key was found"
    : `hosted record check: no form of the deploy key in ${files.length} ${files.length === 1 ? "file" : "files"}`,
);
process.exit(found ? 1 : 0);
