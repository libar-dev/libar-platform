#!/usr/bin/env python3
"""Session check for the design corpus. Run from anywhere: python3 design/tools/check.py

Exits 0 when the corpus, README.md and the review ledger agree; prints each failure and exits 1 otherwise.
SESSIONS.md says when to run it.
`python3 design/tools/check.py --slice S1` lists the findings a slice takes and exits. It reads the
ledger only and writes nothing, so a read-only job can run it.

The Protocol's root is the repository root: the graph holds the Specs under design/specs and the
test anchors that verify them, which live outside design/. Output goes to generated/ at the root.

The Protocol's CLI is the pinned dependency in the repository's package.json; run `npm ci` once.
What `sdp validate` checks is the Protocol's. What this script adds is this project's policy:
citations carry edges, extensions are registered, nobody but the owner states `ready`, a prose
mention with no relation is listed with its reason, and an entry address outside the Specs resolves.
"""
import collections
import glob
import hashlib
import json
import os
import re
import subprocess
import sys

DESIGN = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ROOT = os.path.dirname(DESIGN)
PACKAGE = os.path.join(ROOT, "node_modules", "@libar-dev", "software-delivery-protocol")
SDP = os.environ.get("SDP", os.path.join(PACKAGE, "dist", "cli", "sdp.js"))
PINNED = json.load(open(os.path.join(ROOT, "package.json"), encoding="utf-8"))["devDependencies"]["@libar-dev/software-delivery-protocol"]
READINESS_DIVERGENCE = (
    'const rungs = ["idea", "scoped", "defined", "ready"];'
    " const rank = (r) => (r === undefined ? -1 : rungs.indexOf(r));"
    " return g.specs().filter((s) => rank(s.derivedReadiness) < rank(s.statedReadiness)).map((s) => s.id)"
)
GRAPH_FACTS = (
    'return { mentions: report.findings.filter((f) => f.validatorId === "conformance/prose-mentions")'
    ".map((f) => [f.subjectId, f.relatedId, f.path]),"
    " keys: Object.fromEntries(g.specs().map((s) => { const sections = g.specContext(s.id)?.sections ?? {};"
    " return [s.id, { design: Object.keys(sections.design ?? {}), ui: Object.keys(sections.ui ?? {}) }]; })) }"
)
PROSE_MENTIONS = os.path.join(DESIGN, "tools", "prose-mentions.json")
# An entry address, spec:<id>#design.<key> or #ui.<key>, as the Protocol's checked-mentions record rules it.
ADDRESS = re.compile(r"spec:[a-z][a-z0-9-]*(?:\.[A-Za-z0-9][A-Za-z0-9-]*)+#(?:design|ui)\.[A-Za-z0-9_]*")
ADDRESS_KEY = re.compile(r"^[a-z][A-Za-z0-9]*$")
# Where an address outside the Specs lives: the code, the tests, the register, the ledger and the work documents.
# The Protocol checks an address inside a Spec's prose; nothing checks these unless this script does.
ADDRESS_SOURCES = ("src", "fixture", "example", "harness", "tests", "scripts")
ADDRESS_RECORDS = ("decisions/register.json", "reviews/consensus-ledger.json", "STATE.md", "ROADMAP.md", "README.md", "PLAN.md", "SESSIONS.md")
TYPED_SECTIONS = {"Behavior", "Workflow", "Rule", "Contract", "Design", "Decision", "Constraints", "Constraint", "Model"}
LEDGER_STATUSES = {"open", "fixed", "partially-fixed", "rejected", "owner"}

failures = []


def fail(msg):
    failures.append(msg)


def run(args):
    return subprocess.run(["node", SDP] + args, capture_output=True, text=True, cwd=ROOT)


if "--slice" in sys.argv:
    wanted = sys.argv[sys.argv.index("--slice") + 1]
    for item in json.load(open(os.path.join(DESIGN, "reviews", "consensus-ledger.json"), encoding="utf-8"))["ledger"]:
        if item.get("slice") == wanted and item["status"] in ("open", "partially-fixed", "owner"):
            print(f"{item['id']} | {item['severity']} | {item['status']} | caught by: {item.get('detector', '?')} | {', '.join(item['files'])}")
    sys.exit(0)


