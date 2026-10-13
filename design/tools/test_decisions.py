"""Decision queries, patch refusals, the real register's question sources and its rows found by Spec,
the graph checks check.py runs through corpus rules, entry addresses outside the Specs and
dependsOn cycles, and check.py run whole over a sample tree, so that each of its checks reaches the
failures it prints and its exit status.

Run: python3 -m unittest design/tools/test_decisions.py
Fixtures and mutation copies live in operating-system temporary directories.
"""

import contextlib
import copy
import difflib
import importlib.util
import io
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
import unittest
from unittest import mock


ROOT = Path(__file__).resolve().parents[2]
TOOL_PATH = Path(os.environ.get("DECISIONS_TOOL_UNDER_TEST", ROOT / "design/tools/decisions.py"))
SPEC = importlib.util.spec_from_file_location("decisions_under_test", TOOL_PATH)
tool = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(tool)
CHECK_PATH = Path(os.environ.get("CHECK_TOOL_UNDER_TEST", ROOT / "design/tools/check.py"))
POLICY_PATH = ROOT / "design/rules/policy.js"
SCAN_PATH = ROOT / "design/tools/scan_addresses.py"
SCAN_SPEC = importlib.util.spec_from_file_location("scanner_under_test", SCAN_PATH)
scanner = importlib.util.module_from_spec(SCAN_SPEC)
SCAN_SPEC.loader.exec_module(scanner)


def lean():
    return {
        "do": "Keep the provisional reading.",
        "restsOn": "The current Spec fixes the shape [design/specs/context/tables.sdp.md:1].",
        "against": "A smaller shape could cost less.",
        "settles": "A native backend probe measures the cost.",
        "changes": "Keep design/specs/context/tables.sdp.md in S4.",
        "ifWrong": "An edit can replace it before release.",
    }


def row(identifier, **changes):
    result = {
        "id": identifier, "title": "Keep a bounded context call",
        "sources": [{"kind": "specQuestion", "address": "spec:context.tables#question.boundedCall", "file": "design/specs/context/tables.sdp.md"}],
        "families": ["context"], "cites": ["E-32", "F13"],
        "provisionalReading": "One bounded call", "blocks": None, "advisor": "convex",
        "status": "unsorted", "foldedInto": [], "class": None, "reason": None, "lean": None,
        "checkedBy": None, "fork": None, "decidedBy": None, "decidedOn": None, "ruling": None,
    }
    result.update(changes)
    return result


class DecisionsTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.path = self.root / "register.json"
        (self.root / "fork.md").write_text("A fork.\n")
        self.register = {
            "schema": 1, "units": ["S3", "S4", "S5", "L3"],
            "decisions": [
                row("OD-001", status="sorted", **{"class": "owner", "reason": "Product direction", "blocks": "S3", "advisor": "product"}),
                row("OD-002", status="waiting", **{"class": "owner", "reason": "The doc must change", "blocks": "S4", "fork": "fork.md", "lean": lean(), "advisor": "product"}),
                row("OD-003", status="sorted", **{"class": "owner", "reason": "Release policy", "blocks": "S5", "advisor": "operator"}),
                row("OD-004", status="sorted", **{"class": "delegated", "reason": "A reversible shape", "blocks": "S4", "advisor": "domain", "lean": {"do": "Keep the shape."}}),
                row("OD-005", status="decided", **{"class": "delegated", "reason": "A reversible shape", "blocks": "L3", "advisor": "domain", "lean": lean(), "checkedBy": "gpt-6.1-sol", "decidedBy": "advisor:domain", "decidedOn": "2026-10-02", "ruling": "Keep the shape"}),
                row("OD-006", status="decided", **{"class": "tactical", "reason": "Work only", "advisor": "operator", "decidedBy": "session", "decidedOn": "2026-09-28", "ruling": "Tactical decision 33: keep it"}),
                row("OD-007"),
            ],
            "possiblySame": [["OD-001", "OD-007", "The subjects overlap."]],
        }
        self.save()

    def save(self, indent=2):
        self.path.write_text(json.dumps(self.register, indent=indent, ensure_ascii=False) + "\n")

    def run_tool(self, *args):
        stdout, stderr = io.StringIO(), io.StringIO()
        with contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
            code = tool.main(list(args), register_path=self.path, root=self.root)
        return code, stdout.getvalue(), stderr.getvalue()

    def query(self, *args):
        code, output, error = self.run_tool(*args, "--json")
        self.assertEqual((code, error), (0, ""))
        return json.loads(output)

    def ids(self, *args):
        return [item["id"] for item in self.query(*args)]

    def apply(self, patch, json_output=False):
        file = self.root / "patch.json"
        file.write_text(json.dumps(patch))
        return self.run_tool("apply", str(file), *(["--json"] if json_output else []))

    def refused(self, patch, reason):
        before = self.path.read_bytes()
        code, output, error = self.apply(patch)
        self.assertEqual(code, 1)
        self.assertEqual(error, "")
        self.assertIn(reason, output)
        self.assertEqual(self.path.read_bytes(), before)

    def test_counts_command(self):
        counts = self.query()
        self.assertEqual(counts["total"], 7)
        self.assertEqual(counts["status"], {"unsorted": 1, "sorted": 3, "waiting": 1, "decided": 2, "folded": 0})
        self.assertEqual(counts["class"]["null"], 1)
        self.assertEqual(counts["advisor"], {"convex": 1, "domain": 2, "operator": 2, "product": 2})
        code, output, _ = self.run_tool()
        self.assertEqual(code, 0)
        self.assertIn("unsorted=1", output)
        self.assertIn("null=1", output)

    def test_owner_before_command_includes_the_named_unit(self):
        self.assertEqual(self.ids("--owner", "--before", "S4"), ["OD-002", "OD-001"])

    def test_owner_command_forks_first_then_unit_order(self):
        self.assertEqual(self.ids("--owner"), ["OD-002", "OD-001", "OD-003"])
        update = row("OD-008", status="decided", **{"class": "owner", "reason": "Owner ruled", "decidedBy": "owner", "decidedOn": "2026-10-02", "ruling": "Keep it"})
        self.register["decisions"].append(update)
        self.save()
        self.assertNotIn("OD-008", self.ids("--owner"))

    def test_decided_by_since_command(self):
        self.assertEqual(self.ids("--decided", "--by", "advisor", "--since", "2026-09-28"), ["OD-005"])
        self.assertEqual(self.ids("--decided", "--by", "session", "--since", "2026-09-28"), ["OD-006"])
        self.assertEqual(self.ids("--decided", "--by", "session", "--since", "2026-09-29"), [])

    def test_unsorted_advisor_command(self):
        self.assertEqual(self.ids("--unsorted", "--advisor", "convex"), ["OD-007"])
        self.assertEqual(self.ids("--unsorted", "--advisor", "product"), [])

    def test_delegated_sorted_command(self):
        self.assertEqual(self.ids("--class", "delegated", "--status", "sorted"), ["OD-004"])

    def test_blocks_command(self):
        self.assertEqual(self.ids("--blocks", "S4"), ["OD-002", "OD-004"])
        code, output, _ = self.run_tool("--blocks", "S4")
        self.assertEqual(code, 0)
        self.assertEqual(len(output.splitlines()), 2)
        self.assertEqual(output.splitlines()[1], "OD-004 | delegated | domain | S4 | Keep a bounded context call | Keep the shape.")

    def test_waiting_command_names_what_settles_it(self):
        self.assertEqual(self.ids("--waiting"), ["OD-002"])
        code, output, _ = self.run_tool("--waiting")
        self.assertEqual(code, 0)
        self.assertEqual(len(output.splitlines()), 1)
        self.assertIn("waits for: A native backend probe measures the cost.", output)

    def test_spec_family_citation_commands_show_open_rows(self):
        for args in [("--spec", "spec:context.tables"), ("--family", "context"), ("--cites", "E-32")]:
            with self.subTest(args=args):
                self.assertEqual(self.ids(*args), ["OD-001", "OD-002", "OD-003", "OD-004", "OD-007"])
        self.assertEqual(self.ids("--spec", "spec:context.tables", "--decided"), ["OD-005", "OD-006"])
        self.assertEqual(self.ids("--spec", "spec:context.table"), [])
        self.assertEqual(self.ids("--cites", "E-3"), [])

    def test_id_command_full_row_and_pairs(self):
        result = self.query("--id", "OD-007")
        self.assertEqual(result["decision"], self.register["decisions"][6])
        self.assertEqual(result["possiblySame"], self.register["possiblySame"])
        code, output, _ = self.run_tool("--id", "OD-007")
        self.assertEqual(code, 0)
        self.assertIn("provisionalReading:", output)
        self.assertIn("possiblySame: OD-001 | OD-007 | The subjects overlap.", output)

    def test_apply_command_preserves_order_indentation_and_other_bytes(self):
        self.save(indent=4)
        before = self.path.read_text()
        self.assertEqual(self.apply([{"id": "OD-007", "reason": "Another advisor should sort this"}], True)[0], 0)
        after = self.path.read_text()
        changes = [line for line in difflib.ndiff(before.splitlines(), after.splitlines()) if line.startswith(("+ ", "- "))]
        self.assertEqual(changes, ['-             "reason": null,', '+             "reason": "Another advisor should sort this",'])
        result = json.loads(after)
        self.assertEqual(list(result), list(self.register))
        self.assertEqual(list(result["decisions"][6]), list(self.register["decisions"][6]))
        self.assertEqual(result["possiblySame"], self.register["possiblySame"])

    def test_refusal_1_unknown_id_unknown_field_and_load_field_change(self):
        for patch, reason in [
            ([{"id": "OD-999", "status": "unsorted"}], "unknown id"),
            ([{"id": "OD-007", "recommendation": "Keep it"}], "unknown field"),
            ([{"id": "OD-007", "title": "A rewritten title"}], "cannot change load field"),
            ([{"id": "OD-007", "advisor": "domain"}], "cannot change load field"),
        ]:
            with self.subTest(reason=reason):
                self.refused(patch, reason)

    def test_refusal_2_sorted_waiting_decided_need_class_and_reason(self):
        for status in ("sorted", "waiting", "decided"):
            with self.subTest(status=status):
                self.refused([{"id": "OD-007", "status": status}], "requires class and reason")
        self.refused([{"id": "OD-007", "status": "sorted", "class": "delegated"}], "requires reason")
        self.refused([{"id": "OD-007", "status": "sorted", "reason": "Reversible"}], "requires class")

    def test_refusal_3_waiting_needs_settles(self):
        self.refused([{"id": "OD-007", "status": "waiting", "class": "owner", "reason": "Need evidence", "lean": {"do": "Wait."}}], "requires lean.settles")

    def test_refusal_4_decided_needs_ruling_identity_and_date(self):
        for missing in ("decidedBy", "decidedOn", "ruling"):
            update = {"id": "OD-007", "status": "decided", "class": "owner", "reason": "Product policy", "decidedBy": "owner", "decidedOn": "2026-10-02", "ruling": "Keep it"}
            del update[missing]
            with self.subTest(missing=missing):
                self.refused([update], missing)

    def test_refusal_5_decider_class_and_checked_lean(self):
        base = {"id": "OD-007", "status": "decided", "class": "owner", "reason": "Product policy", "decidedBy": "session", "decidedOn": "2026-10-02", "ruling": "Keep it"}
        self.refused([base], "session may decide only tactical")
        base.update(decidedBy="advisor:convex", lean=lean(), checkedBy="gpt-6.1-sol")
        self.refused([base], "an advisor may decide only delegated")
        base["class"] = "delegated"
        for part in lean():
            update = copy.deepcopy(base)
            del update["lean"][part]
            with self.subTest(part=part):
                self.refused([update], "an advisor decision requires lean parts: " + part)
        update = copy.deepcopy(base)
        del update["checkedBy"]
        self.refused([update], "an advisor decision requires checkedBy")

    def test_refusal_6_fork_must_be_a_file(self):
        for name in ("missing.md", "."):
            with self.subTest(name=name):
                self.refused([{"id": "OD-007", "fork": name}], "fork is not a file")

    def test_refused_patch_is_byte_identical_and_prints_every_reason(self):
        patch = [
            {"id": "OD-007", "reason": "This valid change must not land"},
            {"id": "OD-001", "status": "waiting", "lean": None, "fork": "missing.md"},
            {"id": "OD-999", "unexpected": 1},
        ]
        before = self.path.read_bytes()
        code, output, _ = self.apply(patch)
        self.assertEqual(code, 1)
        for reason in ("requires lean.settles", "fork is not a file", "unknown id", "unknown field"):
            self.assertIn(reason, output)
        self.assertEqual(self.path.read_bytes(), before)

    def test_full_advisor_round_is_accepted(self):
        stages = [
            {"id": "OD-007", "status": "sorted", "class": "delegated", "reason": "A reversible bound", "lean": {"do": "Keep the bound."}},
            {"id": "OD-007", "lean": lean()},
            {"id": "OD-007", "checkedBy": "gpt-6.1-sol"},
            {"id": "OD-007", "status": "decided", "decidedBy": "advisor:convex", "decidedOn": "2026-10-02", "ruling": "Keep the bound"},
        ]
        for stage in stages:
            self.assertEqual(self.apply([stage])[0], 0)
        final = json.loads(self.path.read_text())["decisions"][6]
        self.assertEqual(final["status"], "decided")
        self.assertEqual(final["lean"], lean())
        self.assertEqual(final["checkedBy"], "gpt-6.1-sol")

    def test_owner_can_decide_any_class_and_session_can_decide_tactical(self):
        for cls in ("owner", "delegated", "tactical"):
            with self.subTest(cls=cls):
                self.assertEqual(self.apply([{"id": "OD-007", "status": "decided", "class": cls, "reason": "Owner ruled", "decidedBy": "owner", "decidedOn": "2026-10-02", "ruling": "Keep it"}])[0], 0)
        self.assertEqual(self.apply([{"id": "OD-007", "class": "tactical", "decidedBy": "session", "ruling": "Tactical decision 33: keep it"}])[0], 0)

    def test_malformed_values_are_refused_without_writes(self):
        for patch, reason in [
            ({"id": "OD-007"}, "patch must be a JSON list"),
            ([None], "must be an object"),
            ([{"id": []}], "unknown id"),
            ([{"id": "OD-007", "blocks": "S99"}], "blocks must name a unit"),
            ([{"id": "OD-007", "lean": []}], "lean must be an object"),
            ([{"id": "OD-007", "lean": {"do": " "}}], "lean.do must be a non-empty string"),
            ([{"id": "OD-007", "decidedOn": "2026-02-30"}], "decidedOn:"),
        ]:
            with self.subTest(reason=reason):
                self.refused(patch, reason)

    def test_noop_is_byte_identical_and_repeated_ids_merge_in_order(self):
        before = self.path.read_bytes()
        self.assertEqual(self.apply([{"id": "OD-007", "title": "Keep a bounded context call"}])[0], 0)
        self.assertEqual(self.path.read_bytes(), before)
        self.assertEqual(self.apply([{"id": "OD-007", "reason": "First"}, {"id": "OD-007", "reason": "Second"}])[0], 0)
        self.assertEqual(json.loads(self.path.read_text())["decisions"][6]["reason"], "Second")

    def test_blocks_correction_needs_a_reason(self):
        self.refused([{"id": "OD-007", "blocks": "S4"}], "correcting blocks requires reason")
        self.assertEqual(self.apply([{"id": "OD-007", "blocks": "S4", "reason": "S4 needs this before its code"}])[0], 0)

    def test_folded_command_and_exclusion_from_other_listings(self):
        update = {"id": "OD-001", "status": "folded", "reason": "The heading is not a decision", "foldedInto": []}
        self.assertEqual(self.apply([update])[0], 0)
        for args in [("--owner",), ("--blocks", "S3"), ("--advisor", "product"),
                     ("--family", "context"), ("--spec", "spec:context.tables"),
                     ("--cites", "E-32"), ("--class", "owner")]:
            with self.subTest(args=args):
                self.assertNotIn("OD-001", self.ids(*args))
        self.assertEqual(self.ids("--status", "folded"), ["OD-001"])
        self.assertEqual(self.query("--id", "OD-001")["decision"]["status"], "folded")
        self.assertEqual(self.query()["status"]["folded"], 1)
        self.assertEqual(self.query()["total"], 7)
        self.assertEqual(self.apply([{"id": "OD-007", "status": "folded", "reason": "Same decision", "foldedInto": ["OD-001", "OD-004"]}])[0], 0)

    def test_refusal_7_folded_requires_reason(self):
        for reason in (None, "", " "):
            with self.subTest(reason=reason):
                self.refused([{"id": "OD-007", "status": "folded", "foldedInto": [], "reason": reason}], "requires reason when folded")

    def test_refusal_8_folded_into_requires_existing_ids(self):
        self.refused([{"id": "OD-007", "status": "folded", "reason": "Same decision", "foldedInto": ["OD-999"]}], "unknown foldedInto id")
        self.refused([{"id": "OD-007", "foldedInto": "OD-001"}], "foldedInto must be a list")

    def test_refusal_9_deciding_advisor_must_match_assignment(self):
        self.refused([{"id": "OD-007", "status": "decided", "class": "delegated", "reason": "Reversible bound", "lean": lean(), "checkedBy": "gpt-6.1-sol", "decidedBy": "advisor:domain", "decidedOn": "2026-10-02", "ruling": "Keep it"}], "decidedBy advisor must equal")

    def test_reassign_command_resets_sort_and_records_reason(self):
        self.save(indent=4)
        before = self.path.read_text()
        code, output, error = self.run_tool("reassign", "OD-005", "convex", "--reason", "The bound needs Convex evidence", "--json")
        self.assertEqual((code, error), (0, ""))
        self.assertTrue(json.loads(output)["reassigned"])
        after = json.loads(self.path.read_text())
        expected = copy.deepcopy(self.register)
        expected["decisions"][4].update(advisor="convex", status="unsorted", **{"class": None, "reason": "The bound needs Convex evidence", "lean": None})
        self.assertEqual(after, expected)
        self.assertEqual(self.path.read_text(), json.dumps(expected, indent=4, ensure_ascii=False) + "\n")
        self.assertNotEqual(before, self.path.read_text())

    def test_reassign_refuses_bad_id_advisor_or_absent_reason_without_writes(self):
        for args, reason in [
            (("OD-999", "convex", "--reason", "Move it"), "unknown id"),
            (("OD-007", "unknown", "--reason", "Move it"), "unknown advisor"),
            (("OD-007", "convex"), "reassign requires reason"),
        ]:
            with self.subTest(args=args):
                before = self.path.read_bytes()
                code, output, error = self.run_tool("reassign", *args)
                self.assertEqual((code, error), (1, ""))
                self.assertIn(reason, output)
                self.assertEqual(self.path.read_bytes(), before)

    def test_spec_line_sources_can_be_queried(self):
        self.register["decisions"][6]["sources"] = [{"kind": "specLine", "ref": "spec:command.command-pipeline#limitCallText", "file": "design/specs/command/command-pipeline.sdp.md", "line": 131}]
        self.save()
        self.assertEqual(self.ids("--spec", "spec:command.command-pipeline"), ["OD-007"])


