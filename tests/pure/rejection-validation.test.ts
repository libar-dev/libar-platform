import { ConvexError, getConvexSize, type Value } from "convex/values";
import { expect, test } from "vitest";
import { normalizeThrown, classifyThrown } from "../../src/command/index.js";

const commandType = "CreateDocument";
const message = "Refused";
const bare = (code: string, extra: Record<string, Value> = {}) =>
  new ConvexError({ code, message, ...extra });
const wire = (
  code = "forbidden",
  name = commandType,
  extra: Record<string, Value> = {},
) => bare(code, { kind: "rejection", commandType: name, ...extra });
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
    normalizeThrown(error, commandType, ["invalidTransition"]);
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
    contains: ["notDeclared", commandType],
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
    contains: ["notDeclared", commandType],
  },
  {
    name: "wire wrong command",
    error: wire("forbidden", "SomeOtherCommand"),
    result: "technical",
    contains: ["SomeOtherCommand", commandType],
  },
  {
    name: "wire code checked before command",
    error: wire("notDeclared", "SomeOtherCommand"),
    result: "technical",
    contains: ["notDeclared", commandType],
  },
  {
    name: "wire details at 16384 bytes",
    error: wire("forbidden", commandType, { details: details(16384) }),
    result: "same",
  },
  {
    name: "wire details at 16385 bytes",
    error: wire("forbidden", commandType, { details: details(16385) }),
    result: "technical",
    contains: ["16385", commandType],
  },
  {
    name: "wire multibyte details at 16384 bytes",
    error: wire("forbidden", commandType, { details: details(16384, true) }),
    result: "same",
  },
  {
    name: "wire multibyte details at 16386 bytes",
    error: wire("forbidden", commandType, { details: details(16386, true) }),
    result: "technical",
    contains: ["16386", commandType],
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
    contains: ["16385", commandType],
  },
  {
    name: "wire missing command",
    error: bare("forbidden", { kind: "rejection" }),
    result: "technical",
    contains: [commandType],
  },
  {
    name: "wire numeric code",
    error: wire("forbidden", commandType, { code: 1 }),
    result: "technical",
    contains: [commandType],
  },
  {
    name: "wire extra field",
    error: wire("forbidden", commandType, { extra: 1 }),
    result: "technical",
    contains: [commandType],
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
    contains: ["toString", commandType],
  },
  {
    name: "wire details that are not a record",
    error: wire("forbidden", commandType, { details: [] }),
    result: "technical",
    contains: [commandType],
  },
  {
    name: "bare details that are not a record",
    error: bare("invalidTransition", { details: ["listed"] }),
    result: "technical",
    contains: [commandType],
  },
  {
    name: "bare missing message",
    error: new ConvexError({ code: "invalidTransition" }),
    result: "technical",
    contains: [commandType],
  },
  {
    name: "bare numeric code",
    error: bare("invalidTransition", { code: 1 }),
    result: "technical",
    contains: [commandType],
  },
  {
    name: "bare extra field",
    error: bare("invalidTransition", { extra: 1 }),
    result: "technical",
    contains: [commandType],
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
    name: "wire command checked before details",
    error: wire("forbidden", "SomeOtherCommand", { details: details(16385) }),
    result: "technical",
    contains: ["SomeOtherCommand", commandType],
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
      commandType,
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
