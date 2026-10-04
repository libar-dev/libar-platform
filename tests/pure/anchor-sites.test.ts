import type {
  CodeNode,
  GraphSchema,
} from "@libar-dev/software-delivery-protocol";
import { statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, test } from "vitest";

// design/tools/anchor-sites.json names, for every implementation anchor whose site is a file under
// tests/, the source files it stands for: the code it binds is bundled into a deployment and carries
// no Protocol import, so a test carries the anchor for it. The anchors are read from the graph that
// `npm run sdp:build` derives before the tests run, as the harness rules read it.
type AnchorSites = { anchors: { anchor: string; sources: string[] }[] };

const root = join(import.meta.dirname, "../..");

function isFile(path: string): boolean {
  try {
    return statSync(join(root, path)).isFile();
  } catch {
    return false;
  }
}

// What keeps the list from being the true one: an anchor under tests/ it misses, an anchor it lists
// that is not under tests/, an anchor it lists twice, or a source that is not a file of the repository.
function anchorSiteGaps(
  nodes: GraphSchema["nodes"],
  sites: AnchorSites,
  fileExists: (path: string) => boolean,
): string[] {
  const anchors = nodes.filter(
    (node): node is CodeNode => node.nodeType === "CodeNode",
  );
  const underTests = new Set(
    anchors
      .filter((node) => node.file.startsWith("tests/"))
      .map((node) => node.id),
  );
  const listed = sites.anchors.map((site) => site.anchor);
  const gaps: string[] = [];
  for (const id of [...underTests].sort())
    if (!listed.includes(id))
      gaps.push(`${id} sits under tests/ and is not listed`);
  for (const id of new Set(listed)) {
    if (!underTests.has(id))
      gaps.push(`${id} is listed and is no implementation anchor under tests/`);
    if (listed.filter((other) => other === id).length > 1)
      gaps.push(`${id} is listed twice`);
  }
  for (const site of sites.anchors) {
    if (site.sources.length === 0) gaps.push(`${site.anchor} names no source`);
    for (const source of site.sources)
      if (!fileExists(source))
        gaps.push(`${site.anchor} names ${source}, which is not a file`);
  }
  return gaps;
}

test("pure: every implementation anchor under tests/ is listed once in design/tools/anchor-sites.json, with sources that are files", async () => {
  const graph = JSON.parse(
    await readFile(join(root, "generated/graph.json"), "utf8"),
  ) as GraphSchema;
  const sites = JSON.parse(
    await readFile(join(root, "design/tools/anchor-sites.json"), "utf8"),
  ) as AnchorSites;
  expect(sites.anchors.length).toBeGreaterThan(0);
  expect(anchorSiteGaps(graph.nodes, sites, isFile)).toEqual([]);
});

test("pure: the anchor sites check refuses a missing anchor, an anchor elsewhere, an anchor listed twice and a source that is no file", () => {
  const node = (id: string, file: string) =>
    ({ id, nodeType: "CodeNode", claim: "anchored", file }) as CodeNode;
  const nodes = [
    node("impl:a.listed", "tests/pure/a.test.ts"),
    node("impl:a.missing", "tests/pure/b.test.ts"),
    node("impl:a.harness", "harness/native.ts"),
  ];
  const files = new Set(["src/a.ts"]);
  expect(
    anchorSiteGaps(
      nodes,
      {
        anchors: [
          { anchor: "impl:a.listed", sources: ["src/a.ts", "src/gone.ts"] },
          { anchor: "impl:a.listed", sources: ["src/a.ts"] },
          { anchor: "impl:a.harness", sources: ["src"] },
        ],
      },
      (path) => files.has(path),
    ),
  ).toEqual([
    "impl:a.missing sits under tests/ and is not listed",
    "impl:a.listed is listed twice",
    "impl:a.harness is listed and is no implementation anchor under tests/",
    "impl:a.listed names src/gone.ts, which is not a file",
    "impl:a.harness names src, which is not a file",
  ]);
  expect(
    anchorSiteGaps(nodes.slice(0, 1), { anchors: [] }, () => true),
  ).toEqual(["impl:a.listed sits under tests/ and is not listed"]);
  expect(
    anchorSiteGaps(
      nodes.slice(0, 1),
      { anchors: [{ anchor: "impl:a.listed", sources: [] }] },
      () => true,
    ),
  ).toEqual(["impl:a.listed names no source"]);
  expect(isFile("src/read-model/rebuild.ts")).toBe(true);
  expect(isFile("src/read-model")).toBe(false);
});
