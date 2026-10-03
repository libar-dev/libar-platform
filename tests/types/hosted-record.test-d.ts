import {
  ref,
  specTest,
  testAnchorId,
} from "@libar-dev/software-delivery-protocol";
import { expectTypeOf, test } from "vitest";
import type { BackendFacts } from "../../harness/backend.js";
import type {
  HostedRunFacts,
  HostedUsage,
  JsonValue,
  NativeRunRecord,
  NativeTestEntry,
} from "../../harness/evidence.js";
import type { HostedAccess, HostedTarget } from "../../harness/hosted.js";
import type { HostedBackend } from "../../harness/native.js";
// Binds this file to the harness Spec, whose record and facts types for a native run on a hosted
// deployment it checks at the compiled tier.
const anchor = specTest({
  id: testAnchorId("test:platform.native-harness.hosted-record-types"),
  verifies: ref("spec:platform.native-harness"),
});
void anchor;

test("compiled: a run record names its target apart from its tier and holds the hosted facts or null", () => {
  expectTypeOf<NativeRunRecord["tier"]>().toEqualTypeOf<"native">();
  expectTypeOf<NativeRunRecord["target"]>().toEqualTypeOf<
    "local backend" | "hosted deployment"
  >();
  expectTypeOf<
    NativeRunRecord["hosted"]
  >().toEqualTypeOf<HostedRunFacts | null>();
  expectTypeOf<NativeTestEntry["project"]>().toEqualTypeOf<
    "types" | "pure" | "simulator" | "native" | "hosted"
  >();
  expectTypeOf<HostedRunFacts>().toEqualTypeOf<{
    deployment: string;
    keyName: string;
    statedPlan: string;
    ranBy: "continuous integration" | "developer";
    cliVersion: string;
    backendVersion: string | null;
    usageBefore: HostedUsage | null;
    usageAfter: HostedUsage | null;
    windowCrossed: boolean;
    deploys: {
      composition: "fixture" | "production" | null;
      wallMs: number;
    }[];
  }>();
  expectTypeOf<HostedUsage>().toEqualTypeOf<{
    readAt: string;
    seedStatus: string | null;
    response: JsonValue;
  }>();
});

test("compiled: a backend's facts say its target, and on a hosted deployment no executable and a kept dataset", () => {
  expectTypeOf<BackendFacts["target"]>().toEqualTypeOf<
    "local backend" | "hosted deployment"
  >();
  expectTypeOf<BackendFacts["dataset"]>().toEqualTypeOf<
    "empty at start" | "kept from earlier runs"
  >();
  expectTypeOf<null>().toExtend<BackendFacts["executable"]>();
});

test("compiled: the hosted target holds no deploy key, and the hosted backend's admin access reads usage", () => {
  expectTypeOf<keyof HostedTarget>().toEqualTypeOf<
    "url" | "deployment" | "keyName" | "statedPlan"
  >();
  expectTypeOf<HostedBackend["admin"]>().toEqualTypeOf<HostedAccess>();
  expectTypeOf<ReturnType<HostedAccess["usage"]>>().toEqualTypeOf<
    Promise<HostedUsage>
  >();
});
