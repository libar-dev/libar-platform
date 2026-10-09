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
mention with no relation is listed with its reason, an entry address outside the Specs resolves
through the Protocol's address recipe, and no Specs rest on each other through `dependsOn`, as the
Protocol's cycle recipe reports. It prints the roles, layers and contexts the code anchors state, as
the Protocol's roles-and-layers recipe reads them, and judges none of them.
"""
import collections
import glob
import hashlib
import json
import os
import re
import subprocess
import sys

sys.dont_write_bytecode = True

from decisions import graph_recipe, question_resolutions, question_source_errors

DESIGN = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ROOT = os.path.dirname(DESIGN)
PACKAGE = os.path.join(ROOT, "node_modules", "@libar-dev", "software-delivery-protocol")
SDP = os.environ.get("SDP", os.path.join(PACKAGE, "dist", "cli", "sdp.js"))
with open(os.path.join(ROOT, "package.json"), encoding="utf-8") as package:
    PINNED = json.load(package)["devDependencies"]["@libar-dev/software-delivery-protocol"]
READINESS_DIVERGENCE = (
    'const rungs = ["idea", "scoped", "defined", "ready"];'
    " const rank = (r) => (r === undefined ? -1 : rungs.indexOf(r));"
    " return g.specs().filter((s) => rank(s.derivedReadiness) < rank(s.statedReadiness)).map((s) => s.id)"
)
GRAPH_FACTS = (
    'return { mentions: report.findings.filter((f) => f.validatorId === "conformance/prose-mentions")'
    ".map((f) => [f.subjectId, f.relatedId, f.path]) }"
)
PROSE_MENTIONS = os.path.join(DESIGN, "tools", "prose-mentions.json")
# An entry address, spec:<id>#design.<key>, #ui.<key> or #question.<key>. A token runs from `spec:` to a
# separator, loses trailing punctuation, and goes whole to the Protocol's address recipe (recipe 25), so a
# malformed key is refused rather than read as its valid prefix. The recipe holds the grammar and the
# lookup; finding the tokens and saying where each stands is this script's. Historical positional
# citations in prose, spec:<id>#<n>, are kept as written and not sent.
MENTION_TOKEN = re.compile(r"spec:[^\s`'\"()\[\]{}<>|,;]+")
ADDRESS_SECTION = re.compile(r"#(design|ui|question)\b")
# The recipe's reasons for an address that does not resolve, as this script words them.
ADDRESS_REASONS = {
    "malformed": "is outside the address grammar",
    "spec": "names no Spec",
    "entry": "names no entry of its Spec",
}
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


def address_tokens(paths, base=ROOT):
    """Each entry address written in the files, as (token, where), in file and line order."""
    found = []
    for path in sorted(paths):
        with open(path, encoding="utf-8") as lines:
            for number, line in enumerate(lines, 1):
                for token in MENTION_TOKEN.findall(line):
                    token = token.rstrip(".:!?")
                    if ADDRESS_SECTION.search(token):
                        found.append((token, f"{os.path.relpath(path, base)}:{number}"))
    return found


def address_failures(found, rows):
    """The tokens recipe 25 does not resolve. `rows` are its answer, one row per token in input order."""
    if len(rows) != len(found):
        return [f"the address recipe answered {len(rows)} rows for {len(found)} entry addresses"]
    return [f"entry address {token} at {where} {ADDRESS_REASONS.get(row['reason'], 'does not resolve: ' + repr(row['reason']))}"
            for (token, where), row in zip(found, rows) if not row["resolves"]]


def cycle_failures(answer):
    """Each set of Specs recipe 26 finds resting on each other through dependsOn, with its witness cycle."""
    return [f"dependsOn cycle among {', '.join(entry['members'])}: {' -> '.join(entry['cycle'])}"
            for entry in answer["cycles"]]


def main():
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

    # 1b. Entry addresses outside the Specs resolve, through the Protocol's address recipe.
    files = [p for top in ADDRESS_SOURCES for ext in ("ts", "tsx", "mjs") for p in glob.glob(os.path.join(ROOT, top, "**", f"*.{ext}"), recursive=True)]
    files = [p for p in files if "_generated" not in p and not p.endswith(".test.generated.ts")]
    files += [os.path.join(DESIGN, name) for name in ADDRESS_RECORDS]
    found = address_tokens(files)
    addresses = len(found)
    try:
        for message in address_failures(found, graph_recipe(25, ROOT, [token for token, _ in found])["rows"]):
            fail(message)
    except (ValueError, KeyError) as error:
        fail(f"the address recipe did not answer: {str(error)[:200]}")

    # 1c. No Spec rests on itself through dependsOn, as the Protocol's cycle recipe reports.
    cycles = None
    try:
        answer = graph_recipe(26, ROOT)
        cycles = len(answer["cycles"])
        for message in cycle_failures(answer):
            fail(message)
    except (ValueError, KeyError) as error:
        fail(f"the cycle recipe did not answer: {str(error)[:200]}")

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
    question_graph = graph_recipe(20)
    questions = {spec["id"]: [q["question"] for q in spec["questions"]] for spec in question_graph["specs"]}
    if question_graph["malformed"]:
        fail("open-question recipe reports malformed questions")
    for spec in question_graph["specs"]:
        for question in spec["questions"]:
            if not question.get("key"):
                fail(f"{spec['id']} carries an open question without a key")
    for spec in question_graph["specs"]:
        if spec["totals"]["blocking"] and spec["statedReadiness"] != "scoped":
            fail(f"{spec['id']} carries a blocking question and states {spec['statedReadiness']}")
    spec_files = {}
    n_blocking = question_graph["totals"]["blocking"]
    cited_extensions = set()
    edge_gaps = []
    for path in sorted(glob.glob(os.path.join(DESIGN, "specs", "**", "*.sdp.md"), recursive=True)):
        if path.endswith(".pack.sdp.md"):
            continue
        raw = open(path, encoding="utf-8").read()
        front, body = raw.split("\n---\n", 1)
        sid = re.search(r"^id: (\S+)", front, re.M).group(1)
        spec_files[sid] = os.path.relpath(path, ROOT)
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
        family = sid.split(":")[1].split(".")[0]
        exempt = kind in ("decision", "example") or family in ("laws", "facts") or sid == "spec:platform.vocabulary"
        missing_laws, missing_facts = cited_laws - linked_laws, cited_facts - linked_facts
        if not exempt and (missing_laws or missing_facts):
            edge_gaps.append(f"{sid}: laws {sorted(missing_laws)} facts {sorted(missing_facts)}")
    for gap in edge_gaps:
        fail("cited without a constrainedBy edge (rubric 16): " + gap)

    # 2a. Open question sources resolve by address through the Protocol; closed ones keep their text.
    register = json.load(open(os.path.join(DESIGN, "decisions/register.json"), encoding="utf-8"))
    resolutions = question_resolutions(register["decisions"])
    for row in register["decisions"]:
        for error in question_source_errors(row, questions, spec_files, resolutions):
            fail(row["id"] + ": " + error)

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
        digest.update(open(path, "rb").read())

    print(expected_line)
    print(f"validate: {n_errors} errors · {n_warnings} warnings, {len(listed)} prose mentions listed; readiness divergence: {diverging}")
    print(f"entry addresses outside the Specs: {addresses}; dependsOn cycles: {cycles}")
    print(f"architecture: {structure}")
    print(f"open questions: {len(questions)} Specs, {n_questions} questions, {n_blocking} blocking; extensions registered: {len(registered)}")
    print(f"stated readiness: {dict(sorted(readiness.items()))}")
    print(f"ledger: {len(ledger)} findings, {dict(sorted(by_status.items()))}")
    print(f"open findings by slice: {dict(sorted(by_slice.items()))}")
    print(f"corpus digest: {digest.hexdigest()[:16]}")
    print(f"Pack pages current: {len(PACK_PAGES) - stale_pages} of {len(PACK_PAGES)}")
    print(f"protocol: {PINNED}")
    if failures:
        print(f"\nFAIL ({len(failures)}):")
        for message in failures:
            print(" - " + message)
        sys.exit(1)
    print("\nOK")


if __name__ == "__main__":
    main()
