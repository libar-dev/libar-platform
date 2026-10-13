// libar-platform's graph-side policy, as one corpus rules file (spec:validation.corpus-rules).
// Run it from the repository root after scanning addresses with design/tools/scan_addresses.py:
//
//   npx sdp validate . --rules design/rules/policy.js \
//     --params intended=@design/tools/prose-mentions.json \
//     --params register=@design/decisions/register.json \
//     --params addressSites=@generated/address-sites.json \
//     --rules node_modules/@libar-dev/software-delivery-protocol/dist/recipes/42-the-architecture-walk.js \
//     --params '{"isolated":["platform"]}'
//
// Each --params belongs to the --rules before it, so the walk receives only `isolated`.
//
// It reads the graph, the Protocol's report and params, and no file. addressSites is the list of
// { address, where } a scan outside the Protocol writes; a rule cannot read the source files.
const diagnostics = [];
const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
if (!object(params.intended) || !Array.isArray(params.intended.pairs))
  diagnostics.push({ parameter: "intended", problem: "Pass design/tools/prose-mentions.json as intended." });
if (!object(params.register) || !Array.isArray(params.register.decisions))
  diagnostics.push({ parameter: "register", problem: "Pass design/decisions/register.json as register." });
if (!Array.isArray(params.addressSites))
  diagnostics.push({ parameter: "addressSites", problem: "Pass the scanned [{ address, where }] list as addressSites." });
if (diagnostics.length > 0) return { diagnostics };

const findings = [];
const at = (source) =>
  source?.file === undefined || source.file === null
    ? {}
    : { file: source.file, ...(Number.isInteger(source.line) ? { line: source.line } : {}) };
const fail = (validatorId, subjectId, message, extra = {}) =>
  findings.push({ validatorId, subjectId, severity: "error", message, ...extra });
const byCodeUnit = (left, right) => (left < right ? -1 : left > right ? 1 : 0);
const specs = g.specs();
const contexts = new Map(specs.map((spec) => [spec.id, g.specContext(spec.id)]));
// Readiness and citation policy apply to carriers under design/specs.
const designSpecs = specs.filter((spec) => spec.file.startsWith("design/specs/") && spec.file.endsWith(".sdp.md"));
const designFiles = new Map(designSpecs.map((spec) => [spec.id, spec.file]));

// Readiness divergence: a stated rung the floor does not reach.
const rungs = ["idea", "scoped", "defined", "ready"];
const rank = (rung) => (rung === undefined || rung === null ? -1 : rungs.indexOf(rung));
for (const spec of specs) {
  if (rank(spec.derivedReadiness) < rank(spec.statedReadiness))
    fail("readiness-divergence", spec.id,
      `stated readiness ${spec.statedReadiness} is not earned: the floor reaches ${spec.derivedReadiness ?? "no rung"}`,
      { file: spec.file });
}

// A prose mention with no relation is listed with its reason; a listed pair still warns; the
// only warnings are prose mentions.
const pairKey = (from, to) => JSON.stringify([from, to]);
const listed = new Map(params.intended.pairs.map((pair) => [pairKey(pair.from, pair.to), pair]));
const warned = new Map();
for (const finding of report.findings) {
  if (finding.severity !== "warning") continue;
  if (finding.validatorId === "conformance/prose-mentions") {
    warned.set(pairKey(finding.subjectId, finding.relatedId), finding);
  } else {
    fail("other-warning", finding.subjectId ?? "corpus",
      `validate warns other than a prose mention: ${finding.validatorId}: ${finding.message}`, at(finding));
  }
}
for (const [key, finding] of [...warned].sort(([left], [right]) => byCodeUnit(left, right))) {
  if (!listed.has(key))
    fail("unlisted-mention", finding.subjectId,
      `${finding.subjectId} mentions ${finding.relatedId} at ${finding.path} with no relation: declare the relation that fits, or list the pair with its reason in design/tools/prose-mentions.json`,
      { relatedId: finding.relatedId, ...at(finding) });
}
for (const [key, pair] of [...listed].sort(([left], [right]) => byCodeUnit(left, right))) {
  if (!warned.has(key))
    fail("stale-mention", pair.from,
      `${pair.from} -> ${pair.to} is listed in design/tools/prose-mentions.json and no longer warns; remove the line`,
      { relatedId: pair.to });
  if (typeof pair.reason !== "string" || pair.reason.trim() === "")
    fail("mention-reason", pair.from,
      `${pair.from} -> ${pair.to} is listed in design/tools/prose-mentions.json with no reason`,
      { relatedId: pair.to });
}

