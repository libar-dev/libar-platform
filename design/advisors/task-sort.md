# Task: sort the open decisions of your lens

Your launch names your slug and the path of the patch you write, written below as `<slug>` and `<patch>`. Work for about thirty minutes.

## Why this work exists

Every open decision used to wait for the owner, whoever would decide it best. The owner asked on 2026-10-02 for tactical decisions, and decisions a capable agent makes better, to be made by an agent, and for help with the rest. Your sort says which decision is whose. A wrong `delegated` takes a decision from the owner. A wrong `owner` puts one more question in front of one person. When unsure, the rule says which way to fall.

## Before you sort

Read `design/advisors/protocol.md`, then `design/advisors/project-context.md`, then `design/advisors/lenses/<slug>.md`, then `design/advisors/register.md`. List your rows:

`python3 design/tools/decisions.py --unsorted --advisor <slug>`

## What you do with each row

1. Open the first source at its file and line and read the question where it stands. Read what it rests on only where the class turns on it. A row takes minutes.
2. Apply the sorting rule in order. Write `class`, and `reason`: one line that names the test of the rule that gave the class.
3. Write `status`: `sorted`, or `waiting` when a probe, a measurement, a build or a trigger must come first. Then `lean.settles` names which.
4. Leave `blocks` as it is, unless a Spec or `STATE.md` shows another unit. Then correct it and say where you read it in `reason`.
5. Write `lean.do` where you can stand behind one line now. It starts with a verb. "Keep the provisional reading" is a lean when that reading is built, passes at a tier you name in `reason`, and you looked for the case against it. Where you cannot stand behind a line, leave `lean` out.
6. Leave a row unsorted, with a `reason`, when it is plainly another advisor's, when it is the same decision as another row, when the owner has ruled on it already, or when it is not a decision. Name the other advisor, the other id or the place of the ruling.

## Then, your delegated rows

When every row has a class, write the lean in full for your `delegated` rows, those that block the nearest unit first, as far as your time allows: all six parts of the protocol's lean, a sentence or two each, every sentence on its basis. Once its facts are checked, that lean is the ruling, so write it as one. A row whose lean you could not finish stays `sorted` with `lean.do` alone.

## The patch

One file at `<patch>`: a JSON list, one object for each row you touched, with `id` and the fields you set. Nothing else in the repository changes.

```json
[
  { "id": "OD-014", "class": "delegated", "status": "sorted", "reason": "A mechanism the doc leaves open, taken back by an edit to one Spec and one file.", "lean": { "do": "Keep admission as an optional policy of the declaration." } },
  { "id": "OD-031", "class": "owner", "status": "waiting", "reason": "Product direction: the largest order an adopter may place.", "lean": { "settles": "The measurement of slice S3 at 1, 10 and 100 lines, then the owner's choice." } }
]
```

Check that the file parses before you return.

## What you return

Text only, at most twelve lines: the path of the patch, your rows by class, how many are `waiting`, how many leans in full you wrote, the rows you left unsorted and why, the three rows you are least sure of, and each word you needed that `CONTEXT.md` does not have.
