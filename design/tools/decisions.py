#!/usr/bin/env python3
"""Read and patch the decision register using only the Python standard library.

Run from anywhere: python3 design/tools/decisions.py [filters] [--json].
The rules are in design/advisors/register.md. A refused patch writes nothing.
"""

import argparse
import collections
import copy
import datetime
import json
import os
from pathlib import Path
import re
import sys
import tempfile


ROOT = Path(__file__).resolve().parents[2]
REGISTER = ROOT / "design/decisions/register.json"
STATUSES = ("unsorted", "sorted", "waiting", "decided", "folded")
CLASSES = ("tactical", "delegated", "owner")
ADVISORS = ("convex", "domain", "operator", "product")
LEAN_FIELDS = ("do", "restsOn", "against", "settles", "changes", "ifWrong")
LOAD_FIELDS = {"id", "title", "sources", "families", "cites", "provisionalReading", "advisor"}
PATCH_FIELDS = {
    "blocks", "status", "class", "reason", "lean", "checkedBy", "fork",
    "decidedBy", "decidedOn", "ruling", "foldedInto",
}


def present(value):
    """A required sentence must have words, not merely a JSON key."""
    return isinstance(value, str) and bool(value.strip())


def date(value):
    try:
        if not isinstance(value, str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", value):
            raise ValueError
        datetime.date.fromisoformat(value)
        return value
    except ValueError:
        raise argparse.ArgumentTypeError("expected a date in YYYY-MM-DD form")


def row_errors(row, units, root, row_ids):
    """Validate the merged row and every patch refusal."""
    errors = []
    status, cls, lean = row.get("status"), row.get("class"), row.get("lean")
    if status not in STATUSES:
        errors.append("status must be unsorted, sorted, waiting, decided or folded")
    if status == "folded" and not present(row.get("reason")):
        errors.append("requires reason when folded")
    targets = row.get("foldedInto", [])
    if not isinstance(targets, list):
        errors.append("foldedInto must be a list of ids")
    else:
        for target in targets:
            if not isinstance(target, str) or target not in row_ids:
                errors.append(f"unknown foldedInto id: {target!r}")
    if cls is not None and cls not in CLASSES:
        errors.append("class must be tactical, delegated, owner or null")
    if row.get("blocks") is not None and row["blocks"] not in units:
        errors.append("blocks must name a unit in the register or be null")
    for field in ("reason", "checkedBy", "fork", "decidedBy", "decidedOn", "ruling"):
        if row.get(field) is not None and not present(row[field]):
            errors.append(f"{field} must be a non-empty string or null")
    if lean is not None:
        if not isinstance(lean, dict):
            errors.append("lean must be an object or null")
        else:
            for field, value in lean.items():
                if field not in LEAN_FIELDS:
                    errors.append(f"unknown lean field: {field}")
                elif not present(value):
                    errors.append(f"lean.{field} must be a non-empty string")
    if status in ("sorted", "waiting", "decided"):
        missing = [key for key in ("class", "reason") if not present(row.get(key))]
        if missing:
            errors.append("requires " + " and ".join(missing) + f" when {status}")
    if status == "waiting" and not (isinstance(lean, dict) and present(lean.get("settles"))):
        errors.append("requires lean.settles when waiting")
    if status == "decided":
        missing = [key for key in ("decidedBy", "decidedOn", "ruling") if not present(row.get(key))]
        if missing:
            errors.append("requires " + ", ".join(missing) + " when decided")
        by = row.get("decidedBy")
        if by == "session" and cls != "tactical":
            errors.append("session may decide only tactical rows")
        elif isinstance(by, str) and by.startswith("advisor:"):
            if by[8:] not in ADVISORS:
                errors.append("decidedBy names an unknown advisor")
            if by[8:] != row.get("advisor"):
                errors.append("decidedBy advisor must equal the row's advisor")
            if cls != "delegated":
                errors.append("an advisor may decide only delegated rows")
            missing = [key for key in LEAN_FIELDS if not isinstance(lean, dict) or not present(lean.get(key))]
            if missing:
                errors.append("an advisor decision requires lean parts: " + ", ".join(missing))
            if not present(row.get("checkedBy")):
                errors.append("an advisor decision requires checkedBy")
        elif present(by) and by not in ("session", "owner"):
            errors.append("decidedBy must be session, advisor:<slug> or owner")
    if row.get("decidedOn") is not None:
        try:
            date(row["decidedOn"])
        except argparse.ArgumentTypeError as exc:
            errors.append("decidedOn: " + str(exc))
    fork = row.get("fork")
    if present(fork) and not (root / fork).is_file():
        errors.append("fork is not a file: " + fork)
    return errors


def merge_patch(register, patch, root):
    """Return the candidate and all reasons, without writing anything."""
    candidate = copy.deepcopy(register)
    errors = []
    if not isinstance(patch, list):
        return candidate, ["patch must be a JSON list of rows"]
    rows = {row["id"]: row for row in candidate["decisions"]}
    changed = []
    for index, update in enumerate(patch, 1):
        label = f"patch row {index}"
        if not isinstance(update, dict):
            errors.append(label + ": must be an object")
            continue
        identifier = update.get("id")
        if not isinstance(identifier, str) or identifier not in rows:
            errors.append(label + f": unknown id: {identifier!r}")
        else:
            label = identifier
        for field in update:
            if field not in LOAD_FIELDS | PATCH_FIELDS:
                errors.append(label + ": unknown field: " + field)
        if not isinstance(identifier, str) or identifier not in rows:
            continue
        row = rows[identifier]
        for field, value in update.items():
            if field in LOAD_FIELDS:
                if value != row[field]:
                    errors.append(label + ": cannot change load field: " + field)
            elif field in PATCH_FIELDS:
                # A lean is one value. Updating it replaces the object; it is not a deep merge.
                row[field] = value
        if identifier not in changed:
            changed.append(identifier)
    for identifier in changed:
        errors.extend(identifier + ": " + reason for reason in row_errors(rows[identifier], register["units"], root, rows))
        original = next(row for row in register["decisions"] if row["id"] == identifier)
        if rows[identifier]["blocks"] != original["blocks"] and not present(rows[identifier]["reason"]):
            errors.append(identifier + ": correcting blocks requires reason")
    return candidate, errors


def apply_patch(path, patch, root):
    original = path.read_bytes()
    register = json.loads(original)
    candidate, errors = merge_patch(register, patch, root)
    if errors:
        return errors
    write_register(path, original, register, candidate)
    return []


def write_register(path, original, register, candidate):
    """Keep serialization stable and replace the register atomically."""
    if candidate == register:
        return
    text = original.decode("utf-8")
    match = re.search(r'\n([ \t]+)"', text)
    indent = match.group(1) if match else "  "
    ending = "\r\n" if "\r\n" in text else "\n"
    rendered = json.dumps(candidate, ensure_ascii=False, indent=indent)
    if ending == "\r\n":
        rendered = rendered.replace("\n", ending)
    if text.endswith("\n"):
        rendered += ending
    temporary = None
    try:
        # A sibling temporary file permits atomic replacement on any filesystem.
        with tempfile.NamedTemporaryFile(dir=path.parent, prefix=".decisions-", delete=False) as stream:
            temporary = Path(stream.name)
            stream.write(rendered.encode("utf-8"))
            stream.flush()
            os.fsync(stream.fileno())
        os.chmod(temporary, path.stat().st_mode & 0o777)
        os.replace(temporary, path)
    finally:
        if temporary is not None and temporary.exists():
            temporary.unlink()


def reassign(path, identifier, advisor, reason, root):
    """The main thread's explicit exception to the immutable advisor field."""
    original = path.read_bytes()
    register = json.loads(original)
    candidate = copy.deepcopy(register)
    row = next((r for r in candidate["decisions"] if r["id"] == identifier), None)
    errors = []
    if row is None:
        errors.append("unknown id: " + identifier)
    if advisor not in ADVISORS:
        errors.append("unknown advisor: " + advisor)
    if not present(reason):
        errors.append("reassign requires reason")
    if errors:
        return errors
    row.update(advisor=advisor, status="unsorted", **{"class": None, "reason": reason, "lean": None})
    errors = row_errors(row, register["units"], root, {r["id"] for r in register["decisions"]})
    if not errors:
        write_register(path, original, register, candidate)
    return errors


def summary(register):
    rows = register["decisions"]
    def counts(field, values):
        counted = collections.Counter(row[field] for row in rows)
        return {value: counted[value] for value in values}
    return {
        "total": len(rows),
        "status": counts("status", STATUSES),
        "class": counts("class", CLASSES + (None,)),
        "advisor": counts("advisor", ADVISORS),
    }


def select(register, args):
    rows = register["decisions"]
    wanted_status = args.status or ("unsorted" if args.unsorted else "waiting" if args.waiting else "decided" if args.decided else None)
    wanted_class = "owner" if args.owner else args.decision_class
    before = register["units"][:register["units"].index(args.before) + 1] if args.before else None
    def matches(row):
        if row["status"] == "folded" and not (args.id or args.status == "folded"):
            return False
        if wanted_status and row["status"] != wanted_status:
            return False
        if wanted_class and row["class"] != wanted_class:
            return False
        if args.owner and row["status"] == "decided":
            return False
        for field, wanted in (("advisor", args.advisor), ("blocks", args.blocks), ("id", args.id)):
            if wanted and row[field] != wanted:
                return False
        if before is not None and row["blocks"] not in before:
            return False
        if args.by == "advisor" and not (row["decidedBy"] or "").startswith("advisor:"):
            return False
        if args.by and args.by != "advisor" and row["decidedBy"] != args.by:
            return False
        if args.since and (not row["decidedOn"] or row["decidedOn"] < args.since):
            return False
        if args.family and args.family not in row["families"]:
            return False
        if args.cites and args.cites not in row["cites"]:
            return False
        if args.spec:
            refs = [source["ref"] for source in row["sources"] if source["kind"] in ("specQuestion", "specLine")]
            if not any(ref == args.spec or ref.split("#")[0] == args.spec for ref in refs):
                return False
        if (args.spec or args.family or args.cites) and row["status"] == "decided":
            if wanted_status != "decided":
                return False
        return True
    selected = [row for row in rows if matches(row)]
    if args.owner:
        order = {unit: index for index, unit in enumerate(register["units"])}
        selected.sort(key=lambda row: (not bool(row["fork"]), order.get(row["blocks"], len(order))))
    return selected


def one_line(row, waiting=False):
    values = [row["id"], row["class"] or "-", row["advisor"], row["blocks"] or "-", row["title"]]
    lean = row["lean"] or {}
    if lean.get("do"):
        values.append(lean["do"])
    if waiting and lean.get("settles"):
        values.append("waits for: " + lean["settles"])
    return " | ".join(" ".join(value.split()) for value in values)


def main(argv=None, register_path=None, root=None):
    path = Path(register_path) if register_path is not None else REGISTER
    root = Path(root) if root is not None else ROOT
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", nargs="?", choices=("apply", "reassign"))
    parser.add_argument("patch", nargs="?")
    parser.add_argument("new_advisor", nargs="?")
    parser.add_argument("--reason")
    parser.add_argument("--json", action="store_true")
    parser.add_argument("--owner", action="store_true")
    parser.add_argument("--before")
    parser.add_argument("--blocks")
    parser.add_argument("--class", dest="decision_class", choices=CLASSES)
    state = parser.add_mutually_exclusive_group()
    state.add_argument("--status", choices=STATUSES)
    state.add_argument("--unsorted", action="store_true")
    state.add_argument("--waiting", action="store_true")
    state.add_argument("--decided", action="store_true")
    parser.add_argument("--advisor", choices=ADVISORS)
    parser.add_argument("--by", choices=("advisor", "session", "owner") + tuple("advisor:" + slug for slug in ADVISORS))
    parser.add_argument("--since", type=date)
    parser.add_argument("--spec")
    parser.add_argument("--family")
    parser.add_argument("--cites")
    parser.add_argument("--id")
    args = parser.parse_args(argv)
    try:
        register = json.loads(path.read_text(encoding="utf-8"))
        for name in ("before", "blocks"):
            value = getattr(args, name)
            if value is not None and value not in register["units"]:
                parser.error("--" + name + " must name a unit in the register")
        filters = any(getattr(args, name) for name in (
            "owner", "before", "blocks", "decision_class", "status", "unsorted", "waiting",
            "decided", "advisor", "by", "since", "spec", "family", "cites", "id",
        ))
        if args.action == "reassign":
            if not args.patch or not args.new_advisor:
                parser.error("reassign requires an id and an advisor")
            if filters:
                parser.error("reassign does not accept query filters")
            errors = reassign(path, args.patch, args.new_advisor, args.reason, root)
            if args.json:
                print(json.dumps({"reassigned": not errors, "id": args.patch, "advisor": args.new_advisor, "reasons": errors}, ensure_ascii=False))
            elif errors:
                print("REFUSED")
                for error in errors:
                    print(error)
            else:
                print(f"Reassigned {args.patch} to {args.new_advisor}")
            return 1 if errors else 0
        if args.action == "apply":
            if not args.patch:
                parser.error("apply requires a patch file")
            if filters:
                parser.error("apply does not accept query filters")
            if args.new_advisor or args.reason is not None:
                parser.error("apply takes one patch file and no --reason")
            patch = json.loads(Path(args.patch).read_text(encoding="utf-8"))
            errors = apply_patch(path, patch, root)
            result = {"applied": not errors, "reasons": errors}
            if args.json:
                print(json.dumps(result, ensure_ascii=False))
            elif errors:
                print("REFUSED")
                for error in errors:
                    print(error)
            else:
                print("Applied")
            return 1 if errors else 0
        if args.reason is not None:
            parser.error("--reason is for reassign")
        if not filters:
            result = summary(register)
            if args.json:
                print(json.dumps(result, ensure_ascii=False))
            else:
                print("total: " + str(result["total"]))
                for field in ("status", "class", "advisor"):
                    print(field + ": " + ", ".join(f"{'null' if key is None else key}={value}" for key, value in result[field].items()))
            return 0
        rows = select(register, args)
        if args.id:
            if not rows:
                print("Unknown or filtered-out id: " + args.id, file=sys.stderr)
                return 1
            row = rows[0]
            pairs = [pair for pair in register.get("possiblySame", []) if args.id in pair[:2]]
            if args.json:
                print(json.dumps({"decision": row, "possiblySame": pairs}, ensure_ascii=False))
            else:
                print(one_line(row))
                for key, value in row.items():
                    print(key + ": " + json.dumps(value, ensure_ascii=False))
                for left, right, reason in pairs:
                    print(f"possiblySame: {left} | {right} | {reason}")
        elif args.json:
            print(json.dumps(rows, ensure_ascii=False))
        else:
            for row in rows:
                print(one_line(row, args.waiting or args.status == "waiting"))
        return 0
    except (OSError, ValueError) as exc:
        print("Error: " + str(exc), file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