class RealRegisterTests(unittest.TestCase):
    def test_od157_is_found_at_its_question_address(self):
        package = ROOT / "node_modules/@libar-dev/software-delivery-protocol"
        body = (package / "dist/recipes/23-entry-search.js").read_text()
        result = subprocess.run(["node", str(package / "dist/cli/sdp.js"), "q", body,
                                 "--params", json.dumps({"term": "OD-157"}), "--json"],
                                cwd=ROOT, capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        address = "spec:application.history-rebuild#question.verifyPassUnderPause"
        matches = [match for match in json.loads(result.stdout)["matches"] if match["address"] == address]
        self.assertEqual(len(matches), 1)
        self.assertIsInstance(matches[0]["line"], int)
        concept = subprocess.run(["node", str(package / "dist/cli/sdp.js"), "q",
                                  'return g.findByConcept("OD-157")', "--json"],
                                 cwd=ROOT, capture_output=True, text=True)
        self.assertEqual(concept.returncode, 0, concept.stderr)
        self.assertIn("spec:application.history-rebuild", concept.stdout)

    def test_pinned_suite_verifies_the_specs_it_compares(self):
        package = ROOT / "node_modules/@libar-dev/software-delivery-protocol"
        body = ('const id = "test:history-view.pinned-declarations";'
                ' return {anchor: graph.nodes.find((node) => node.id === id),'
                ' targets: graph.edges.filter((edge) => edge.from === id && edge.type === "verifies")'
                '.map((edge) => edge.to).sort()};')
        result = subprocess.run(["node", str(package / "dist/cli/sdp.js"), "q", body, "--json"],
                                cwd=ROOT, capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        answer = json.loads(result.stdout)
        source = (ROOT / "tests/types/pinned.test-d.ts").read_text()
        compared = sorted(set(re.findall(r'\btest\("(spec:[^#"]+)#design\.', source)))
        self.assertEqual(answer["targets"], compared)
        self.assertEqual(answer["anchor"]["file"], "tests/types/pinned.test-d.ts")
        self.assertEqual(answer["anchor"]["label"], "compares pack:history-view's pinned declarations with the code")

    def test_real_register_has_unique_ids_and_resolving_question_sources(self):
        register = json.loads((ROOT / "design/decisions/register.json").read_text())
        rows = register["decisions"]
        ids = [r["id"] for r in rows]
        self.assertEqual(len(set(ids)), len(ids))
        for decision in rows:
            with self.subTest(row=decision["id"]):
                self.assertEqual(tool.row_errors(decision, register["units"], ROOT, set(ids)), [])
        result = subprocess.run(["node", str(ROOT / "node_modules/@libar-dev/software-delivery-protocol/dist/cli/sdp.js"),
                                 "validate", ".", "--rules", str(POLICY_PATH),
                                 "--params", "intended=@design/tools/prose-mentions.json",
                                 "--params", "register=@design/decisions/register.json",
                                 "--params", json.dumps({"addressSites": [], "addressSections": scanner.entry_address_sections()})],
                                cwd=ROOT, capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn("corpus rules: 0 errors", result.stdout)

    def test_real_rows_are_found_by_the_spec_their_sources_name(self):
        def ids(*args):
            stdout = io.StringIO()
            with contextlib.redirect_stdout(stdout):
                code = tool.main([*args, "--json"], register_path=ROOT / "design/decisions/register.json", root=ROOT)
            self.assertEqual(code, 0)
            return {row["id"] for row in json.loads(stdout.getvalue())}
        for spec, expected in [
            ("spec:application.projection-contract", {"OD-171"}),
            ("spec:application.history-projection", {"OD-172", "OD-173", "OD-174"}),
            ("spec:application.history-rebuild", {"OD-175"}),
        ]:
            with self.subTest(spec=spec):
                self.assertLessEqual(expected, ids("--spec", spec) | ids("--spec", spec, "--decided"))


def sample_spec(name, relations="{}", key=" #keepIt"):
    """A rule Spec of a sample corpus, with one Design entry and one open question, keyed unless key is empty."""
    return f"""---
id: spec:sample.{name}
kind: rule
altitude: story
readiness: scoped
relations: {relations}
---
# Sample {name}

## Intent
- outcome: Keep {name}.

### Open questions
- [non-blocking{key}] Keep {name} as it is. Another sentence.

## Rule
- Keep {name}.

## Design
- typeOne: `type One = string`

## Verification — reviewed
- Review {name}.
"""


class CheckTests(unittest.TestCase):
    """The scanner and rules refuse broken addresses and cycles in a sample corpus."""

    @classmethod
    def setUpClass(cls):
        sys.path.insert(0, str(ROOT / "design/tools"))
        spec = importlib.util.spec_from_file_location("scan_under_test", SCAN_PATH)
        cls.check = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(cls.check)

    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)

    def put(self, path, text):
        (self.root / path).parent.mkdir(parents=True, exist_ok=True)
        (self.root / path).write_text(text)

    def policy(self, sites=None):
        params = {"intended":{"pairs":[]}, "register":{"decisions":[]}, "addressSites":sites or [], "addressSections":scanner.entry_address_sections()}
        result = subprocess.run(["node", str(ROOT / "node_modules/@libar-dev/software-delivery-protocol/dist/cli/sdp.js"),
                                 "validate", str(self.root), "--rules", str(POLICY_PATH), "--params", json.dumps(params)],
                                cwd=ROOT, capture_output=True, text=True)
        return result, result.stdout + result.stderr

    def test_addresses_are_parameters_including_an_empty_list(self):
        self.put("design/specs/sample/one.sdp.md", sample_spec("one"))
        for addresses in ([], ["spec:sample.one#design.typeOne", "not an address", "spec:sample.one#design.typeOne"]):
            with self.subTest(addresses=addresses):
                answer = tool.graph_recipe(25, self.root, addresses)
                self.assertEqual([row["address"] for row in answer["rows"]], addresses)
                self.assertEqual(answer["totals"]["addresses"], len(addresses))

    def test_rule_addresses_resolve_or_fail_where_written(self):
        self.put("design/specs/sample/one.sdp.md", sample_spec("one").replace("- Keep one.", "- [#keepOne] Keep one."))
        self.put("src/rules.ts", "\n".join([
            "// spec:sample.one#rule.keepOne resolves.",
            "// spec:sample.one#rule.missing names no entry.",
            "// spec:sample.one#rule.Keep-one is malformed.",
        ]) + "\n")
        found = self.check.address_tokens([self.root / "src/rules.ts"], self.root)
        self.assertEqual(len(found), 3)
        result, text = self.policy([{"address": token, "where": where} for token, where in found])
        self.assertEqual(result.returncode, 1, text)
        self.assertIn("entry address spec:sample.one#rule.missing at src/rules.ts:2 names no entry of its Spec", text)
        self.assertIn("entry address spec:sample.one#rule.Keep-one at src/rules.ts:3 is outside the address grammar", text)
        self.assertNotIn("entry address spec:sample.one#rule.keepOne", text)

    def test_address_sections_name_why_node_failed(self):
        for stderr, stdout, reason in (("first line\nsecond line\n", "", "first line"),
                                       ("", "on stdout\n", "on stdout"),
                                       ("", "", "node exited 3")):
            failed = subprocess.CompletedProcess([], 3, stdout, stderr)
            with self.subTest(reason=reason), mock.patch.object(scanner.subprocess, "run", return_value=failed):
                with self.assertRaisesRegex(ValueError, f"entry-address sections: {re.escape(reason)}$"):
                    scanner.entry_address_sections()

    def test_address_sections_follow_the_protocol_export(self):
        self.put("src/cites.ts", "\n".join([
            "// spec:sample.one#design.typeOne is an exported section.",
            "// spec:sample.one#future.keepOne is a newly exported section.",
            "// spec:sample.one#rule.keepOne is not in this export.",
            "// spec:sample.one#3 remains a positional citation.",
        ]) + "\n")
        sections = subprocess.CompletedProcess([], 0, json.dumps(["design", "future"]), "")
        with mock.patch.object(self.check.subprocess, "run", return_value=sections):
            found = self.check.address_tokens([self.root / "src/cites.ts"], self.root)
        self.assertEqual(found, [
            ("spec:sample.one#design.typeOne", "src/cites.ts:1"),
            ("spec:sample.one#future.keepOne", "src/cites.ts:2"),
        ])

        # Model a Protocol section added after this policy was written, without changing the pin.
        payload = {"body": POLICY_PATH.read_text(), "params": {
            "intended": {"pairs": []}, "register": {"decisions": []},
            "addressSections": ["design", "future"],
            "addressSites": [{"address": token, "where": where} for token, where in found],
        }}
        result = subprocess.run(["node", "--input-type=module", "--eval", """
import { readFileSync } from 'node:fs';
const { body, params } = JSON.parse(readFileSync(0, 'utf8'));
const spec = { id: 'spec:sample.one', file: 'sample.sdp.md', statedReadiness: 'scoped', derivedReadiness: 'scoped' };
const g = { specs: () => [spec], specContext: () => ({ sections: { design: { typeOne: 'string' }, future: { keepOne: 'Keep one.' } } }) };
const evaluate = new (Object.getPrototypeOf(async function () {}).constructor)('g', 'graph', 'report', 'params', body);
console.log(JSON.stringify(await evaluate(g, { edges: [] }, { findings: [] }, params)));
"""], input=json.dumps(payload), capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(json.loads(result.stdout), {"findings": []})

    def test_a_broken_address_fails_where_it_is_written(self):
        self.put("design/specs/sample/one.sdp.md", sample_spec("one"))
        self.put("src/cites.ts", "\n".join([
            "// spec:sample.one#design.typeOne resolves.",
            "// spec:sample.one#question.keepIt resolves.",
            "// spec:sample.one#design.typeTwo names no entry.",
            "// spec:sample.none#design.typeOne names no Spec.",
            "// spec:sample.one#design.Type-one is malformed.",
            "// spec:sample.one#3 is a positional citation, kept as written.",
        ]) + "\n")
        found = self.check.address_tokens([self.root / "src/cites.ts"], self.root)
        self.assertEqual([where for _, where in found], [f"src/cites.ts:{n}" for n in range(1, 6)])
        result, text = self.policy([{"address": token, "where": where} for token, where in found])
        self.assertEqual(result.returncode, 1, text)
        for message in (
            "entry address spec:sample.one#design.typeTwo at src/cites.ts:3 names no entry of its Spec",
            "entry address spec:sample.none#design.typeOne at src/cites.ts:4 names no Spec",
            "entry address spec:sample.one#design.Type-one at src/cites.ts:5 is outside the address grammar",
        ):
            self.assertIn(message, text)
        self.assertNotIn("entry address spec:sample.one#design.typeOne", text)
        self.assertNotIn("entry address spec:sample.one#question.keepIt", text)

    def test_a_planted_cycle_fails_and_a_chain_passes(self):
        self.put("design/specs/sample/one.sdp.md", sample_spec("one", "\n  dependsOn: spec:sample.two"))
        self.put("design/specs/sample/two.sdp.md", sample_spec("two", "\n  dependsOn: spec:sample.three"))
        self.put("design/specs/sample/three.sdp.md", sample_spec("three", "\n  refines: spec:sample.one"))
        result, text = self.policy()
        self.assertEqual(result.returncode, 0, text)
        self.assertNotIn("dependency-cycle", text)
        self.put("design/specs/sample/three.sdp.md", sample_spec("three", "\n  dependsOn: spec:sample.one"))
        result, text = self.policy()
        self.assertEqual(result.returncode, 1, text)
        self.assertIn("dependsOn cycle among spec:sample.one, spec:sample.three, spec:sample.two", text)



class RecipeScriptTests(unittest.TestCase):
    """Recipe callers work with shipped files even when the Markdown catalog is absent.

    The temporary package links its runtime dependencies read-only. No install runs through them.
    """

    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        modules = self.root / "node_modules"
        modules.mkdir()
        for dependency in (ROOT / "node_modules").iterdir():
            if dependency.name != "@libar-dev":
                os.symlink(dependency, modules / dependency.name)
        package = modules / "@libar-dev/software-delivery-protocol"
        package.mkdir(parents=True)
        for child in (ROOT / "node_modules/@libar-dev/software-delivery-protocol").iterdir():
            if child.name != "docs":
                os.symlink(child, package / child.name)
        for script in ("pinned.mjs", "pack-page.mjs"):
            path = self.root / "scripts" / script
            path.parent.mkdir(exist_ok=True)
            shutil.copyfile(ROOT / "scripts" / script, path)
        self.put("package.json", (ROOT / "package.json").read_text())
        self.put(".prettierrc.json", (ROOT / ".prettierrc.json").read_text())
        self.put("design/specs/sample/one.sdp.md", sample_spec("one"))
        self.put("design/specs/sample.pack.sdp.md", "---\nid: pack:sample\nspecs:\n  - spec:sample.one\n---\n# Sample\n")
        self.put("tests/types/pinned-pairs.json", json.dumps({"pack": "pack:sample", "test": "tests/types/pinned.test-d.ts", "pairs": []}))
        self.put("design/decisions/register.json", json.dumps({"decisions": []}))

    def put(self, path, text):
        target = self.root / path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(text)

    def intercept_queries(self, refusal=None):
        package = "node_modules/@libar-dev/software-delivery-protocol"
        dist = self.root / package / "dist"
        dist.unlink()
        dist.mkdir()
        for child in (ROOT / package / "dist").iterdir():
            if child.name != "cli":
                os.symlink(child, dist / child.name)
        cli = str(ROOT / package / "dist/cli/sdp.js")
        self.put(package + "/dist/cli/sdp.js", "\n".join([
            'import { appendFileSync, readFileSync } from "node:fs";',
            'import { execFileSync } from "node:child_process";',
            'const args = process.argv.slice(2);',
            'appendFileSync("queries.jsonl", JSON.stringify(args) + "\\n");',
            f'const refusal = {json.dumps(refusal)};',
            f'const recipes = {json.dumps(str(ROOT / package / "dist/recipes"))};',
            'if (refusal && args[1].includes(readFileSync(`${recipes}/${refusal}`, "utf8"))) {',
            '  console.error(`recipe ${refusal.slice(0, 2)} refused\\nextra diagnostics`);',
            '  process.exit(7);',
            '}',
            f'process.stdout.write(execFileSync(process.execPath, [{json.dumps(cli)}, ...args],',
            '  { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }));',
        ]) + "\n")

    def test_decisions_uses_shipped_recipes_without_the_catalog(self):
        path = self.root / "design/tools/decisions.py"
        self.put("design/tools/decisions.py", TOOL_PATH.read_text())
        spec = importlib.util.spec_from_file_location("decisions_without_catalog", path)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        answer = module.graph_recipe(25, self.root, ["spec:sample.one#design.typeOne"])
        self.assertEqual(answer["totals"]["resolved"], 1)

    def test_pinned_uses_shipped_recipes_without_the_catalog(self):
        result = subprocess.run(["node", "scripts/pinned.mjs", "--pack", "pack:sample"],
                                cwd=self.root, capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("export type One = string", (self.root / "generated/pinned/sample.ts").read_text())

    def test_pack_page_uses_shipped_recipes_with_parameters_without_the_catalog(self):
        result = subprocess.run(["node", "scripts/pack-page.mjs", "--pack", "pack:sample", "--out", "design/pages/sample.md"],
                                cwd=self.root, capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        page = (self.root / "design/pages/sample.md").read_text()
        self.assertIn("spec:sample.one#question.keepIt", page)
        self.assertIn("type One = string", page)

    def test_pack_page_runs_each_shipped_recipe_as_its_own_query(self):
        self.intercept_queries()
        result = subprocess.run(["node", "scripts/pack-page.mjs", "--pack", "pack:sample", "--out", "design/pages/sample.md"],
                                cwd=self.root, capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        queries = [json.loads(line) for line in (self.root / "queries.jsonl").read_text().splitlines()]
        recipes = ROOT / "node_modules/@libar-dev/software-delivery-protocol/dist/recipes"
        self.assertEqual([args[1] for args in queries], [
            (recipes / "20-open-question-register.js").read_text(),
            (recipes / "24-pinned-declarations.js").read_text(),
        ])
        for args in queries:
            self.assertEqual(args[args.index("--params") + 1], "{}")

    def test_pack_page_reports_the_first_stderr_line_when_either_recipe_refuses(self):
        for recipe in ("20-open-question-register.js", "24-pinned-declarations.js"):
            with self.subTest(recipe=recipe):
                # Each case has its own CLI, so no shared package file is changed.
                if recipe.startswith("24"):
                    shutil.rmtree(self.root / "node_modules/@libar-dev/software-delivery-protocol/dist")
                    os.symlink(ROOT / "node_modules/@libar-dev/software-delivery-protocol/dist",
                               self.root / "node_modules/@libar-dev/software-delivery-protocol/dist")
                self.intercept_queries(recipe)
                result = subprocess.run(["node", "scripts/pack-page.mjs", "--pack", "pack:sample", "--out", "design/pages/sample.md"],
                                        cwd=self.root, capture_output=True, text=True)
                self.assertEqual(result.returncode, 2, result.stderr)
                self.assertEqual(result.stderr, f"pack-page: cannot generate · the query failed: recipe {recipe[:2]} refused\n")
                self.assertFalse((self.root / "design/pages/sample.md").exists())


class CheckCommandTests(unittest.TestCase):
    """check.py run whole, as the command it is, over a sample tree in a temporary directory.

    The tree holds the gate, scanner and rules under test, the pinned Protocol through a link to
    this repository's node_modules, and a stand-in for the page generator. Four defects are planted at
    once: an address that names no entry, a dependsOn cycle, an open question without a key, and a page
    generator that exits 1. The run must print each failure, no other, and exit 1, so a check that
    stops reaching its failures or the exit status fails here.
    """

    def put(self, path, text):
        (self.root / path).parent.mkdir(parents=True, exist_ok=True)
        (self.root / path).write_text(text)

    def test_each_check_reaches_its_failure_and_the_exit_status(self):
        with tempfile.TemporaryDirectory() as temporary:
            self.root = Path(temporary)
            pin = json.loads((ROOT / "package.json").read_text())["devDependencies"]["@libar-dev/software-delivery-protocol"]
            self.put("package.json", json.dumps({"devDependencies": {"@libar-dev/software-delivery-protocol": pin}}))
            os.symlink(ROOT / "node_modules", self.root / "node_modules")
            self.put("design/tools/check.py", CHECK_PATH.read_text())
            self.put("design/tools/decisions.py", TOOL_PATH.read_text())
            self.put("design/tools/scan_addresses.py", SCAN_PATH.read_text())
            self.put("design/rules/policy.js", POLICY_PATH.read_text())
            self.put("design/tools/prose-mentions.json", json.dumps({"pairs": []}))
            self.put("design/decisions/register.json", json.dumps({"schema": 1, "units": [], "decisions": [], "possiblySame": []}))
            self.put("design/reviews/consensus-ledger.json", json.dumps({"ledger": []}))
            for name in ("STATE.md", "ROADMAP.md", "PLAN.md", "SESSIONS.md"):
                self.put("design/" + name, "# Sample\n")
            self.put("design/specs/sample/one.sdp.md", sample_spec("one", "\n  dependsOn: spec:sample.two"))
            self.put("design/specs/sample/two.sdp.md", sample_spec("two", "\n  dependsOn: spec:sample.one", key=""))
            self.put("src/cites.ts", "// spec:sample.one#design.typeOne resolves.\n// spec:sample.one#design.typeTwo names no entry.\n")
            self.put("scripts/pack-page.mjs", 'console.error("pack-page: design/pages/history-view.md is behind the tree from line 1");\nprocess.exit(1);\n')
            validate = subprocess.run(["node", str(ROOT / "node_modules/@libar-dev/software-delivery-protocol/dist/cli/sdp.js"), "validate", "."],
                                      cwd=self.root, capture_output=True, text=True)
            summary = re.search(r"\d+ specs · \d+ packs · \d+ anchors → \d+ nodes · \d+ edges", validate.stdout + validate.stderr)
            self.assertIsNotNone(summary, validate.stdout + validate.stderr)
            self.put("design/README.md", f"{summary.group(0)} (0 errors, 0 warnings)\n\nvalidate: 0 errors · 0 warnings\n")
            run = subprocess.run([sys.executable, str(self.root / "design/tools/check.py")], cwd=self.root, capture_output=True, text=True,
                                 env={**os.environ, "PYTHONDONTWRITEBYTECODE": "1"})
            for message in (
                "entry address spec:sample.one#design.typeTwo at src/cites.ts:2 names no entry of its Spec",
                "dependsOn cycle among spec:sample.one, spec:sample.two",
                "spec:sample.two carries an open question without a key",
                "pack-page: design/pages/history-view.md is behind the tree from line 1",
                "corpus rules: 3 errors · 0 warnings · 0 of 2 files failed",
            ):
                self.assertIn(message, run.stdout + run.stderr)
            self.assertEqual(run.returncode, 1)
            self.assertEqual([line[3:] for line in run.stdout.splitlines() if line.startswith(" - ")], [
                "sdp validate with corpus rules exited 1",
                "pack-page: design/pages/history-view.md is behind the tree from line 1",
            ])
            self.assertNotIn("\nOK", run.stdout)


class CorpusRulesTests(unittest.TestCase):
    """Planted graph mistakes are refused by the rules that the gate loads."""

    put = CheckTests.put

    def carrier(self, name, **kwargs):
        return sample_spec(name, "\n  refines: spec:sample.base", **kwargs)

    def validate_policy(self, intended=None, register=None, sites=None, walk=False):
        self.put("intended.json", json.dumps(intended or {"pairs": []}))
        self.put("register.json", json.dumps(register or {"decisions": []}))
        self.put("sites.json", json.dumps(sites or []))
        args = ["npx", "sdp", "validate", ".", "--rules", str(POLICY_PATH),
                "--params", "intended=@intended.json", "--params", "register=@register.json",
                "--params", "addressSites=@sites.json",
                "--params", json.dumps({"addressSections": scanner.entry_address_sections()})]
        if walk:
            args += ["--rules", str(ROOT / "node_modules/@libar-dev/software-delivery-protocol/dist/recipes/42-the-architecture-walk.js"),
                     "--params", '{"isolated":["platform"]}']
        result = subprocess.run(args, cwd=self.root, capture_output=True, text=True)
        return result, result.stdout + result.stderr

    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        os.symlink(ROOT / "node_modules", self.root / "node_modules")
        self.put("design/specs/sample/base.sdp.md", sample_spec("base").replace("readiness: scoped", "readiness: idea"))
        self.put("package.json", '{"type":"module"}')
        self.put("design/specs/sample/one.sdp.md", self.carrier("one"))

    def test_rules_accept_the_clean_graph_and_refuse_each_policy_mistake(self):
        result, text = self.validate_policy()
        self.assertEqual(result.returncode, 0, text)
        mutations = [
            ("readiness", self.carrier("one").replace("readiness: scoped", "readiness: ready"), {}, "owner-states-ready"),
            ("divergence", self.carrier("one").replace("readiness: scoped", "readiness: defined").replace("- [non-blocking #keepIt]", "- [blocking #keepIt]"), {}, "readiness-divergence"),
            ("key", self.carrier("one", key=""), {}, "question-key"),
            ("blocking", self.carrier("one").replace("readiness: scoped", "readiness: defined").replace("- [non-blocking #keepIt]", "- [blocking #keepIt]"), {}, "blocking-means-scoped"),
            ("citation", self.carrier("one").replace("- Keep one.", "- Keep one under Law 1 and F1."), {}, "cited-without-edge"),
            ("address", self.carrier("one"), {"sites": [{"address":"spec:sample.one#design.absent", "where":"src/cites.ts:2"}]}, "address-resolves"),
            ("stale", self.carrier("one"), {"intended":{"pairs":[{"from":"spec:sample.one", "to":"spec:sample.two", "reason":"A prose pointer."}]}}, "stale-mention"),
            ("reason", self.carrier("one"), {"intended":{"pairs":[{"from":"spec:sample.one", "to":"spec:sample.two", "reason":" "}]}}, "mention-reason"),
        ]
        for name, carrier, params, validator in mutations:
            with self.subTest(mistake=name):
                self.put("design/specs/sample/one.sdp.md", carrier)
                result, text = self.validate_policy(**params)
                self.assertEqual(result.returncode, 1, text)
                self.assertIn(validator, text)
                if name == "readiness":
                    self.assertIn("other-warning", text)

    def test_rules_refuse_an_unlisted_mention_and_accept_its_reason(self):
        self.put("design/specs/sample/two.sdp.md", self.carrier("two"))
        self.put("design/specs/sample/one.sdp.md", self.carrier("one").replace("- Keep one.", "- Read `spec:sample.two` for context."))
        result, text = self.validate_policy()
        self.assertEqual(result.returncode, 1, text)
        self.assertIn("unlisted-mention", text)
        intended = {"pairs":[{"from":"spec:sample.one", "to":"spec:sample.two", "reason":"A prose pointer."}]}
        result, text = self.validate_policy(intended=intended)
        self.assertEqual(result.returncode, 0, text)

    def test_rules_refuse_question_source_mistakes_and_returned_closed_questions(self):
        decision = row("OD-001")
        source = {"kind":"specQuestion", "address":"spec:sample.one#question.keepIt", "file":"design/specs/sample/one.sdp.md"}
        decision["sources"] = [source]
        result, text = self.validate_policy(register={"decisions":[decision]})
        self.assertEqual(result.returncode, 0, text)
        for mutation in ("missing", "section", "file", "shape", "line", "openTrue", "notString", "closedStatus", "returned"):
            with self.subTest(mistake=mutation):
                planted = copy.deepcopy(decision)
                site = planted["sources"][0]
                if mutation == "missing": site["address"] = "spec:sample.one#question.absent"
                elif mutation == "section": site["address"] = "spec:sample.one#design.typeOne"
                elif mutation == "file": site["file"] = "design/specs/sample/two.sdp.md"
                elif mutation == "shape": site.update(spec="spec:sample.one", question="Keep one.")
                elif mutation == "line": site["line"] = 1
                elif mutation == "openTrue": site["open"] = True
                elif mutation == "notString": site["address"] = []
                else:
                    planted["sources"] = [{"kind":"specQuestion", "spec":"spec:sample.one", "file":source["file"],
                                           "question":"Keep one as it is.", "open":False}]
                    if mutation == "returned": planted["status"] = "decided"
                result, text = self.validate_policy(register={"decisions":[planted]})
                self.assertEqual(result.returncode, 1, text)
                self.assertIn("question-source", text)
        closed = copy.deepcopy(decision)
        closed["status"] = "decided"
        closed["sources"] = [{"kind":"specQuestion", "spec":"spec:sample.one", "file":source["file"],
                              "question":"Keep one as\n it is.", "open":False}]
        result, text = self.validate_policy(register={"decisions":[closed]})
        self.assertEqual(result.returncode, 1, text)
        self.assertIn("open: false question resolves again", text)
        closed["sources"][0]["question"] = "keep one as it is."
        result, text = self.validate_policy(register={"decisions":[closed]})
        self.assertEqual(result.returncode, 0, text)

        self.put("design/specs/sample/one.sdp.md", self.carrier("one").replace("Keep one as it is. Another sentence.", "A different question."))
        result, text = self.validate_policy(register={"decisions":[decision]})
        self.assertEqual(result.returncode, 0, text)

        for key in (" #renamed", ""):
            with self.subTest(key=key):
                self.put("design/specs/sample/one.sdp.md", self.carrier("one").replace(" #keepIt", key))
                result, text = self.validate_policy(register={"decisions":[decision]})
                self.assertEqual(result.returncode, 1, text)
                self.assertIn("question-source", text)
        self.put("design/specs/sample/one.sdp.md", self.carrier("one").replace("### Open questions\n- [non-blocking #keepIt] Keep one as it is. Another sentence.\n", ""))
        closed["sources"][0]["question"] = "Keep one as it is."
        for status in tool.STATUSES:
            with self.subTest(status=status):
                closed["status"] = status
                before = copy.deepcopy(closed)
                result, text = self.validate_policy(register={"decisions":[closed]})
                self.assertEqual(result.returncode, 0 if status in ("decided", "folded") else 1, text)
                self.assertEqual(closed, before)

    def test_closed_question_opening_keeps_citations_and_decimal_points(self):
        question = "Keep `spec:sample.base` at 1.5 bytes. Why?"
        self.put("design/specs/sample/one.sdp.md", self.carrier("one").replace("Keep one as it is. Another sentence.", question))
        decision = row("OD-001", status="folded", sources=[{
            "kind": "specQuestion", "spec": "spec:sample.one", "file": "design/specs/sample/one.sdp.md",
            "question": "Keep `spec:sample.base` at 1.5 bytes.", "open": False,
        }])
        result, text = self.validate_policy(register={"decisions": [decision]})
        self.assertEqual(result.returncode, 1, text)
        self.assertIn("open: false question resolves again", text)

    def test_architecture_parameters_are_scoped_to_the_walk_and_crossings_fail(self):
        self.put("src/components.ts", """/**
 * @sdpAnchor component:sample.platform
 * @sdpContext platform
 * @sdpUses component:sample.orders
 */
export const platform = 1;
/**
 * @sdpAnchor component:sample.orders
 * @sdpContext orders
 */
export const orders = 1;
""")
        result, text = self.validate_policy(walk=True)
        self.assertEqual(result.returncode, 1, text)
        self.assertIn("isolated-context", text)
        self.assertNotIn("unknownParams", text)
        self.put("src/components.ts", (self.root / "src/components.ts").read_text().replace("@sdpContext orders", "@sdpContext platform"))
        result, text = self.validate_policy(walk=True)
        self.assertEqual(result.returncode, 0, text)


class StudioGateTests(unittest.TestCase):
    def test_gate_passes_the_scanners_sections_to_rules(self):
        sys.path.insert(0, str(ROOT / "design/tools"))
        spec = importlib.util.spec_from_file_location("section_check_under_test", CHECK_PATH)
        check = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(check)
        real_run = check.run
        sections = scanner.entry_address_sections() + ["future"]
        def run(args):
            if args[0] == "validate":
                binding = next((arg for arg in args if arg.startswith("addressSections=@")), None)
                self.assertIsNotNone(binding, "the rules did not receive the scanner's section list")
                self.assertEqual(json.loads(Path(binding.split("@", 1)[1]).read_text()), sections)
            return real_run(args)
        with mock.patch.object(check, "entry_address_sections", return_value=sections, create=True), \
             mock.patch.object(check, "address_sites", return_value=[]) as scan, \
             mock.patch.object(check, "run", side_effect=run), contextlib.redirect_stdout(io.StringIO()):
            check.main()
        scan.assert_called_once_with(check.ROOT, sections=sections)

    def test_missing_dependency_fails_without_a_package_lookup(self):
        sys.path.insert(0, str(ROOT / "design/tools"))
        spec = importlib.util.spec_from_file_location("missing_check_under_test", CHECK_PATH)
        check = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(check)
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            binary = root / "bin"
            binary.mkdir()
            os.symlink(shutil.which("node"), binary / "node")
            marker = root / "lookup"
            tripwire = binary / "npx"
            tripwire.write_text('#!/bin/sh\ntouch "$LOOKUP_MARKER"\nexit 99\n')
            tripwire.chmod(0o755)
            with mock.patch.object(check, "ROOT", str(root)), \
                 mock.patch.dict(os.environ, {"PATH": str(binary) + ":/usr/bin:/bin", "LOOKUP_MARKER": str(marker)}):
                result = check.run(["--version"])
            self.assertEqual(result.returncode, 1, result.stderr)
            self.assertIn("run `npm ci`", result.stderr)
            self.assertFalse(marker.exists(), "the gate tried a package lookup")

    def test_gate_runs_the_studio_after_rules_and_refuses_a_dirty_render(self):
        sys.path.insert(0, str(ROOT / "design/tools"))
        spec = importlib.util.spec_from_file_location("studio_check_under_test", CHECK_PATH)
        check = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(check)
        real_run = check.run
        seen = []
        def run(args):
            seen.append(args)
            if args == ["studio", "--check-clean"]:
                return subprocess.CompletedProcess([], 1, "", "sdp studio --check-clean: generated Studio differs from the current projection.\n")
            return real_run(args)
        output = io.StringIO()
        with mock.patch.object(check, "run", side_effect=run), contextlib.redirect_stdout(output):
            with self.assertRaises(SystemExit) as stopped:
                check.main()
        self.assertEqual(stopped.exception.code, 1)
        self.assertIn("generated Studio differs", output.getvalue())
        self.assertIn(["studio", "--check-clean"], seen)
        validate = next(args for args in seen if args[0] == "validate")
        self.assertEqual(validate.count("--rules"), 2)
        self.assertLess(seen.index(validate), seen.index(["studio", "--check-clean"]))


if __name__ == "__main__":
    unittest.main()
