# The decision register

Every open decision of the platform is one row of `design/decisions/register.json`, with a class that says who decides it. `python3 design/tools/decisions.py` filters the rows. This page holds the rule that sorts a decision, the rule that gives it an advisor, the fields of a row and what the tool answers.

## Three classes

| Class | What it is | Who decides | Where it is recorded | What the owner sees | How the owner reopens it |
|---|---|---|---|---|---|
| `tactical` | How the work runs: tooling, order, layout, who does what. It changes nothing a Spec promises. | The session, on its own recommendation. | A numbered line under "Tactical decisions" in `design/STATE.md`, and the row, with that number in `ruling`. | Nothing is sent. `STATE.md` holds the list. | The owner says so. Any of them can be reopened. |
| `delegated` | A platform decision that an agent decides better than the owner would, and that an edit can take back. | The advisor the row belongs to, by a lean in full whose facts a model of the other family has checked. The main thread applies it. It may send the row to the owner, and it does not put its own judgment in place of the lean. | The row. The Spec keeps or takes the reading the lean names. | One line for each at a close: `decisions.py --decided --by advisor --since <date>`. | The owner names the id. The row becomes `owner` and `sorted`, an advisor writes its fork, and the ruling stays as the provisional reading until the owner answers. |
| `owner` | The owner's own. | The owner, in an `owner` unit. An advisor writes a fork with a lean, and the session carries on on the provisional reading. | The fork, `design/decisions/forks/<id>.md`, and the row, with the owner's words in `ruling`. | The forks, ordered by the unit each blocks: `decisions.py --owner`. | It is the owner's already. |

## The sorting rule

Ask in this order. The first yes gives the class.

1. **`owner`**, when one of these holds:
   - Settling it edits the doc, or goes against a decision, a law or a scenario of the doc.
   - It is product direction: who the platform is for, what it promises an adopter, what is in scope and what is cut, what a public thing is called, when and how it is released.
   - It is about money, a licence or publication.
   - An edit inside this repository cannot take it back: something released, published, said in public or paid, or `ready` stated on a Spec.
   - It trades one value for another and no evidence says which weighs more, such as safety against ease of adoption, or cost against strictness.
   - It rules on a term of `CONTEXT.md`.
2. **`tactical`**, when it changes nothing a Spec promises.
3. **`delegated`**, for every platform decision that is left: which Convex mechanism, a signature, the shape of a table or an index, a bound and its number, the order of steps, a name inside the language as it is ruled, an extension whose alternatives lose on a documented or probed fact.

When unsure between two classes, take the one nearer the owner and say the doubt in `reason`. A decision with one part that is the owner's is `owner`: its fork says which part only the owner decides and gives the rest as the lean.

A decision that a probe, a measurement, a build or a trigger must settle before anyone can decide it is sorted like any other and gets the status `waiting`.

## Which advisor a decision belongs to

Each row belongs to exactly one advisor. The rule reads the row's sources and is applied when the row is loaded. The first match wins.

1. A source of kind `productDecision`: `product`.
2. The first source that names a Spec, by the table below. An example goes with its parent.
3. The first E-number the row cites, by the first Spec under "Owned by" in the extension register.
4. A cited F-number or probe: `convex`. A cited D-number: the `decisions` cells of the table.
5. Everything else: `product`.

| Advisor | Specs |
|---|---|
| `convex` | `facts`, `constraints`; `context` except `journal` and `event-envelope`; `platform.native-harness`; `application.first-experiment` |
| `domain` | `kernel`, `laws`; `context.journal`, `context.event-envelope`; `command` except the two named under `operator`; `application` except the three named in other rows; `processes`; `decisions` D1 to D10 and D12 |
| `operator` | `operations`, `obligations`, `effects`; `command.tenancy-and-authority`, `command.actor-and-scope`; `application.restore`, `application.write-pause`; `decisions` D11, D13 to D15 and D19 |
| `product` | `platform` except `native-harness`; `agents`, `advanced`; `decisions` D16 to D18 |

An advisor that finds a row plainly another's leaves it unsorted and says so in `reason`. The main thread moves it.

## The file

