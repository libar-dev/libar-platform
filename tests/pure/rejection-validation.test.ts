import { ConvexError, getConvexSize, type Value } from "convex/values";
import { expect, test } from "vitest";
import { normalizeThrown, classifyThrown } from "../../src/command/index.js";

const entry = "CreateDocument";
const message = "Refused";
const bare = (code: string, extra: Record<string, Value> = {}) =>
  new ConvexError({ code, message, ...extra });
const wire = (
  code = "forbidden",
  name = entry,
  extra: Record<string, Value> = {},
) => bare(code, { kind: "rejection", entry: name, ...extra });
function details(bytes: number, multibyte = false) {
  const overhead = getConvexSize({ text: "" });
  const count = bytes - overhead;
  const value = {
    text: multibyte
      ? "é".repeat(Math.floor(count / 2)) + "a".repeat(count % 2)
      : "a".repeat(count),
  };
  expect(getConvexSize(value)).toBe(bytes);
  return value;
}
function normalized(error: unknown) {
  try {
    normalizeThrown(error, entry, ["invalidTransition"]);
  } catch (thrown) {
    return thrown;
  }
  throw new Error("The boundary continued after a throw");
}
type Case = {
  name: string;
  error: unknown;
  result: "same" | "wrapped" | "technical";
  contains?: string[];
};
const cases: Case[] = [
  {
    name: "bare declared code",
    error: bare("invalidTransition"),
    result: "wrapped",
  },
  {
    name: "bare platform code",
    error: bare("staleVersion"),
    result: "wrapped",
  },
  {
    name: "bare undeclared code",
    error: bare("notDeclared"),
    result: "technical",
    contains: ["notDeclared", entry],
  },
  { name: "wire platform code", error: wire(), result: "same" },
  {
    name: "wire declared code",
    error: wire("invalidTransition"),
    result: "same",
  },
  {
    name: "wire undeclared code",
    error: wire("notDeclared"),
    result: "technical",
    contains: ["notDeclared", entry],
  },
  {
    name: "wire wrong entry",
    error: wire("forbidden", "SomeOtherCommand"),
    result: "technical",
    contains: ["SomeOtherCommand", entry],
  },
  {
    name: "wire entry that differs only in case",
    error: wire("forbidden", "createDocument"),
    result: "technical",
    contains: ["createDocument", entry],
  },
  {
    name: "wire code checked before entry",
    error: wire("notDeclared", "SomeOtherCommand"),
    result: "technical",
    contains: ["notDeclared", entry],
  },
  {
    name: "wire details at 16384 bytes",
    error: wire("forbidden", entry, { details: details(16384) }),
    result: "same",
  },
  {
    name: "wire details at 16385 bytes",
    error: wire("forbidden", entry, { details: details(16385) }),
    result: "technical",
    contains: ["16385", entry],
  },
  {
    name: "wire multibyte details at 16384 bytes",
    error: wire("forbidden", entry, { details: details(16384, true) }),
    result: "same",
  },
  {
    name: "wire multibyte details at 16386 bytes",
    error: wire("forbidden", entry, { details: details(16386, true) }),
    result: "technical",
    contains: ["16386", entry],
  },
  {
    name: "bare details at 16384 bytes",
    error: bare("invalidTransition", { details: details(16384) }),
    result: "wrapped",
  },
  {
    name: "bare details at 16385 bytes",
    error: bare("invalidTransition", { details: details(16385) }),
    result: "technical",
    contains: ["16385", entry],
  },
  {
    name: "wire missing entry",
    error: bare("forbidden", { kind: "rejection" }),
    result: "technical",
    contains: [entry],
  },
  {
    name: "wire numeric code",
    error: wire("forbidden", entry, { code: 1 }),
    result: "technical",
    contains: [entry],
  },
  {
    name: "wire extra field",
    error: wire("forbidden", entry, { extra: 1 }),
    result: "technical",
    contains: [entry],
  },
  {
    name: "transient refusal",
    error: new ConvexError({ kind: "transient", code: "capacity", message }),
    result: "same",
  },
  { name: "plain error", error: new Error("x"), result: "same" },
  {
    name: "ConvexError carrying a string",
    error: new ConvexError("a string"),
    result: "same",
  },
  { name: "thrown string", error: "x", result: "same" },
  {
    name: "wire inherited Object code",
    error: wire("toString"),
    result: "technical",
    contains: ["toString", entry],
  },
  {
    name: "wire details that are not a record",
    error: wire("forbidden", entry, { details: [] }),
    result: "technical",
    contains: [entry],
  },
  {
    name: "bare details that are not a record",
    error: bare("invalidTransition", { details: ["listed"] }),
    result: "technical",
    contains: [entry],
  },
  {
    name: "bare missing message",
    error: new ConvexError({ code: "invalidTransition" }),
    result: "technical",
    contains: [entry],
  },
  {
    name: "bare numeric code",
    error: bare("invalidTransition", { code: 1 }),
    result: "technical",
    contains: [entry],
  },
  {
    name: "bare extra field",
    error: bare("invalidTransition", { extra: 1 }),
    result: "technical",
    contains: [entry],
  },
  {
    name: "ConvexError carrying a list that has a code",
    error: new ConvexError(
      Object.assign(["listed"], { code: "invalidTransition", message }),
    ),
    result: "same",
  },
  {
    name: "ConvexError carrying a record with no code and no kind",
    error: new ConvexError({ message }),
    result: "same",
  },
  {
    name: "wire entry checked before details",
    error: wire("forbidden", "SomeOtherCommand", { details: details(16385) }),
    result: "technical",
    contains: ["SomeOtherCommand", entry],
  },
];
// spec:command.outcome-boundary, fnNormalizeThrown.
test.each(cases)("pure: normalizes $name", ({ error, result, contains }) => {
  const thrown = normalized(error);
  if (result === "same") expect(thrown).toBe(error);
  else if (result === "wrapped") {
    expect(thrown).toBeInstanceOf(ConvexError);
    expect((thrown as ConvexError<Value>).data).toEqual({
      kind: "rejection",
      entry,
      ...(error as ConvexError<Record<string, Value>>).data,
    });
  } else {
    expect.soft(thrown).toBeInstanceOf(Error);
    expect.soft(thrown).not.toBeInstanceOf(ConvexError);
    expect.soft(classifyThrown(thrown).kind).toBe("technical");
    for (const text of contains ?? [])
      expect.soft(String(thrown)).toContain(text);
  }
});
