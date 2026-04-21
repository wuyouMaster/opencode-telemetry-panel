import { invoke } from "@tauri-apps/api/core"

export type TelemetryRecord = {
  kind: "request"
  sessionId: string
  messageId: string
  providerId: string
  modelId: string
  startedAt: number
  firstOutputAt?: number | null
  completedAt?: number | null
  streamMs?: number | null
  reasoningMs?: number | null
  toolMs?: number | null
  postProcessMs?: number | null
  success: boolean
  error?: string | null
  errorType?: string | null
  retries?: number
}

export type FilterScope = "all" | "session" | "model" | "failure"

export type SnapshotQuery = {
  scope: FilterScope
  value?: string | null
}

export type FilterOption = {
  value: string
  count: number
}

export type SummaryMetrics = {
  requests: number
  successes: number
  failures: number
  retries: number
  successRate: number
  avgLatencyMs: number
  avgWaitMs: number
  avgStreamMs: number
  avgReasoningMs: number
  avgToolMs: number
  avgPostProcessMs: number
  avgNetworkMs: number
  p95LatencyMs: number
}

export type ModelMetrics = SummaryMetrics & {
  key: string
  providerId: string
  modelId: string
  latestAt: number
}

export type FailureBreakdown = {
  errorType: string
  count: number
  share: number
}

export type RecentRequest = {
  key: string
  providerId: string
  modelId: string
  finishedAt: number
  success: boolean
  errorType?: string | null
  waitMs: number
  streamMs: number
  reasoningMs: number
  toolMs: number
  postProcessMs: number
  networkMs: number
  latencyMs: number
  retries: number
  error?: string | null
}

export type DashboardSnapshot = {
  sourcePath: string
  generatedAt: number
  recordCount: number
  totalRecordCount: number
  filterScope: FilterScope
  filterValue?: string | null
  sessionOptions: FilterOption[]
  modelOptions: FilterOption[]
  failureOptions: FilterOption[]
  summary: SummaryMetrics
  failureBreakdown: FailureBreakdown[]
  models: ModelMetrics[]
  recent: RecentRequest[]
}

export function loadSnapshot(query: SnapshotQuery) {
  return invoke<DashboardSnapshot>("snapshot", { query })
}

export function loadTelemetryPath() {
  return invoke<string>("telemetry_path")
}