# 1. The graph: validate and readiness divergence.
out = run(["validate", "."])
text = out.stdout + out.stderr
graph = re.search(r"(\d+) specs · (\d+) packs · (\d+) anchors → (\d+) nodes · (\d+) edges", text)
verdict = re.search(r"validate: (\d+) errors · (\d+) warnings", text)
if not graph or not verdict:
    fail("validate printed no summary line; run `npm ci` at the repository root, then check " + SDP)
    print("\n".join(failures))
    sys.exit(1)
n_specs, n_packs, n_anchors, n_nodes, n_edges = (int(x) for x in graph.groups())
n_errors, n_warnings = (int(x) for x in verdict.groups())
warnings = [l for l in text.splitlines() if "[warning]" in l and "conformance/prose-mentions" not in l]
if n_errors:
    fail(f"validate: {n_errors} errors")

out = run(["q", GRAPH_FACTS, "--root", ".", "--json"])
try:
    facts = json.loads(out.stdout)
except ValueError:
    facts = None
    fail("the graph facts query did not return JSON")

# 1a. A prose mention with no declared relation is lawful when no typed relation fits; the pair is listed
# with its reason. A new pair fails until it gets a relation or a line, and a listed pair that stopped warning goes.
listed = {(p["from"], p["to"]): p["reason"] for p in json.load(open(PROSE_MENTIONS, encoding="utf-8"))["pairs"]}
warned = {(m[0], m[1]): m[2] for m in facts["mentions"]} if facts else {}
for (source, target), path in sorted(warned.items()):
    if (source, target) not in listed:
        fail(f"{source} mentions {target} at {path} with no relation: declare the relation that fits, or list the pair with its reason in design/tools/prose-mentions.json")
for source, target in sorted(set(listed) - set(warned)):
    fail(f"{source} → {target} is listed in design/tools/prose-mentions.json and no longer warns; remove the line")
for (source, target), reason in sorted(listed.items()):
    if not reason.strip():
        fail(f"{source} → {target} is listed in design/tools/prose-mentions.json with no reason")
if n_warnings != len(warned):
    fail(f"validate: {n_warnings - len(warned)} warnings other than prose mentions, first: {(warnings or ['not printed'])[0][:200]}")

# 1b. Entry addresses outside the Specs resolve: the Spec exists and its Design or UI section holds the key.
addresses = 0
if facts:
    files = [p for top in ADDRESS_SOURCES for ext in ("ts", "tsx", "mjs") for p in glob.glob(os.path.join(ROOT, top, "**", f"*.{ext}"), recursive=True)]
    files = [p for p in files if "_generated" not in p and not p.endswith(".test.generated.ts")]
    files += [os.path.join(DESIGN, name) for name in ADDRESS_RECORDS]
    for path in sorted(files):
        for number, line in enumerate(open(path, encoding="utf-8"), 1):
            for token in ADDRESS.findall(line):
                addresses += 1
                spec_id, entry = token.split("#", 1)
                section, key = entry.split(".", 1)
                where = f"{os.path.relpath(path, ROOT)}:{number}"
                if not ADDRESS_KEY.match(key) or key == "description":
                    fail(f"entry address {token} at {where} has a key outside the address grammar")
                elif spec_id not in facts["keys"]:
                    fail(f"entry address {token} at {where} names no Spec")
                elif key not in facts["keys"][spec_id][section]:
                    fail(f"entry address {token} at {where}: {spec_id} has no {section} entry {key}")

out = run(["q", READINESS_DIVERGENCE, "--root", ".", "--json"])
try:
    diverging = json.loads(out.stdout.strip().splitlines()[-1])
except (ValueError, IndexError):
    diverging = None
if diverging is None:
    fail("readiness divergence query did not return JSON")
elif diverging:
    fail(f"stated readiness not earned by: {diverging}")

