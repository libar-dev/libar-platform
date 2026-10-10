import {
  createReader,
  type GraphSchema,
} from "@libar-dev/software-delivery-protocol";
import { readFile, readdir } from "node:fs/promises";
import { join, relative } from "node:path";
import { expect, test } from "vitest";

// The anchors as the source states them, read from the tree rather than from a list kept by hand.
// The comment form is a top-level /** … */ block with @sdpAnchor, @sdpSatisfies and @sdpReferences;
// the constant form, used under harness/, is a codeAnchor({ … }) call whose satisfies and references
// hold ref("spec:…") targets. The graph is the one `npm run sdp:build` derives before the tests run.
const root = join(import.meta.dirname, "../..");
const sourceRoots = ["src", "example", "fixture", "harness"];

type ScannedAnchor = { id: string; file: string; targets: string[] };

async function sourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(join(root, directory), { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory())
        return entry.name === "_generated" ? [] : sourceFiles(path);
      return /\.tsx?$/.test(entry.name) ? [path] : [];
    }),
  );
  return files.flat();
}

const list = (value: string | undefined): string[] =>
  value === undefined ? [] : value.split(",").map((item) => item.trim());

function commentAnchors(file: string, text: string): ScannedAnchor[] {
  const anchors: ScannedAnchor[] = [];
  for (const [block] of text.matchAll(/\/\*\*[\s\S]*?\*\//g)) {
    const tag = (name: string) =>
      new RegExp(`^\\s*\\*\\s*@${name}\\s+(.+?)\\s*$`, "m").exec(block)?.[1];
    const id = tag("sdpAnchor");
    if (id === undefined) continue;
    anchors.push({
      id,
      file,
      targets: [...list(tag("sdpSatisfies")), ...list(tag("sdpReferences"))],
    });
  }
  return anchors;
}

function constantAnchors(file: string, text: string): ScannedAnchor[] {
  const anchors: ScannedAnchor[] = [];
  for (const [call] of text.matchAll(/codeAnchor\(\{[\s\S]*?\n\}\);/g)) {
    const id = /codeAnchorId\("([^"]+)"\)/.exec(call)?.[1];
    if (id === undefined) continue;
    const field = (name: string) =>
      new RegExp(`${name}:\\s*(\\[[^\\]]*\\]|ref\\([^)]*\\))`).exec(call)?.[1];
    const targets = [field("satisfies"), field("references")].flatMap(
      (value) =>
        value === undefined
          ? []
          : [...value.matchAll(/ref\("([^"]+)"\)/g)].flatMap((match) =>
              match[1] === undefined ? [] : [match[1]],
            ),
    );
    anchors.push({ id, file, targets });
  }
  return anchors;
}

async function scanAnchors(): Promise<ScannedAnchor[]> {
  const files = (await Promise.all(sourceRoots.map(sourceFiles))).flat();
  const anchors = await Promise.all(
    files.map(async (path) => {
      const text = await readFile(join(root, path), "utf8");
      const file = relative(root, join(root, path));
      return [...commentAnchors(file, text), ...constantAnchors(file, text)];
    }),
  );
  return anchors.flat();
}

async function loadGraph(): Promise<GraphSchema> {
  return JSON.parse(
    await readFile(join(root, "generated/graph.json"), "utf8"),
  ) as GraphSchema;
}

test("pure: the scan of the source finds the code units the graph holds there", async () => {
  const graph = await loadGraph();
  const scanned = (await scanAnchors()).map(({ id, file }) => `${id} ${file}`);
  const derived = graph.nodes
    .filter(
      (node) =>
        node.nodeType === "CodeNode" &&
        sourceRoots.some((top) => node.file.startsWith(`${top}/`)),
    )
    .map((node) => `${node.id} ${node.file}`);
  expect(scanned.length).toBeGreaterThan(0);
  expect([...scanned].sort()).toEqual([...derived].sort());
});

test("pure: byFile answers for every anchored source file with its units and their Specs", async () => {
  const reader = createReader(await loadGraph());
  const missing = (await scanAnchors()).flatMap(({ id, file, targets }) => {
    const answer = reader.byFile(file);
    const ids = answer.nodes.map((node) => node.id);
    return [
      ...(ids.includes(id) ? [] : [`${file}: ${id}`]),
      ...targets
        .filter((target) => !answer.specs.includes(target))
        .map((target) => `${file}: ${id} → ${target}`),
    ];
  });
  expect(missing).toEqual([]);
});

test("pure: no implementation anchor sits in a test file", async () => {
  const graph = await loadGraph();
  expect(
    graph.nodes
      .filter(
        (node) =>
          node.nodeType === "CodeNode" && node.file.startsWith("tests/"),
      )
      .map((node) => node.id),
  ).toEqual([]);
});
