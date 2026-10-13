#!/usr/bin/env python3
"""Find entry addresses outside Specs for design/rules/policy.js.

Run from the repository root: python3 design/tools/scan_addresses.py [ROOT]
Print [{address, where}] as JSON. The package exports the address section list.
Positional citations stay outside entry-address resolution.
"""
import glob
import json
import os
import re
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
MENTION_TOKEN = re.compile(r"spec:[^\s`'\"()\[\]{}<>|,;]+")
ADDRESS_SOURCES = ("src", "fixture", "example", "harness", "tests", "scripts")
ADDRESS_RECORDS = ("decisions/register.json", "reviews/consensus-ledger.json", "STATE.md", "ROADMAP.md", "README.md", "PLAN.md", "SESSIONS.md")


def entry_address_sections():
    """Read the Protocol's exported grammar once for both the scan and the rules."""
    sections = subprocess.run(["node", "--input-type=module", "--eval",
                               'import { ENTRY_ADDRESS_SECTIONS } from "@libar-dev/software-delivery-protocol";'
                               ' console.log(JSON.stringify(ENTRY_ADDRESS_SECTIONS));'],
                              cwd=ROOT, capture_output=True, text=True)
    if sections.returncode:
        reason = (sections.stderr or sections.stdout).strip().splitlines()
        raise ValueError("cannot read the Protocol's entry-address sections: "
                         + (reason[0] if reason else f"node exited {sections.returncode}"))
    return json.loads(sections.stdout)


def address_tokens(paths, base=ROOT, sections=None):
    """Each entry address written in the files, as (token, where), in file and line order."""
    if sections is None:
        sections = entry_address_sections()
    section_pattern = re.compile(r"#(?:" + "|".join(re.escape(section) for section in sections) + r")\b")
    found = []
    for path in sorted(paths):
        with open(path, encoding="utf-8") as lines:
            for number, line in enumerate(lines, 1):
                for token in MENTION_TOKEN.findall(line):
                    token = token.rstrip(".:!?")
                    if section_pattern.search(token):
                        found.append((token, f"{os.path.relpath(path, base)}:{number}"))
    return found



def address_sites(root=ROOT, sections=None):
    files = [path for top in ADDRESS_SOURCES for ext in ("ts", "tsx", "mjs")
             for path in glob.glob(os.path.join(root, top, "**", f"*.{ext}"), recursive=True)]
    files = [path for path in files if "_generated" not in path and not path.endswith(".test.generated.ts")]
    files += [os.path.join(root, "design", name) for name in ADDRESS_RECORDS]
    return [{"address": token, "where": where} for token, where in address_tokens(files, root, sections)]


if __name__ == "__main__":
    json.dump(address_sites(sys.argv[1] if len(sys.argv) > 1 else ROOT), sys.stdout, indent=2)
    print()
