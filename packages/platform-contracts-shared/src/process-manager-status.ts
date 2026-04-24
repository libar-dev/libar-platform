export const PROCESS_MANAGER_STATUSES = ["idle", "processing", "completed", "failed"] as const;

export type ProcessManagerStatus = (typeof PROCESS_MANAGER_STATUSES)[number];

const PROCESS_MANAGER_STATUS_SET = new Set<string>(PROCESS_MANAGER_STATUSES);

export function isProcessManagerStatus(value: unknown): value is ProcessManagerStatus {
  return typeof value === "string" && PROCESS_MANAGER_STATUS_SET.has(value);
}
