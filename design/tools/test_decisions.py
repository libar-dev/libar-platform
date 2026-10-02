"""Decision queries, patch refusals and the real register's graph coverage.

Run: python3 -m unittest design/tools/test_decisions.py
Fixtures and mutation copies live in operating-system temporary directories.
"""

import collections
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
        "sources": [{"kind": "specQuestion", "ref": "spec:context.tables#1", "file": "design/specs/context/tables.sdp.md", "line": 1}],
        "families": ["context"], "cites": ["E-32", "F13"],
        "provisionalReading": "One bounded call", "blocks": None, "advisor": "convex",
        "status": "unsorted", "class": None, "reason": None, "lean": None,
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
        self.assertEqual(counts["status"], {"unsorted": 1, "sorted": 3, "waiting": 1, "decided": 2})
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
        self.assertEqual(self.ids("--spec", "spec:context.tables#1", "--decided"), ["OD-005", "OD-006"])
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


class RealRegisterTests(unittest.TestCase):
    def test_real_register_has_unique_rows_and_exact_recipe_20_coverage(self):
        register = json.loads((ROOT / "design/decisions/register.json").read_text())
        rows = register["decisions"]
        self.assertEqual(len(rows), 146)
        self.assertEqual([r["id"] for r in rows], [f"OD-{i:03d}" for i in range(1, 147)])
        self.assertEqual(len({r["id"] for r in rows}), 146)
        self.assertTrue(all(r["status"] == "unsorted" for r in rows))
        self.assertTrue(all(r["class"] is None for r in rows))
        self.assertTrue(all(set(s) == {"kind", "ref", "file", "line"} for r in rows for s in r["sources"]))
        self.assertEqual(len(register["possiblySame"]), 46)
        self.assertEqual(register["schema"], 1)
        self.assertEqual(register["units"], ["S3", "S4", "S5", "L3"])
        self.assertEqual(collections.Counter(r["advisor"] for r in rows), {"convex": 30, "domain": 47, "operator": 27, "product": 42})
        self.assertEqual(rows[37]["advisor"], "convex")
        self.assertIn("Probe 6", rows[37]["cites"])
        self.assertIn("Probe 7", rows[37]["cites"])
        refs = collections.Counter(s["ref"] for r in rows for s in r["sources"] if s["kind"] == "specQuestion")
        for decision in rows:
            for source in decision["sources"]:
                if source["kind"] != "specQuestion":
                    continue
                identifier, number = source["ref"].rsplit("#", 1)
                text = (ROOT / source["file"]).read_text()
                self.assertEqual(re.search(r"^id: (\S+)", text, re.M).group(1), identifier)
                lines = text.splitlines()
                start = lines.index("### Open questions")
                end = next((i for i in range(start + 1, len(lines)) if lines[i].startswith("## ")), len(lines))
                locations = [i + 1 for i in range(start + 1, end) if re.match(r"^- \[(?:non-blocking|blocking)\] ", lines[i])]
                self.assertEqual(source["line"], locations[int(number) - 1])
        recipes = (ROOT / "node_modules/@libar-dev/software-delivery-protocol/docs/agent-surface/recipes.md").read_text()
        body = re.search(r"## 20\..*?```js\n(.*?)```", recipes, re.S).group(1)
        result = subprocess.run(["npx", "sdp", "q", body, "--root", "design", "--json"], cwd=ROOT, capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        graph = json.loads(result.stdout)
        expected = collections.Counter(f"{spec['id']}#{i}" for spec in graph["specs"] for i, _ in enumerate(spec["questions"], 1))
        self.assertEqual(graph["totals"]["questions"], 144)
        self.assertEqual(graph["totals"]["malformed"], 0)
        self.assertEqual(refs, expected)
        self.assertTrue(all(n == 1 for n in refs.values()))


if __name__ == "__main__":
    unittest.main()
