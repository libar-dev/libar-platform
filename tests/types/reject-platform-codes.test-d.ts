import { expectTypeOf, test } from "vitest";
import { reject, type PlatformRejectionCode } from "../../src/command/index.js";
// spec:command.outcome-boundary, fnReject. These calls are compiled, never executed.
test("reject accepts only platform rejection codes", () => {
  expectTypeOf<
    Parameters<typeof reject>[0]["code"]
  >().toEqualTypeOf<PlatformRejectionCode>();
  reject({ code: "forbidden", entry: "X", message: "m" });
  // @ts-expect-error A domain code must go through the running command's declaration.
  reject({ code: "notDeclared", entry: "X", message: "m" });
  const code: string = "forbidden";
  // @ts-expect-error An arbitrary string is not a platform code.
  reject({ code, entry: "X", message: "m" });
});
