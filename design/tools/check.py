#!/usr/bin/env python3
"""Session check for the design corpus. Run from anywhere: python3 design/tools/check.py

Exits 0 when the corpus, README.md and the review ledger agree; prints each failure and exits 1 otherwise.
SESSIONS.md says when to run it.
`python3 design/tools/check.py --slice S1` lists the findings a slice takes and exits. It reads the
ledger only and writes nothing, so a read-only job can run it.

The Protocol's root is the repository root: the graph holds the Specs under design/specs and the
test anchors that verify them, which live outside design/. Output goes to generated/ at the root.

The Protocol's CLI is the pinned dependency in the repository's package.json; run `npm ci` once.
The graph-side policy lives in design/rules/policy.js. The gate scans source addresses and
passes them, the prose-mention list and the decision register to `npx sdp validate --rules`.
Shipped recipe 42 checks platform context isolation with its own parameters. Filesystem,
document and ledger checks stay here. After validation, the gate publishes the generated
Studio and checks a second render against it, beside the committed Pack-page freshness check.
"""
import collections
import glob
import hashlib
import json
import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path

sys.dont_write_bytecode = True

from decisions import graph_recipe
from scan_addresses import address_sites

DESIGN = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ROOT = os.path.dirname(DESIGN)
with open(os.path.join(ROOT, "package.json"), encoding="utf-8") as package:
    PINNED = json.load(package)["devDependencies"]["@libar-dev/software-delivery-protocol"]
LEDGER_STATUSES = {"open", "fixed", "partially-fixed", "rejected", "owner"}

failures = []


def fail(msg):
    failures.append(msg)


def run(args):
    return subprocess.run(["npx", "sdp"] + args, capture_output=True, text=True, cwd=ROOT)