// Entry-address resolution, on the grammar recipe 25 reads.
const addressPattern = /^(spec:[A-Za-z0-9][A-Za-z0-9-]*(?:\.[A-Za-z0-9][A-Za-z0-9-]*)*)#(design|ui|question|rule)\.([a-z][A-Za-z0-9]*)$/u;
const resolve = (address) => {
  const parsed = typeof address === "string" ? addressPattern.exec(address) : null;
  if (parsed === null) return { resolves: false, reason: "is outside the address grammar" };
  const [, id, section, key] = parsed;
  const context = contexts.get(id);
  if (context === undefined) return { resolves: false, id, reason: "names no Spec" };
  const sections = context.sections ?? {};
  const keys =
    section === "question"
      ? (sections.intent?.openQuestions ?? []).flatMap((question) => (typeof question?.key === "string" ? [question.key] : []))
      : section === "rule"
        ? Object.keys(sections.behavior?.ruleKeys ?? {})
        : Object.keys(sections[section] ?? {}).filter((name) => name !== "description");
  return keys.includes(key)
    ? { resolves: true, id, section }
    : { resolves: false, id, section, reason: "names no entry of its Spec" };
};

// Entry addresses written outside the Specs resolve. The scan that finds them stays outside.
for (const site of params.addressSites) {
  const answer = resolve(site?.address);
  if (!answer.resolves)
    fail("address-resolves", String(site?.address), `entry address ${site?.address} at ${site?.where} ${answer.reason}`);
}

// No Spec rests on itself through dependsOn: strongly connected sets over declared dependsOn.
const ids = specs.map((spec) => spec.id).sort(byCodeUnit);
const known = new Set(ids);
const targets = new Map(ids.map((id) => [id, []]));
for (const edge of graph.edges)
  if (edge.type === "dependsOn" && edge.claim === "declared" && known.has(edge.from) && known.has(edge.to))
    targets.get(edge.from).push(edge.to);
for (const list of targets.values()) list.sort(byCodeUnit);
const order = new Map();
const low = new Map();
const stack = [];
const onStack = new Set();
const strongSets = [];
const enter = (id) => {
  order.set(id, order.size);
  low.set(id, order.get(id));
  stack.push(id);
  onStack.add(id);
};
for (const root of ids) {
  if (order.has(root)) continue;
  enter(root);
  const frames = [{ id: root, at: 0 }];
  while (frames.length > 0) {
    const frame = frames[frames.length - 1];
    const list = targets.get(frame.id);
    if (frame.at < list.length) {
      const next = list[frame.at++];
      if (!order.has(next)) {
        enter(next);
        frames.push({ id: next, at: 0 });
      } else if (onStack.has(next)) low.set(frame.id, Math.min(low.get(frame.id), order.get(next)));
      continue;
    }
    frames.pop();
    if (low.get(frame.id) === order.get(frame.id)) {
      const members = [];
      let member;
      do {
        member = stack.pop();
        onStack.delete(member);
        members.push(member);
      } while (member !== frame.id);
      strongSets.push(members.sort(byCodeUnit));
    }
    const parent = frames[frames.length - 1];
    if (parent !== undefined) low.set(parent.id, Math.min(low.get(parent.id), low.get(frame.id)));
  }
}
for (const members of strongSets.sort((left, right) => byCodeUnit(left[0], right[0]))) {
  if (members.length > 1 || targets.get(members[0]).includes(members[0]))
    fail("dependency-cycle", members[0], `dependsOn cycle among ${members.join(", ")}`);
}

// Open questions: well formed, keyed, and a blocking one holds its Spec at scoped.
for (const spec of specs) {
  const context = contexts.get(spec.id);
  const questions = context?.sections?.intent?.openQuestions;
  if (questions === undefined) continue;
  const line = (index) => context.entryLocations.find((row) => row.entry === `question[${index}]`)?.line;
  const where = (index) => ({ file: spec.file, ...(Number.isInteger(line(index)) ? { line: line(index) } : {}) });
  if (!Array.isArray(questions)) {
    fail("malformed-question", spec.id, `${spec.id} carries open questions that are not a list`, { file: spec.file });
    continue;
  }
  let blocking = 0;
  questions.forEach((question, index) => {
    const text = typeof question === "string" ? question : question?.question;
    if (typeof text !== "string" || text.trim() === "")
      return fail("malformed-question", spec.id, `${spec.id} carries an open question with no text`, where(index));
    if (typeof question !== "string" && "blocking" in question && typeof question.blocking !== "boolean")
      return fail("malformed-question", spec.id, `${spec.id} carries an open question whose blocking flag is not a boolean`, where(index));
    if (typeof question !== "string" && "key" in question && !/^[a-z][A-Za-z0-9]*$/u.test(String(question.key)))
      return fail("malformed-question", spec.id, `${spec.id} carries an open question whose key is not lower-camel`, where(index));
    if (typeof question === "string" || typeof question.key !== "string")
      fail("question-key", spec.id, `${spec.id} carries an open question without a key`, where(index));
    if (typeof question !== "string" && question.blocking === true) blocking += 1;
  });
  if (blocking > 0 && spec.statedReadiness !== "scoped")
    fail("blocking-means-scoped", spec.id, `${spec.id} carries a blocking question and states ${spec.statedReadiness}`, { file: spec.file });
}

