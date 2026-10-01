import { BaseConvexClient, ConvexHttpClient } from "convex/browser";
import type { Value } from "convex/values";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { redact, runChild } from "./child.js";
import { projectDirectory } from "./composition.js";
import type { Composition } from "./composition.js";
export interface AdminTarget {
  url: string;
  adminKey: string;
  home: string;
  // The composition that deploy and codegen act on.
  composition: Composition;
  secrets: readonly string[];
  signal?: AbortSignal;
}
export interface AdminState {
  // The composition last deployed to the backend, if any.
  deployed: Composition | undefined;
  environment: Set<string>;
  logProcess?: object | undefined;
}
export interface LogMark {
  readonly cursorMs: number;
}
export interface CompletionRecord {
  kind: "Completion";
  udfType: "Query" | "Mutation" | "Action" | "HttpAction";
  identifier: string;
  componentPath: string | null;
  requestId: string;
  executionId: string;
  parentExecutionId: string | null;
  timestamp: number;
  executionTime: number;
  cachedResult: boolean;
  error: string | null;
  caller: string;
  usageStats: Record<string, number>;
}
export interface AdminAccess {
  deploy(): Promise<void>;
  codegen(): Promise<void>;
  setEnvironment(variables: Readonly<Record<string, string>>): Promise<void>;
  environment(): Promise<Record<string, string>>;
  run(
    name: string,
    args?: Record<string, Value>,
    options?: { component?: string },
  ): Promise<Value>;
  readTable(
    table: string,
    options?: { component?: string; pageSize?: number },
  ): Promise<Record<string, Value>[]>;
  logMark(): Promise<LogMark>;
  completionsSince(
    mark: LogMark,
    until: (records: readonly CompletionRecord[]) => boolean,
    timeoutMs?: number,
  ): Promise<CompletionRecord[]>;
}
export interface CliCall {
  file: string;
  args: string[];
  cwd: string;
  env: Record<string, string>;
  // Infinity for a call that runs until it is stopped. runChild refuses it.
  timeoutMs: number;
}
const repositoryRoot = join(import.meta.dirname, "..");
const commandArgs = {
  deploy: ["deploy", "--yes", "--codegen", "disable", "--typecheck", "disable"],
  codegen: ["codegen", "--typecheck", "disable"],
  dev: ["dev", "--typecheck", "disable", "--tail-logs", "pause-on-deploy"],
} as const;
const commandTimeoutMs = {
  deploy: 60000,
  codegen: 120000,
  dev: Number.POSITIVE_INFINITY,
} as const;
// The CLI runs in the composition's project directory, the one place it reads convex.json from.
export function convexCli(
  target: Pick<AdminTarget, "url" | "adminKey" | "home" | "composition">,
  command: "deploy" | "codegen" | "dev",
): CliCall {
  const selection = ["--url", target.url, "--admin-key", target.adminKey];
  return {
    file: process.execPath,
    args: [
      join(repositoryRoot, "node_modules/convex/bin/main.js"),
      ...commandArgs[command],
      ...selection,
    ],
    cwd: projectDirectory(target.composition),
    env: { PATH: process.env.PATH ?? "", HOME: target.home, TMPDIR: tmpdir() },
    timeoutMs: commandTimeoutMs[command],
  };
}
// Convex 1.46.0 implements these members and strips them from its declarations.
type AdminHttpClient = ConvexHttpClient & {
  setAdminAuth(key: string): void;
  function(
    name: string,
    componentPath: string | undefined,
    args: Record<string, Value>,
  ): Promise<Value>;
};
type AdminSocketClient = {
  setAdminAuth(key: string): void;
  subscribe(
    name: string,
    args: Record<string, Value>,
    options: { componentPath?: string },
  ): unknown;
  localQueryResultByToken(token: string): Value | undefined;
  close(): Promise<void>;
};
export function createAdminAccess(
  target: AdminTarget,
  state: AdminState,
): AdminAccess {
  const marks = new WeakMap<LogMark, object | undefined>();
  const http = new ConvexHttpClient(target.url) as AdminHttpClient;
  http.setAdminAuth(target.adminKey);
  const authorization = { Authorization: `Convex ${target.adminKey}` };
  async function cli(command: "deploy" | "codegen") {
    const call = convexCli(target, command);
    // CLI children are short and bounded; they lose their backend when a run is swept.
    await runChild(`convex ${command}`, call.file, call.args, {
      cwd: call.cwd,
      env: call.env,
      timeoutMs: call.timeoutMs,
      secrets: target.secrets,
      ...(target.signal === undefined ? {} : { signal: target.signal }),
    });
  }
  function systemQuery(
    name: string,
    args: Record<string, Value>,
    component: string | undefined,
    timeoutMs = 10000,
  ): Promise<Value> {
    return new Promise((resolve, reject) => {
      let settled = false;
      const settle = (finish: () => void) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        void client.close();
        finish();
      };
      const client = new BaseConvexClient(
        target.url,
        (tokens) => {
          for (const token of tokens) {
            let value: Value | undefined;
            try {
              value = client.localQueryResultByToken(token);
            } catch (error) {
              return settle(() => reject(error));
            }
            if (value !== undefined) return settle(() => resolve(value));
          }
        },
        { unsavedChangesWarning: false },
      ) as unknown as AdminSocketClient;
      const timer = setTimeout(
        () =>
          settle(() =>
            reject(
              new Error(`Admin read ${name} got no answer in ${timeoutMs} ms`),
            ),
          ),
        timeoutMs,
      );
      client.setAdminAuth(target.adminKey);
      client.subscribe(
        name,
        args,
        component === undefined ? {} : { componentPath: component },
      );
    });
  }
  return {
    async deploy() {
      await cli("deploy");
      state.deployed = target.composition;
    },
    codegen: () => cli("codegen"),
    async setEnvironment(variables) {
      const response = await fetch(
        `${target.url}/api/update_environment_variables`,
        {
          method: "POST",
          headers: { ...authorization, "Content-Type": "application/json" },
          body: JSON.stringify({
            changes: Object.entries(variables).map(([name, value]) => ({
              name,
              value,
            })),
          }),
          signal: AbortSignal.timeout(10000),
        },
      );
      if (!response.ok)
        throw new Error(
          `Setting environment variables failed with status ${response.status}: ${redact(await response.text(), target.secrets)}`,
        );
      for (const name of Object.keys(variables)) state.environment.add(name);
    },
    async environment() {
      const rows = (await systemQuery(
        "_system/cli/queryEnvironmentVariables",
        {},
        undefined,
      )) as { name: string; value: string }[];
      return Object.fromEntries(rows.map((row) => [row.name, row.value]));
    },
    run: (name, args = {}, options = {}) =>
      http.function(name, options.component, args),
    async readTable(table, options = {}) {
      const documents: Record<string, Value>[] = [];
      let cursor: string | null = null;
      for (;;) {
        const page = (await systemQuery(
          "_system/cli/tableData",
          {
            table,
            order: "asc",
            paginationOpts: { cursor, numItems: options.pageSize ?? 1000 },
          },
          options.component,
        )) as {
          page: Record<string, Value>[];
          isDone: boolean;
          continueCursor: string;
        };
        documents.push(...page.page);
        if (page.isDone) break;
        cursor = page.continueCursor;
      }
      if (documents.length === 0) {
        const tables = (
          (await systemQuery(
            "_system/cli/tables",
            { paginationOpts: { cursor: null, numItems: 10000 } },
            options.component,
          )) as { page: { name: string }[] }
        ).page
          .map((entry) => entry.name)
          .sort();
        if (!tables.includes(table))
          throw new Error(
            `No table "${table}" in ${options.component === undefined ? "the app" : `component "${options.component}"`}. Tables: ${tables.join(", ")}`,
          );
      }
      return documents;
    },
    async logMark() {
      // The log's cursor is a time in milliseconds on this machine's clock. Round up, then wait
      // past it, so that every earlier record is at or before the mark and every later one after.
      const process = state.logProcess;
      const cursorMs = Date.now() + 1;
      await sleep(2);
      const mark = { cursorMs };
      marks.set(mark, process);
      return mark;
    },
    async completionsSince(mark, until, timeoutMs = 10000) {
      const assertProcess = () => {
        if (!marks.has(mark) || marks.get(mark) !== state.logProcess)
          throw new Error(
            "The function log mark belongs to another backend process",
          );
      };
      assertProcess();
      const records: CompletionRecord[] = [];
      const deadline = Date.now() + timeoutMs;
      let cursor = mark.cursorMs;
      while (!until(records)) {
        assertProcess();
        const left = deadline - Date.now();
        if (left <= 0)
          throw new Error(
            `The function log held ${records.length} completion records ${timeoutMs} ms after the mark, and the test waited for more`,
          );
        let response: Response;
        try {
          response = await fetch(
            `${target.url}/api/stream_function_logs?cursor=${cursor}`,
            { headers: authorization, signal: AbortSignal.timeout(left) },
          );
        } catch (error) {
          if ((error as Error).name === "TimeoutError") continue;
          throw error;
        }
        assertProcess();
        if (!response.ok)
          throw new Error(
            `Reading the function log failed with status ${response.status}`,
          );
        const body = (await response.json()) as {
          entries: { kind: string }[];
          newCursor: number;
        };
        if (body.entries.length >= 1000)
          throw new Error(
            `One function log read returned ${body.entries.length} entries. The backend keeps its last 1000, so records may be lost. Read the log more often.`,
          );
        for (const entry of body.entries)
          if (entry.kind === "Completion")
            records.push(entry as CompletionRecord);
        cursor = body.newCursor;
      }
      assertProcess();
      return records;
    },
  };
}