# 2. Read the Specs.
kinds = collections.Counter()
readiness = collections.Counter()
questions = {}
cited_extensions = set()
edge_gaps = []
for path in sorted(glob.glob(os.path.join(DESIGN, "specs", "**", "*.sdp.md"), recursive=True)):
    if path.endswith(".pack.sdp.md"):
        continue
    raw = open(path, encoding="utf-8").read()
    front, body = raw.split("\n---\n", 1)
    sid = re.search(r"^id: (\S+)", front, re.M).group(1)
    kind = re.search(r"^kind: (\w+)", front, re.M).group(1)
    kinds[kind] += 1
    stated = re.search(r"^readiness: (\w+)", front, re.M).group(1)
    readiness[stated] += 1
    if stated == "ready":
        fail(f"{sid} states ready; only the owner states it, and STATE.md must record the ruling")
    cited_extensions |= set(re.findall(r"\bE-(\d+)\b", raw))
    block = re.search(r"constrainedBy:(.*?)(?=\n  [a-zA-Z]+:|\Z)", front, re.S)
    block = block.group(1) if block else ""
    linked_laws = {int(x) for x in re.findall(r"laws\.law(\d+)", block)}
    linked_facts = {int(x) for x in re.findall(r"facts\.f(\d+)", block)}
    section, cited_laws, cited_facts = None, set(), set()
    for line in body.split("\n"):
        heading = re.match(r"^#{2,3} (\S+)", line)
        if heading:
            section = heading.group(1)
            continue
        if section in TYPED_SECTIONS and line.startswith("- "):
            cited_laws |= {int(x) for x in re.findall(r"\bLaw (\d+)", line)}
            cited_facts |= {int(x) for x in re.findall(r"\bF(\d+)\b", line)}
        if section == "Open" and line.startswith("- ["):
            questions.setdefault(sid, []).append(line)
            if line.startswith("- [blocking]") and stated != "scoped":
                fail(f"{sid} carries a blocking question and states {stated}")
    family = sid.split(":")[1].split(".")[0]
    exempt = kind in ("decision", "example") or family in ("laws", "facts") or sid == "spec:platform.vocabulary"
    missing_laws, missing_facts = cited_laws - linked_laws, cited_facts - linked_facts
    if not exempt and (missing_laws or missing_facts):
        edge_gaps.append(f"{sid}: laws {sorted(missing_laws)} facts {sorted(missing_facts)}")
for gap in edge_gaps:
    fail("cited without a constrainedBy edge (rubric 16): " + gap)

# 3. README.md against the Specs.
readme = open(os.path.join(DESIGN, "README.md"), encoding="utf-8").read()
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
n_blocking = sum(1 for v in questions.values() for line in v if line.startswith("- [blocking]"))
for link in re.findall(r"\]\(([^)#]+)\)", readme):
    if not link.startswith("http") and not os.path.exists(os.path.join(DESIGN, link)):
        fail(f"README link does not resolve: {link}")

# 4. The review ledger.
ledger = json.load(open(os.path.join(DESIGN, "reviews", "consensus-ledger.json"), encoding="utf-8"))["ledger"]
by_status = collections.Counter()
for item in ledger:
    if item["status"] not in LEDGER_STATUSES:
        fail(f"ledger item {item['id']} has status {item['status']!r}; allowed: {sorted(LEDGER_STATUSES)}")
    by_status[item["status"]] += 1

by_slice = collections.Counter(item.get("slice", "none") for item in ledger if item["status"] == "open")

digest = hashlib.sha256()
tracked = sorted(glob.glob(os.path.join(DESIGN, "specs", "**", "*.sdp.md"), recursive=True))
tracked += [os.path.join(DESIGN, name) for name in ("README.md", "PLAN.md", "SESSIONS.md", "reviews/consensus-ledger.json", "tools/prose-mentions.json")]
for path in tracked:
    digest.update(os.path.relpath(path, DESIGN).encode())
    digest.update(open(path, "rb").read())

print(expected_line)
print(f"validate: {n_errors} errors · {n_warnings} warnings, {len(listed)} prose mentions listed; readiness divergence: {diverging}")
print(f"entry addresses outside the Specs: {addresses}")
print(f"open questions: {len(questions)} Specs, {n_questions} questions, {n_blocking} blocking; extensions registered: {len(registered)}")
print(f"stated readiness: {dict(sorted(readiness.items()))}")
print(f"ledger: {len(ledger)} findings, {dict(sorted(by_status.items()))}")
print(f"open findings by slice: {dict(sorted(by_slice.items()))}")
print(f"corpus digest: {digest.hexdigest()[:16]}")
print(f"protocol: {PINNED}")
if failures:
    print(f"\nFAIL ({len(failures)}):")
    for message in failures:
        print(" - " + message)
    sys.exit(1)
print("\nOK")