// Nobody but the owner states ready, and a cited law or fact carries its constrainedBy edge.
const citationExempt = (spec) => {
  const family = spec.id.split(":")[1].split(".")[0];
  return spec.specKind === "decision" || spec.specKind === "example" || family === "laws" || family === "facts" || spec.id === "spec:platform.vocabulary";
};
const entryLines = (sections) => {
  const lines = [...(sections.behavior?.rules ?? []), ...(sections.behavior?.flows ?? [])];
  for (const [key, value] of Object.entries(sections.design ?? {})) if (key !== "description") lines.push(`${key}: ${value}`);
  const decision = sections.decision ?? {};
  lines.push(...[decision.context, decision.decision].filter((text) => typeof text === "string"));
  lines.push(...(decision.rationale ?? []), ...(decision.alternatives ?? []), ...(decision.consequences ?? []));
  for (const constraint of sections.constraints ?? [])
    lines.push(...[constraint.statement, constraint.flavor, constraint.target, constraint.measurableBy].filter((text) => typeof text === "string"));
  for (const [term, definition] of Object.entries(sections.model?.terms ?? {})) lines.push(`**${term}**: ${definition}`);
  return lines.map(String);
};
const numbers = (texts, pattern) => new Set(texts.flatMap((text) => [...text.matchAll(pattern)].map((match) => Number(match[1]))));
for (const spec of designSpecs) {
  if (spec.statedReadiness === "ready")
    fail("owner-states-ready", spec.id, `${spec.id} states ready; only the owner states it, and STATE.md must record the ruling`, { file: spec.file });
  if (citationExempt(spec)) continue;
  const lines = entryLines(contexts.get(spec.id).sections ?? {});
  const constraints = graph.edges
    .filter((edge) => edge.type === "constrainedBy" && edge.claim === "declared" && edge.from === spec.id)
    .map((edge) => edge.to);
  const missingLaws = [...numbers(lines, /\bLaw (\d+)/gu)].filter((law) => !numbers(constraints, /laws\.law(\d+)/gu).has(law)).sort((a, b) => a - b);
  const missingFacts = [...numbers(lines, /\bF(\d+)\b/gu)].filter((fact) => !numbers(constraints, /facts\.f(\d+)/gu).has(fact)).sort((a, b) => a - b);
  if (missingLaws.length > 0 || missingFacts.length > 0)
    fail("cited-without-edge", spec.id,
      `cited without a constrainedBy edge (rubric 16): ${spec.id}: laws [${missingLaws.join(", ")}] facts [${missingFacts.join(", ")}]`,
      { file: spec.file });
}

// The decision register's question sources resolve by address while open, and keep their
// text out of the Specs once closed.
const opening = (text) => {
  const match = /[.?!](?=\s|$)/u.exec(text);
  return match ? text.slice(0, match.index + 1) : text;
};
const normalize = (text) => text.split(/\s+/u).filter(Boolean).join(" ");
const present = (value) => typeof value === "string" && value.trim() !== "";
for (const row of params.register.decisions) {
  for (const source of row.sources ?? []) {
    if (source.kind !== "specQuestion") continue;
    const closed = source.open === false;
    const problem = (text) => fail("question-source", String(row.id), `${row.id}: ${text}`);
    const required = closed ? ["file", "kind", "open", "question", "spec"] : ["address", "file", "kind"];
    if (JSON.stringify(Object.keys(source).sort()) !== JSON.stringify(required))
      problem(closed ? "closed specQuestion requires kind, spec, question, file and open: false" : "open specQuestion requires kind, address and file");
    if (closed) {
      if (!present(source.spec) || !designFiles.has(source.spec)) {
        problem(`specQuestion names no Spec: ${JSON.stringify(source.spec)}`);
        continue;
      }
      if (source.file !== designFiles.get(source.spec)) problem(`specQuestion file does not name its Spec: ${source.spec}`);
      if (!present(source.question)) {
        problem("specQuestion requires non-empty question text");
        continue;
      }
      if (row.status !== "decided" && row.status !== "folded") problem("open: false requires a decided or folded row");
      const open = (contexts.get(source.spec)?.sections?.intent?.openQuestions ?? [])
        .map((question) => (typeof question === "string" ? question : question?.question))
        .filter((text) => typeof text === "string");
      if (open.some((text) => normalize(opening(text)) === normalize(source.question)))
        problem(`open: false question resolves again: ${source.spec}`);
    } else {
      const answer = resolve(source.address);
      if (!answer.resolves || answer.section !== "question") {
        problem(`specQuestion address does not resolve to an open question: ${JSON.stringify(source.address)} (${answer.reason ?? "names no question"})`);
        continue;
      }
      if (source.file !== designFiles.get(answer.id)) problem(`specQuestion file does not name its Spec: ${answer.id}`);
    }
  }
}

return { findings };
