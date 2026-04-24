import type { UnknownRecord } from "../types.js";

export type MetricTags = UnknownRecord;

export interface PlatformMetrics {
  counter(name: string, value?: number, tags?: MetricTags): void;
  histogram(name: string, value: number, tags?: MetricTags): void;
  gauge(name: string, value: number, tags?: MetricTags): void;
}

interface SafeGlobalThis {
  process?: {
    env?: Record<string, string | undefined>;
  };
  __CONVEX_TEST_MODE__?: boolean;
  console?: {
    info: (...args: unknown[]) => void;
  };
}

function isTestRuntime(): boolean {
  const safeGlobal = globalThis as SafeGlobalThis;
  return safeGlobal.__CONVEX_TEST_MODE__ === true || safeGlobal.process?.env?.["IS_TEST"] === "true";
}

function getRuntimeConsole(): { info: (...args: unknown[]) => void } {
  return (globalThis as SafeGlobalThis).console ?? { info: () => {} };
}

function stringifyMetricPayload(payload: Record<string, unknown>): string {
  return JSON.stringify(payload, (_key, value) =>
    typeof value === "bigint" ? value.toString() : value
  );
}

export function createPlatformNoOpMetrics(): PlatformMetrics {
  return {
    counter: () => {},
    histogram: () => {},
    gauge: () => {},
  };
}

export function createConsoleMetrics(scope = "PlatformMetrics"): PlatformMetrics {
  const emit = (
    type: "counter" | "histogram" | "gauge",
    name: string,
    value: number,
    tags?: MetricTags
  ): void => {
    getRuntimeConsole().info(
      stringifyMetricPayload({
        scope,
        metricType: type,
        name,
        value,
        ...(tags !== undefined ? { tags } : {}),
        timestamp: Date.now(),
      })
    );
  };

  return {
    counter(name: string, value = 1, tags?: MetricTags): void {
      emit("counter", name, value, tags);
    },
    histogram(name: string, value: number, tags?: MetricTags): void {
      emit("histogram", name, value, tags);
    },
    gauge(name: string, value: number, tags?: MetricTags): void {
      emit("gauge", name, value, tags);
    },
  };
}

export function createDefaultPlatformMetrics(scope?: string): PlatformMetrics {
  return isTestRuntime() ? createPlatformNoOpMetrics() : createConsoleMetrics(scope);
}