def main():
    failures.clear()
    if "--slice" in sys.argv:
        wanted = sys.argv[sys.argv.index("--slice") + 1]
        for item in json.loads(Path(DESIGN, "reviews", "consensus-ledger.json").read_text(encoding="utf-8"))["ledger"]:
            if item.get("slice") == wanted and item["status"] in ("open", "partially-fixed", "owner"):
                print(f"{item['id']} | {item['severity']} | {item['status']} | caught by: {item.get('detector', '?')} | {', '.join(item['files'])}")
        sys.exit(0)


    # Scan files before validation; rules files read only graph data and their parameters.
    try:
        sites = address_sites(ROOT)
    except (OSError, ValueError) as error:
        fail(f"the address scan failed: {error}")
        sites = []
    with tempfile.TemporaryDirectory(prefix="platform-rules-") as temporary:
        scanned = os.path.join(temporary, "address-sites.json")
        Path(scanned).write_text(json.dumps(sites), encoding="utf-8")
        out = run(["validate", ".", "--rules", "design/rules/policy.js",
                   "--params", "intended=@design/tools/prose-mentions.json",
                   "--params", "register=@design/decisions/register.json",
                   "--params", "addressSites=@" + scanned,
                   "--rules", "node_modules/@libar-dev/software-delivery-protocol/dist/recipes/42-the-architecture-walk.js",
                   "--params", '{"isolated":["platform"]}'])
    text = out.stdout + out.stderr
    print(text.rstrip())
    graph = re.search(r"(\d+) specs · (\d+) packs · (\d+) anchors → (\d+) nodes · (\d+) edges", text)
    verdict = re.search(r"validate: (\d+) errors · (\d+) warnings", text)
    if out.returncode:
        fail(f"sdp validate with corpus rules exited {out.returncode}")
    if not graph or not verdict:
        fail("validate printed no summary line; run `npm ci` at the repository root, then `npx sdp --version`")
        print("\n".join(failures))
        sys.exit(1)
    n_specs, n_packs, n_anchors, n_nodes, n_edges = (int(x) for x in graph.groups())
    n_warnings = int(verdict.group(2))

    # validate invalidates projection roots. Build Studio before checking its repeated render.
    studio_current = True
    for args in (["studio"], ["studio", "--check-clean"]):
        result = run(args)
        if result.returncode:
            studio_current = False
            print((result.stdout + result.stderr).rstrip())
            fail(f"sdp {' '.join(args)} exited {result.returncode}")

    # 1d. The architecture the code anchors state, as the Protocol's roles-and-layers recipe reads it.
    # The values are free (a layer is one of five); this line reports them and judges none.
    structure = None
    try:
        answer = graph_recipe(28, ROOT)
        taxonomy = lambda rows: ", ".join(f"{row['value']} {len(row['units'])}" for row in rows) or "none"
        totals = answer["totals"]
        structure = (f"{totals['codeUnits']} code units; roles: {taxonomy(answer['roles'])}; "
                     f"layers: {taxonomy(answer['layers'])}; contexts: {taxonomy(answer['contexts'])}; "
                     f"{totals['references']} references edges from {totals['referencingUnits']} units")
    except (ValueError, KeyError) as error:
        fail(f"the roles-and-layers recipe did not answer: {str(error)[:200]}")

    # 2. Read the Specs.
    readiness = collections.Counter()
    question_graph = graph_recipe(20)
    questions = {spec["id"]: [q["question"] for q in spec["questions"]] for spec in question_graph["specs"]}
    n_blocking = question_graph["totals"]["blocking"]
    cited_extensions = set()
    for path in sorted(glob.glob(os.path.join(DESIGN, "specs", "**", "*.sdp.md"), recursive=True)):
        if path.endswith(".pack.sdp.md"):
            continue
        raw = Path(path).read_text(encoding="utf-8")
        front = raw.split("\n---\n", 1)[0]
        stated = re.search(r"^readiness: (\w+)", front, re.M).group(1)
        readiness[stated] += 1
        cited_extensions |= set(re.findall(r"\bE-(\d+)\b", raw))

    # 3. README.md against the Specs.
    readme = Path(DESIGN, "README.md").read_text(encoding="utf-8")
    expected_line = f"{n_specs} specs · {n_packs} packs · {n_anchors} anchors → {n_nodes} nodes · {n_edges} edges (0 errors, 0 warnings)"
    if expected_line not in readme:
        fail("README's expected validate output is stale; it should read: " + expected_line)
    if f"validate: 0 errors · {n_warnings} warnings" not in readme:
        fail(f"README's expected validate verdict is stale; it should read 0 errors and {n_warnings} warnings, each a listed prose mention")
    registered = set(re.findall(r"^\| E-(\d+) \|", readme, re.M))
    if cited_extensions - registered:
        fail(f"extensions cited in Specs but missing from README's register: E-{sorted(cited_extensions - registered, key=int)}")
    if registered - cited_extensions:
        fail(f"extensions registered in README but cited by no Spec: E-{sorted(registered - cited_extensions, key=int)}")
    n_questions = sum(len(v) for v in questions.values())
    for link in re.findall(r"\]\(([^)#]+)\)", readme):
        if not link.startswith("http") and not os.path.exists(os.path.join(DESIGN, link)):
            fail(f"README link does not resolve: {link}")

    # 4. The review ledger.
    ledger = json.loads(Path(DESIGN, "reviews", "consensus-ledger.json").read_text(encoding="utf-8"))["ledger"]
    by_status = collections.Counter()
    for item in ledger:
        if item["status"] not in LEDGER_STATUSES:
            fail(f"ledger item {item['id']} has status {item['status']!r}; allowed: {sorted(LEDGER_STATUSES)}")
        by_status[item["status"]] += 1

    by_slice = collections.Counter(item.get("slice", "none") for item in ledger if item["status"] == "open")

    # 5. Each Pack page is what the tree generates. The page design/pages/<name>.md is the page of pack:<name>,
    # and the generator's --check names the first line that differs. PACK_PAGES is the list of pages the corpus
    # keeps, so a page deleted by mistake fails here instead of leaving nothing to check.
    PACK_PAGES = ("history-view",)
    for path in sorted(glob.glob(os.path.join(DESIGN, "pages", "*.md"))):
        if os.path.splitext(os.path.basename(path))[0] not in PACK_PAGES:
            fail(f"{os.path.relpath(path, ROOT)} is not in PACK_PAGES")
    stale_pages = 0
    for name in PACK_PAGES:
        path = os.path.join(DESIGN, "pages", name + ".md")
        out = subprocess.run(
            ["node", os.path.join(ROOT, "scripts", "pack-page.mjs"), "--pack", f"pack:{name}", "--out", os.path.relpath(path, ROOT), "--check"],
            capture_output=True, text=True, cwd=ROOT,
        )
        if out.returncode != 0:
            stale_pages += 1
            message = (out.stderr + out.stdout).strip().splitlines()
            fail(message[0] if message else f"scripts/pack-page.mjs exited {out.returncode} on {os.path.relpath(path, ROOT)}")

    digest = hashlib.sha256()
    tracked = sorted(glob.glob(os.path.join(DESIGN, "specs", "**", "*.sdp.md"), recursive=True))
    tracked += [os.path.join(DESIGN, name) for name in ("README.md", "PLAN.md", "SESSIONS.md", "reviews/consensus-ledger.json", "tools/prose-mentions.json")]
    for path in tracked:
        digest.update(os.path.relpath(path, DESIGN).encode())
        digest.update(Path(path).read_bytes())

    print(expected_line)
    print(f"entry addresses outside the Specs: {len(sites)}; graph policy and platform isolation: corpus rules")
    print(f"architecture: {structure}")
    print(f"open questions: {len(questions)} Specs, {n_questions} questions, {n_blocking} blocking; extensions registered: {len(registered)}")
    print(f"stated readiness: {dict(sorted(readiness.items()))}")
    print(f"ledger: {len(ledger)} findings, {dict(sorted(by_status.items()))}")
    print(f"open findings by slice: {dict(sorted(by_slice.items()))}")
    print(f"corpus digest: {digest.hexdigest()[:16]}")
    print(f"Pack pages current: {len(PACK_PAGES) - stale_pages} of {len(PACK_PAGES)}")
    print(f"Studio deterministic: {studio_current}")
    print(f"protocol: {PINNED}")
    if failures:
        print(f"\nFAIL ({len(failures)}):")
        for message in failures:
            print(" - " + message)
        sys.exit(1)
    print("\nOK")


if __name__ == "__main__":
    main()
