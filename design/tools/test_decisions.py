"""Decision queries, patch refusals and the real register's question sources.

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
import subprocess
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[2]
TOOL_PATH = Path(os.environ.get("DECISIONS_TOOL_UNDER_TEST", ROOT / "design/tools/decisions.py"))
SPEC = importlib.util.spec_from_file_location("decisions_under_test", TOOL_PATH)
tool = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(tool)


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
        "sources": [{"kind": "specQuestion", "spec": "spec:context.tables", "question": "Keep a bounded context call.", "file": "design/specs/context/tables.sdp.md"}],
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


class QuestionSourceTests(unittest.TestCase):
    def setUp(self):
        self.row = row("OD-001")
        self.spec = "spec:context.tables"
        self.files = {self.spec: "design/specs/context/tables.sdp.md"}
        self.questions = {self.spec: ["Keep a bounded context call. Another sentence."]}

    def errors(self):
        return tool.question_source_errors(self.row, self.questions, self.files)

    def test_opening_is_verbatim_and_matching_normalizes_only_whitespace(self):
        self.assertEqual(tool.question_opening("Keep `spec:context.tables` at 1.5 bytes. Why?"),
                         "Keep `spec:context.tables` at 1.5 bytes.")
        self.row["sources"][0]["question"] = "Keep a bounded\n context call."
        self.assertEqual(self.errors(), [])
        self.row["sources"][0]["question"] = "keep a bounded context call."
        self.assertTrue(self.errors())

    def test_missing_ambiguous_wrong_file_and_old_shape_are_refused(self):
        for mutation in ("missing", "ambiguous", "file", "spec", "old", "line", "openTrue"):
            with self.subTest(mutation=mutation):
                saved_row = copy.deepcopy(self.row)
                saved_questions = copy.deepcopy(self.questions)
                source = self.row["sources"][0]
                if mutation == "missing": self.questions[self.spec] = []
                elif mutation == "ambiguous": self.questions[self.spec] *= 2
                elif mutation == "file": source["file"] = "another.sdp.md"
                elif mutation == "spec": source["spec"] = "spec:missing"
                elif mutation == "old":
                    source.pop("spec")
                    source.pop("question")
                    source.update(ref="spec:context.tables#1", line=1)
                elif mutation == "line": source["line"] = 1
                elif mutation == "openTrue": source["open"] = True
                self.assertTrue(self.errors())
                self.row, self.questions = saved_row, saved_questions

    def test_removed_question_requires_closed_status_and_refuses_return(self):
        self.row["sources"][0]["open"] = False
        self.questions[self.spec] = []
        for status in tool.STATUSES:
            self.row["status"] = status
            with self.subTest(status=status):
                self.assertEqual(bool(self.errors()), status not in ("decided", "folded"))
        self.questions[self.spec] = ["Keep a bounded context call. Returned text."]
        self.assertIn("open: false question resolves again", " ".join(self.errors()))


class RealRegisterTests(unittest.TestCase):
    def test_real_register_has_unique_ids_and_resolving_question_sources(self):
        register = json.loads((ROOT / "design/decisions/register.json").read_text())
        rows = register["decisions"]
        ids = [r["id"] for r in rows]
        self.assertEqual(len(set(ids)), len(ids))
        recipes = (ROOT / "node_modules/@libar-dev/software-delivery-protocol/docs/agent-surface/recipes.md").read_text()
        body = re.search(r"## 20\..*?```js\n(.*?)```", recipes, re.S).group(1)
        result = subprocess.run(["npx", "sdp", "q", body, "--root", ".", "--json"],
                                cwd=ROOT, capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        graph = json.loads(result.stdout)
        self.assertEqual(graph["malformed"], [])
        questions = {spec["id"]: [q["question"] for q in spec["questions"]] for spec in graph["specs"]}
        files = {}
        for path in (ROOT / "design/specs").rglob("*.sdp.md"):
            identifier = re.search(r"^id: (\S+)", path.read_text(), re.M).group(1)
            files[identifier] = path.relative_to(ROOT).as_posix()
        for decision in rows:
            with self.subTest(row=decision["id"]):
                self.assertEqual(tool.row_errors(decision, register["units"], ROOT, set(ids)), [])
                self.assertEqual(tool.question_source_errors(decision, questions, files), [])


if __name__ == "__main__":
    unittest.main()
