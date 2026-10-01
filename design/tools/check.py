#!/usr/bin/env python3
"""Session check for the design corpus. Run from anywhere: python3 design/tools/check.py

Exits 0 when the corpus, README.md and the review ledger agree; prints each failure and exits 1 otherwise.
SESSIONS.md says when to run it.
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
SDP = os.environ.get("SDP", "/Users/darkomijic/dev-libar/software-delivery-protocol/dist/cli/sdp.js")
READINESS_DIVERGENCE = (
    'const rungs = ["idea", "scoped", "defined", "ready"];'
    " const rank = (r) => (r === undefined ? -1 : rungs.indexOf(r));"
    " return g.specs().filter((s) => rank(s.derivedReadiness) < rank(s.statedReadiness)).map((s) => s.id)"
)
TYPED_SECTIONS = {"Behavior", "Workflow", "Rule", "Contract", "Design", "Decision", "Constraints", "Constraint", "Model"}
LEDGER_STATUSES = {"open", "fixed", "partially-fixed", "rejected", "owner"}

failures = []


def fail(msg):
    failures.append(msg)


def run(args):
    return subprocess.run(["node", SDP] + args, capture_output=True, text=True, cwd=DESIGN)


# 1. The graph: validate and readiness divergence.
out = run(["validate", "."])
text = out.stdout + out.stderr
graph = re.search(r"(\d+) specs · (\d+) packs · \d+ anchors → (\d+) nodes · (\d+) edges", text)
verdict = re.search(r"validate: (\d+) errors · (\d+) warnings", text)
if not graph or not verdict:
    fail("validate printed no summary line; is SDP built at " + SDP + "?")
    print("\n".join(failures))
    sys.exit(1)
n_specs, n_packs, n_nodes, n_edges = (int(x) for x in graph.groups())
n_errors, n_warnings = (int(x) for x in verdict.groups())
other_warnings = [l for l in text.splitlines() if "[warning]" in l and "conformance/verifies-linkage" not in l]
if n_errors:
    fail(f"validate: {n_errors} errors")
if other_warnings:
    fail(f"validate: {len(other_warnings)} warnings that are not verifies-linkage, first: {other_warnings[0][:200]}")

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
if kinds["example"] != n_warnings:
    fail(f"{n_warnings} warnings for {kinds['example']} examples; expected one verifies-linkage warning per example")

# 3. README.md against the Specs.
readme = open(os.path.join(DESIGN, "README.md"), encoding="utf-8").read()
expected_line = f"{n_specs} specs · {n_packs} packs · 0 anchors → {n_nodes} nodes · {n_edges} edges (0 errors, 0 warnings)"
if expected_line not in readme:
    fail("README's expected validate output is stale; it should read: " + expected_line)
if f"validate: 0 errors · {n_warnings} warnings" not in readme:
    fail(f"README's expected warning count is stale; it should be {n_warnings}")
census = re.search(r"Census: (\d+) Specs, of which (\d+) are examples; by kind, (.*?)\. Readiness: (\d+) `defined`, (\d+) `scoped`", readme)
if not census:
    fail("README has no census sentence")
else:
    stated_kinds = {k: int(n) for n, k in re.findall(r"(\d+) (\w+)", census.group(3))}
    if int(census.group(1)) != sum(kinds.values()) or stated_kinds != dict(kinds):
        fail(f"README census is stale; the corpus has {sum(kinds.values())} Specs, {dict(kinds)}")
    if (int(census.group(4)), int(census.group(5))) != (readiness["defined"], readiness["scoped"]):
        fail(f"README readiness counts are stale; the corpus has {dict(readiness)}")
registered = set(re.findall(r"^\| E-(\d+) \|", readme, re.M))
if cited_extensions - registered:
    fail(f"extensions cited in Specs but missing from README's register: E-{sorted(cited_extensions - registered, key=int)}")
if registered - cited_extensions:
    fail(f"extensions registered in README but cited by no Spec: E-{sorted(registered - cited_extensions, key=int)}")
n_questions = sum(len(v) for v in questions.values())
tally = re.search(r"(\d+) Specs carry (\d+) questions", readme)
if not tally or (int(tally.group(1)), int(tally.group(2))) != (len(questions), n_questions):
    fail(f"README's open-question tally is stale; {len(questions)} Specs carry {n_questions} questions")
rows = dict(re.findall(r"^\| \[`(spec:[^`]+)`\]\([^)]*\) \| (.*?) \|$", readme, re.M))
for sid, lines in questions.items():
    if sid not in rows:
        fail(f"README's open-question table has no row for {sid}")
    elif len(rows[sid].split(";")) != len(lines):
        fail(f"README's open-question row for {sid} lists {len(rows[sid].split(';'))} questions; the Spec has {len(lines)}")
for sid in rows:
    if sid not in questions:
        fail(f"README's open-question table lists {sid}, which has no open question")
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

digest = hashlib.sha256()
tracked = sorted(glob.glob(os.path.join(DESIGN, "specs", "**", "*.sdp.md"), recursive=True))
tracked += [os.path.join(DESIGN, name) for name in ("README.md", "PLAN.md", "SESSIONS.md", "reviews/consensus-ledger.json")]
for path in tracked:
    digest.update(os.path.relpath(path, DESIGN).encode())
    digest.update(open(path, "rb").read())

print(expected_line)
print(f"validate: {n_errors} errors · {n_warnings} warnings; readiness divergence: {diverging}")
print(f"open questions: {len(questions)} Specs, {n_questions} questions; extensions registered: {len(registered)}")
print(f"ledger: {len(ledger)} findings, {dict(sorted(by_status.items()))}")
print(f"corpus digest: {digest.hexdigest()[:16]}")
if failures:
    print(f"\nFAIL ({len(failures)}):")
    for message in failures:
        print(" - " + message)
    sys.exit(1)
print("\nOK")