```json
{
  "schema": 1,
  "units": ["S3", "S4", "S5", "L3"],
  "decisions": [
    {
      "id": "OD-014",
      "title": "Admission is an optional per-command policy in the declaration, absent by default",
      "sources": [
        { "kind": "specQuestion", "ref": "spec:command.command-pipeline#3", "file": "design/specs/command/command-pipeline.sdp.md", "line": 61 },
        { "kind": "extension", "ref": "E-32", "file": "design/README.md", "line": 211 }
      ],
      "families": ["command"],
      "cites": ["E-32", "D4", "D6", "D7"],
      "provisionalReading": "here admission is an optional per-command policy in the declaration, absent by default",
      "blocks": null,
      "advisor": "domain",
      "status": "unsorted",
      "class": null,
      "reason": null,
      "lean": null,
      "checkedBy": null,
      "fork": null,
      "decidedBy": null,
      "decidedOn": null,
      "ruling": null
    }
  ]
}
```

`units` is the order of the units a decision can block. The tool reads "before S4" from it, and a close keeps it current.

| Field | What it holds | Filled by |
|---|---|---|
| `id` | `OD-` and three digits, given in source order and never reused | the load |
| `title` | The first sentence of the first source, cut at 120 characters | the load |
| `sources` | Where the decision came from, every place once. `kind` is `ownerQueue`, `specQuestion`, `extension`, `planAmbiguity` or `productDecision`. `ref` is the lasting name: `000/3` for the third bullet of owner queue item 000, `<spec id>#<n>` for a Spec's n-th open question in authored order, `E-32`, `11.3` for an ambiguity of `PLAN.md`. `file` and `line` say where it stood at the load. | the load |
| `families` | The Spec families it touches | the load |
| `cites` | The tokens its sources cite: E, D, F, OQ, Sc, Probe, Law | the load |
| `provisionalReading` | What the code or the Specs rest on today, word for word from the source, or `null` | the load |
| `blocks` | The first unit that needs it, or `null` for nothing | the load, and an advisor may correct it with the reason |
| `advisor` | `convex`, `domain`, `operator` or `product`, by the rule above | the load |
| `status` | `unsorted`, `sorted`, `waiting` or `decided` | the load, then a patch |
| `class` | `tactical`, `delegated`, `owner` or `null` | an advisor |
| `reason` | One line: the test of the sorting rule that gave the class | an advisor |
| `lean` | `null`, or `{ do, restsOn, against, settles, changes, ifWrong }` as the protocol defines a lean. A sort may fill `do` alone. | an advisor |
| `checkedBy` | The model that checked the lean's facts, or `null` | the main thread |
| `fork` | The path of the fork, or `null` | an advisor |
| `decidedBy` | `session`, `advisor:<slug>` or `owner` | the main thread |
| `decidedOn` | The date | the main thread |
| `ruling` | One line: what was ruled. The owner's ruling is in the owner's words. A tactical one names its number in `STATE.md`. | the main thread |

The load is mechanical: every field it fills is read off the sources, with no judgment. A row never carries the text of a Spec. The Spec is where its question is read.

An advisor never writes the file. It writes a patch: a JSON list of rows with `id` and the fields it changes. `decisions.py apply <patch>` merges it and refuses the whole patch when a row:

- names an unknown id or an unknown field, or changes a field the load fills, other than `blocks` and `status`;
- is `sorted`, `waiting` or `decided` with no `class` and `reason`;
- is `waiting` with no `lean.settles`;
- is `decided` with no `decidedBy`, `decidedOn` and `ruling`;
- is decided by `session` and is not `tactical`, or by an advisor and is not `delegated` with all six parts of the lean and a `checkedBy`;
- names a `fork` that is not a file.

The owner may decide a row of any class.

## What the tool answers

One line for each decision: its id, class, advisor, the unit it blocks, its title, and `lean.do` when there is one. The tool reads `status`, `class`, `advisor`, `blocks`, `families`, `cites`, `sources`, `fork`, `decidedBy` and `decidedOn`.

| Question | Command |
|---|---|
| Where does the register stand? Counts by status, class and advisor | `decisions.py` |
| What does the owner have to decide before S4? | `decisions.py --owner --before S4` |
| Every decision that waits for the owner, forks first | `decisions.py --owner` |
| What did agents decide this week? | `decisions.py --decided --by advisor --since 2026-09-28`, and `--by session` |
| What is left to sort, for one advisor? | `decisions.py --unsorted --advisor convex` |
| Which delegated decisions have no checked lean in full yet? | `decisions.py --class delegated --status sorted` |
| What blocks S4, whoever decides it? | `decisions.py --blocks S4` |
| What waits for a probe, a measurement, a build or a trigger, and for which? | `decisions.py --waiting` |
| What is open on one Spec, one family or one E-number? | `decisions.py --spec spec:application.rebuild`, `--family command`, `--cites E-32` |
| One row in full | `decisions.py --id OD-014` |
| Merge an advisor's patch | `decisions.py apply <patch>` |
