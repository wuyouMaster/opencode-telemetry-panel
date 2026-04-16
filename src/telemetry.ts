import { invoke } from "@tauri-apps/api/core"

export type TelemetryRecord = {
  kind: "request"
  sessionId: string
  messageId: string
  providerId: string
  modelId: string
  startedAt: number
  firstTokenAt?: number | null
  completedAt?: number | null
  success: boolean
  error?: string | null
  retries?: number
}

export type SummaryMetrics = {
  requests: number
  successes: number
  failures: number
  retries: number
  successRate: number
  avgLatencyMs: number
  avgWaitMs: number
  avgNetworkMs: number
  p95LatencyMs: number
}

export type ModelMetrics = SummaryMetrics & {
  key: string
  providerId: string
  modelId: string
  latestAt: number
}

export type RecentRequest = {
  key: string
  providerId: string
  modelId: string
  finishedAt: number
  success: boolean
  waitMs: number
  networkMs: number
  latencyMs: number
  retries: number
  error?: string | null
}

export type DashboardSnapshot = {
  sourcePath: string
  generatedAt: number
  recordCount: number
  summary: SummaryMetrics
  models: ModelMetrics[]
  recent: RecentRequest[]
}

export function loadSnapshot() {
  return invoke<DashboardSnapshot>("snapshot")
}

export function loadTelemetryPath() {
  return invoke<string>("telemetry_path")
}
