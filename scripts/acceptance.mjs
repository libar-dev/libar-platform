// Checks the rows the first experiment requires against one run's record:
// `npm run acceptance` reads the newest record under evidence/runs/, and
// `npm run acceptance -- <record>` reads the record the path names. It derives the graph first.
// Exit 0: passed. 1: a scenario failed or is absent, or the run did not pass or its tree was not
// clean. 3: nothing of that, and a scenario is missing. 2: the check cannot answer.
import { execFileSync } from "node:child_process";
import { registerHooks } from "node:module";
import { join } from "node:path";

// Node 24 runs the harness's TypeScript by stripping its types. The harness imports its own
// modules as ".js", which is what the compiler wants, so those resolve to the ".ts" files here.
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith(".") && specifier.endsWith(".js")) {
      try {
        return nextResolve(`${specifier.slice(0, -3)}.ts`, context);
      } catch {
        // A real .js file. Resolve it as written.
      }
    }
    return nextResolve(specifier, context);
  },
});

const root = join(import.meta.dirname, "..");
const { answerAcceptance } = await import("../harness/acceptance.ts");

try {
  // The build's own output goes to stderr, so that stdout is the check's answer alone.
  execFileSync(
    process.execPath,
    [
      join(
        root,
        "node_modules/@libar-dev/software-delivery-protocol/dist/cli/sdp.js",
      ),
      "build",
    ],
    { cwd: root, stdio: ["ignore", 2, 2] },
  );
} catch (error) {
  console.log(
    `acceptance: cannot answer · the graph does not derive: ${error.message}`,
  );
  process.exit(2);
}

const recordArgument = process.argv[2];
const answer = answerAcceptance({
  graph: join(root, "generated/graph.json"),
  runsDirectory: join(root, "evidence/runs"),
  ...(recordArgument === undefined ? {} : { recordPath: recordArgument }),
});
if (answer.record !== null) console.error(`Run record: ${answer.record}`);
console.log(answer.lines.join("\n"));
process.exitCode = answer.exit;
