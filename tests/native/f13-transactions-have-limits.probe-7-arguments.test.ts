import { expect, vi } from "vitest";
import {
  ref,
  specTest,
  testAnchorId,
} from "@libar-dev/software-delivery-protocol";
import { bindExample } from "@libar-dev/software-delivery-protocol/vitest";
import { probe7ArgumentsContract as contract } from "../../generated/contracts/facts.f13-transactions-have-limits.probe-7-arguments.contract.js";
import { schedulingBackend } from "./scheduler-composition.js";
import { type SchedulerWorld } from "./scheduler-cases.js";
import { argumentsCase } from "./scheduler-cases.js";
const anchor = specTest({
  id: testAnchorId("test:facts.f13-transactions-have-limits.probe-7-arguments"),
  verifies: ref("spec:facts.f13-transactions-have-limits.probe-7-arguments"),
});
void anchor;
vi.setConfig({ testTimeout: 300000 });
type World = SchedulerWorld<Awaited<ReturnType<typeof argumentsCase>>>;

bindExample(contract, (): World => ({}), {
  "a temporary mutation builds scheduled payloads internally as one string, an array of strings or eight calls":
    async (world) => {
      Object.assign(world, await schedulingBackend());
    },
  "it grows ASCII and multibyte payloads across the scheduling limits and reads completion warnings":
    async (world) => {
      world.observation = await argumentsCase(world.backend!);
    },
  "the enforced sum is {limitBytes} bytes with object overhead {objectBytes} and array element overhead {elementBytes}":
    async (world, { limitBytes, objectBytes, elementBytes }) => {
      const o = world.observation!;
      for (const a of o.attempts) {
        const perCall =
          a.utf8Bytes / a.count +
          objectBytes +
          (a.parts === 1 ? 0 : elementBytes * a.parts);
        const accepted = Math.min(a.count, Math.floor(limitBytes / perCall));
        expect(a.returned, JSON.stringify(a)).toBe(accepted);
        expect(a.countedBytes).toBe(accepted * perCall);
      }
      for (const a of [o.exact, o.multibyte, o.many, o.sum])
        expect(a.countedBytes).toBe(limitBytes);
    },
  "the refusal text is {refusal} at {stage} and the mutation returns {mutationReturned}":
    async (world, { refusal, stage, mutationReturned }) => {
      for (const a of world.observation!.attempts) {
        expect(a.mutationReturned).toBe(mutationReturned);
        if (a.error !== null) {
          expect(a.error).toBe(refusal);
          expect(a.stage).toBe(stage);
        } else expect(a.returned).toBe(a.count);
      }
      expect(world.observation!.over.error).not.toBeNull();
    },
  "one ASCII string accepts {asciiAccepted} bytes and refuses {asciiRefused} bytes":
    async (world, { asciiAccepted, asciiRefused }) => {
      const o = world.observation!;
      expect(o.exact.utf8Bytes).toBe(asciiAccepted);
      expect(o.over.utf8Bytes).toBe(asciiRefused);
      expect(o.exact.error).toBeNull();
      expect(o.over.error).not.toBeNull();
    },
  "one multibyte string accepts {multibyteAccepted} copies of \u00e9 and refuses {multibyteRefused}":
    async (world, { multibyteAccepted, multibyteRefused }) => {
      const o = world.observation!;
      expect(o.multibyte.size).toBe(multibyteAccepted);
      expect(o.multibyteOver.size).toBe(multibyteRefused);
      expect(o.multibyte.error).toBeNull();
      expect(o.multibyteOver.error).not.toBeNull();
    },
  "an array of {parts} strings accepts {arrayAccepted} content bytes and refuses {arrayRefused}":
    async (world, { parts, arrayAccepted, arrayRefused }) => {
      const o = world.observation!;
      for (const a of [o.many, o.manyOver]) expect(a.parts).toBe(parts);
      expect(o.many.utf8Bytes).toBe(arrayAccepted);
      expect(o.manyOver.utf8Bytes).toBe(arrayRefused);
      expect(o.many.error).toBeNull();
      expect(o.manyOver.error).not.toBeNull();
    },
  "{calls} calls accept {callAccepted} content bytes each and refuse {callRefused} on call {refusedCall}":
    async (world, { calls, callAccepted, callRefused, refusedCall }) => {
      const o = world.observation!;
      for (const a of [o.sum, o.sumOver]) expect(a.count).toBe(calls);
      expect(o.sum.size).toBe(callAccepted);
      expect(o.sumOver.size).toBe(callRefused);
      expect(o.sum.error).toBeNull();
      expect(o.sumOver.error).not.toBeNull();
      expect(o.sumOver.returned! + 1).toBe(refusedCall);
    },
  "single calls with {decimalBytes} and {binaryBytes} content bytes are accepted":
    async (world, { decimalBytes, binaryBytes }) => {
      for (const size of [decimalBytes, binaryBytes]) {
        const a = world.observation!.attempts.find(
          (a) =>
            a.size === size &&
            a.count === 1 &&
            a.parts === 1 &&
            a.character === "a",
        );
        expect(a).toBeDefined();
        expect(a!.error).toBeNull();
        expect(a!.returned).toBe(1);
      }
    },
  "the shorter warning first appears at {warningFirst} accounted bytes after {warningBefore} without it, naming limit {warningLimit} and text {warningText}":
    async (
      world,
      { warningFirst, warningBefore, warningLimit, warningText },
    ) => {
      const o = world.observation!;
      expect(o.warningFirst.countedBytes).toBe(warningFirst);
      expect(o.warningBefore.countedBytes).toBe(warningBefore);
      expect(
        o.warningBefore.logLines.some((l) => l.startsWith(warningText)),
      ).toBe(false);
      expect(o.warningFirst.logLines).toContain(
        `${warningText} (actual: ${warningFirst} bytes, limit: ${warningLimit} bytes).`,
      );
      expect(o.warningFirst.error).toBeNull();
      expect(o.warningFirst.returned).toBe(1);
    },
  "the shorter warning accepts accounted sizes {shortSample} and {shortLast}, and the future hard error warning first accepts {hardFirst} with text {hardText} naming {namedLimit}":
    async (
      world,
      { shortSample, shortLast, hardFirst, hardText, namedLimit },
    ) => {
      for (const accounted of [shortSample, shortLast, hardFirst]) {
        const a = world.observation!.attempts.find(
          (a) =>
            a.utf8Bytes === accounted - 14 &&
            a.count === 1 &&
            a.parts === 1 &&
            a.character === "a",
        )!;
        expect(a).toBeDefined();
        expect(a.error).toBeNull();
        expect(a.returned).toBe(1);
        expect(a.countedBytes).toBe(accounted);
        const text =
          accounted === hardFirst
            ? hardText
            : hardText.replace(
                ". This will become a hard error in the future",
                "",
              );
        expect(a.logLines).toContain(
          `${text} (actual: ${accounted} bytes, limit: ${namedLimit} bytes).`,
        );
      }
    },
});
