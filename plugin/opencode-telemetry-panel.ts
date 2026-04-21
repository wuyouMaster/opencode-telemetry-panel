import { appendFile, chmod, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises"
import { existsSync } from "node:fs"
import { dirname, join } from "node:path"
import { homedir } from "node:os"

type SessionStatusEvent = {
  type: "session.status"
  properties: {
    sessionID: string
    status:
      | {
          type: "idle"
        }
      | {
          type: "busy"
        }
      | {
          type: "retry"
          attempt: number
          message: string
          next: number
        }
  }
}

type SessionErrorEvent = {
  type: "session.error"
  properties: {
    sessionID?: string
    error?: unknown
  }
}

type MessageUpdatedEvent = {
  type: "message.updated"
  properties: {
    sessionID: string
    info: {
      role: string
      id: string
      providerID: string
      modelID: string
      summary?: boolean
      error?: unknown
      time: {
        created: number
        completed?: number | null
        error?: unknown
      }
    }
  }
}

type MessagePartUpdatedEvent = {
  type: "message.part.updated"
  properties: {
    sessionID: string
    part: {
      id: string
      sessionID: string
      messageID: string
      type: string
      text?: string
      synthetic?: boolean
      ignored?: boolean
      tool?: string
      state?: {
        status?: string
        error?: unknown
        time?: {
          start?: number
          end?: number
        }
      }
      time?: {
        start?: number
        end?: number
      }
    }
    time: number
  }
}

type TelemetryEvent = SessionStatusEvent | SessionErrorEvent | MessagePartUpdatedEvent | MessageUpdatedEvent

type Plugin = () => Promise<{
  event: (input: { event: TelemetryEvent }) => Promise<void>
}>

type PendingRequest = {
  sessionId: string
  messageId: string
  providerId: string
  modelId: string
  startedAt: number
  firstOutputAt?: number
  retries: number
  streamMs: number
  reasoningMs: number
  toolMs: number
  postProcessMs: number
  messageError?: string
  legacyMessageError?: string
  sessionError?: string
  toolError?: string
  toolErrorCount: number
  textPreview?: string
}

type ToolErrorSignal = {
  error: string
  count: number
}

type RequestOutcome = {
  success: boolean
  error?: string
  errorType?: "message_error" | "session_error" | "tool_error" | "business_error"
}

type TextPreviewSignal = {
  text: string
  at: number
}

type TimingSignal = {
  firstOutputAt?: number
  streamMs: number
  reasoningMs: number
  toolMs: number
}

type TrackedPartTiming = {
  kind: "stream" | "reasoning" | "tool"
  start?: number
  counted: boolean
}

const root = join(homedir(), ".opencode-telemetry")
const file = join(root, "telemetry.jsonl")
const BUSINESS_ERROR_PREVIEW_LIMIT = 120
const executablePath = join(
  root,
  process.platform === "win32" ? "OpenCodeTelemetryPanel.exe" : "OpenCodeTelemetryPanel",
)
const packagePath = new URL("../package.json", import.meta.url)
const pending = new Map<string, PendingRequest>()
const pendingToolErrors = new Map<string, ToolErrorSignal>()
const pendingTextPreviews = new Map<string, TextPreviewSignal>()
const pendingTimingSignals = new Map<string, TimingSignal>()
const trackedPartTimings = new Map<string, TrackedPartTiming>()
const completedRequests = new Set<string>()
let binaryReady: Promise<void> | undefined
let panelLaunched = false

function key(sessionId: string, messageId: string) {
  return `${sessionId}:${messageId}`
}

function compactError(error: unknown, fallback = "session error") {
  if (!error) return fallback
  if (typeof error !== "object") return String(error).trim() || fallback
  if ("data" in error && error.data && typeof error.data === "object" && "message" in error.data) {
    const message = String((error.data as { message?: unknown }).message ?? "").trim()
    return message || fallback
  }
  const message = String((error as { message?: unknown }).message ?? "").trim()
  return message || fallback
}

function normalizeTextPreview(text: string) {
  return text.replace(/\s+/g, " ").trim()
}

function normalizeBusinessCandidate(text: string) {
  return text
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[`"'“”‘’]+/, "")
    .replace(/[`"'“”‘’]+$/, "")
    .replace(/[:.?!-]+$/, "")
    .trim()
}

function tail(value: string, limit: number) {
  return value.length <= limit ? value : value.slice(-limit)
}

function attachSessionError(sessionId: string, error: string) {
  for (const request of pending.values()) {
    if (request.sessionId === sessionId) request.sessionError = error
  }
}

function partTimingKey(requestKey: string, partID: string) {
  return `${requestKey}:${partID}`
}

function applyTimingSignal(request: PendingRequest, signal: TimingSignal) {
  if (signal.firstOutputAt !== undefined) {
    request.firstOutputAt =
      request.firstOutputAt === undefined ? signal.firstOutputAt : Math.min(request.firstOutputAt, signal.firstOutputAt)
  }
  request.streamMs += signal.streamMs
  request.reasoningMs += signal.reasoningMs
  request.toolMs += signal.toolMs
}

function queueTimingSignal(requestKey: string, signal: TimingSignal) {
  const existing = pendingTimingSignals.get(requestKey)
  if (!existing) {
    pendingTimingSignals.set(requestKey, { ...signal })
    return
  }

  existing.streamMs += signal.streamMs
  existing.reasoningMs += signal.reasoningMs
  existing.toolMs += signal.toolMs
  if (signal.firstOutputAt !== undefined) {
    existing.firstOutputAt =
      existing.firstOutputAt === undefined ? signal.firstOutputAt : Math.min(existing.firstOutputAt, signal.firstOutputAt)
  }
}

function drainTimingSignal(requestKey: string, request: PendingRequest) {
  const signal = pendingTimingSignals.get(requestKey)
  if (!signal) return

  applyTimingSignal(request, signal)
  pendingTimingSignals.delete(requestKey)
}

function clearRequestState(requestKey: string) {
  pending.delete(requestKey)
  pendingToolErrors.delete(requestKey)
  pendingTextPreviews.delete(requestKey)
  pendingTimingSignals.delete(requestKey)

  for (const key of trackedPartTimings.keys()) {
    if (key.startsWith(`${requestKey}:`)) trackedPartTimings.delete(key)
  }
}

function applyToolErrorSignal(request: PendingRequest, signal: ToolErrorSignal) {
  request.toolError ??= signal.error
  request.toolErrorCount += signal.count
}

function queueToolErrorSignal(requestKey: string, error: unknown, toolName?: string) {
  const existing = pendingToolErrors.get(requestKey)
  if (existing) {
    existing.count += 1
    return existing
  }

  const signal = {
    error: compactError(error, toolName ? `${toolName} error` : "tool error"),
    count: 1,
  }
  pendingToolErrors.set(requestKey, signal)
  return signal
}

function drainToolErrorSignal(requestKey: string, request: PendingRequest) {
  const signal = pendingToolErrors.get(requestKey)
  if (!signal) return

  applyToolErrorSignal(request, signal)
  pendingToolErrors.delete(requestKey)
}

function queueTextPreviewSignal(requestKey: string, text: unknown, at: number) {
  if (typeof text !== "string") return

  const preview = tail(normalizeTextPreview(text), BUSINESS_ERROR_PREVIEW_LIMIT)
  if (!preview) return

  const existing = pendingTextPreviews.get(requestKey)
  if (!existing || at >= existing.at) pendingTextPreviews.set(requestKey, { text: preview, at })
}

function drainTextPreviewSignal(requestKey: string, request: PendingRequest) {
  const signal = pendingTextPreviews.get(requestKey)
  if (!signal) return

  request.textPreview = signal.text
  pendingTextPreviews.delete(requestKey)
}

function trackPartTiming(
  requestKey: string,
  partID: string,
  kind: "stream" | "reasoning" | "tool",
  start?: number,
  end?: number,
  firstOutputAt?: number,
) {
  const key = partTimingKey(requestKey, partID)
  const current = trackedPartTimings.get(key) ?? { kind, counted: false }
  current.kind = kind
  if (start !== undefined) current.start = current.start === undefined ? start : Math.min(current.start, start)
  if (firstOutputAt !== undefined) queueTimingSignal(requestKey, { firstOutputAt, streamMs: 0, reasoningMs: 0, toolMs: 0 })

  if (end === undefined || current.counted) {
    trackedPartTimings.set(key, current)
    return
  }

  const effectiveStart = current.start ?? start ?? end
  const duration = Math.max(0, end - effectiveStart)
  queueTimingSignal(
    requestKey,
    kind === "stream"
      ? { streamMs: duration, reasoningMs: 0, toolMs: 0 }
      : kind === "reasoning"
        ? { streamMs: 0, reasoningMs: duration, toolMs: 0 }
        : { streamMs: 0, reasoningMs: 0, toolMs: duration },
  )
  current.counted = true
  trackedPartTimings.delete(key)
}

function resolveBusinessError(textPreview?: string) {
  if (!textPreview) return undefined

  const candidate = normalizeBusinessCandidate(textPreview)
  if (!candidate || candidate.length > BUSINESS_ERROR_PREVIEW_LIMIT) return undefined

  const patterns = [
    /^(?:error[:\s-]*)?(?:http\s*)?404(?:\s+not found)?$/,
    /^(?:error[:\s-]*)?not found$/,
    /^(?:error[:\s-]*)?resource not found$/,
    /^(?:error[:\s-]*)?endpoint not found$/,
    /^(?:error[:\s-]*)?page not found$/,
    /^(?:error[:\s-]*)?file not found$/,
    /^(?:error[:\s-]*)?request failed$/,
    /^(?:error[:\s-]*)?failed to fetch$/,
    /^(?:error[:\s-]*)?bad request$/,
    /^(?:error[:\s-]*)?unauthorized$/,
    /^(?:error[:\s-]*)?forbidden$/,
    /^(?:error[:\s-]*)?internal server error$/,
    /^(?:error[:\s-]*)?service unavailable$/,
    /^(?:error[:\s-]*)?gateway timeout$/,
    /^(?:error[:\s-]*)?rate limited$/,
    /^(?:error[:\s-]*)?rate limit exceeded$/,
  ]

  return patterns.some((pattern) => pattern.test(candidate.toLowerCase())) ? candidate : undefined
}

function resolveRequestOutcome(pendingRequest: PendingRequest): RequestOutcome {
  if (pendingRequest.messageError) {
    return { success: false, error: pendingRequest.messageError, errorType: "message_error" }
  }

  if (pendingRequest.legacyMessageError) {
    return { success: false, error: pendingRequest.legacyMessageError, errorType: "message_error" }
  }

  if (pendingRequest.sessionError) {
    return { success: false, error: pendingRequest.sessionError, errorType: "session_error" }
  }

  if (pendingRequest.toolError) {
    return { success: false, error: pendingRequest.toolError, errorType: "tool_error" }
  }

  const businessError = resolveBusinessError(pendingRequest.textPreview)
  if (businessError) {
    return { success: false, error: businessError, errorType: "business_error" }
  }

  return { success: true }
}

async function append(record: Record<string, unknown>) {
  await mkdir(dirname(file), { recursive: true })
  await appendFile(file, `${JSON.stringify(record)}\n`)
}

function binaryAsset() {
  if (process.platform === "win32" && process.arch === "x64") return "opencode-telemetry-panel-windows-x64.exe"
  if (process.platform === "darwin" && process.arch === "arm64") return "opencode-telemetry-panel-macos-arm64"
  if (process.platform === "darwin" && process.arch === "x64") return "opencode-telemetry-panel-macos-x64"
}

function binaryRepo() {
  const raw = process.env.OPENCODE_TELEMETRY_PANEL_REPO?.trim() || "wuyouMaster/opencode-telemetry-panel"
  return raw
    .replace(/^git\+/, "")
    .replace(/^https?:\/\/github\.com\//, "")
    .replace(/^git@github\.com:/, "")
    .replace(/\.git$/, "")
}

async function binaryVersion() {
  const json = JSON.parse(await readFile(packagePath, "utf8")) as { version?: unknown }
  if (typeof json.version !== "string" || !json.version.trim()) return
  return json.version.trim()
}

async function ensureBinary() {
  if (binaryReady) return binaryReady

  binaryReady = (async () => {
    if (process.env.OPENCODE_TELEMETRY_PANEL_SKIP_DOWNLOAD === "1") return
    if ([process.env.OPENCODE_TELEMETRY_PANEL_BIN, executablePath].some((value) => value && existsSync(value))) return

    const asset = binaryAsset()
    const version = await binaryVersion().catch(() => undefined)
    if (!asset || !version) return

    await mkdir(root, { recursive: true })
    const response = await fetch(`https://github.com/${binaryRepo()}/releases/download/v${version}/${asset}`).catch(
      () => undefined,
    )
    if (!response?.ok) return

    const tempPath = `${executablePath}.download`
    await writeFile(tempPath, Buffer.from(await response.arrayBuffer()))
    if (process.platform !== "win32") await chmod(tempPath, 0o755)
    await rm(executablePath, { force: true }).catch(() => undefined)
    await rename(tempPath, executablePath)
  })().catch(() => undefined)

  return binaryReady
}

function launchPanel() {
  if (panelLaunched) return

  const executable = [process.env.OPENCODE_TELEMETRY_PANEL_BIN, executablePath]
    .filter((value): value is string => typeof value === "string")
    .find((value) => existsSync(value))

  if (!executable) return

  const child = Bun.spawn([executable], {
    detached: true,
    stdio: ["ignore", "ignore", "ignore"],
  })

  child.unref()
  panelLaunched = true
}

function recordFromPending(pendingRequest: PendingRequest, finishedAt: number) {
  const firstOutputAt = pendingRequest.firstOutputAt ?? finishedAt
  const waitMs = Math.max(0, firstOutputAt - pendingRequest.startedAt)
  const totalMs = Math.max(0, finishedAt - pendingRequest.startedAt)
  const postProcessMs = Math.max(
    0,
    totalMs - waitMs - pendingRequest.streamMs - pendingRequest.reasoningMs - pendingRequest.toolMs,
  )
  pendingRequest.postProcessMs = postProcessMs
  const outcome = resolveRequestOutcome(pendingRequest)
  return {
    kind: "request",
    sessionId: pendingRequest.sessionId,
    messageId: pendingRequest.messageId,
    providerId: pendingRequest.providerId,
    modelId: pendingRequest.modelId,
    startedAt: pendingRequest.startedAt,
    firstOutputAt,
    completedAt: finishedAt,
    streamMs: pendingRequest.streamMs,
    reasoningMs: pendingRequest.reasoningMs,
    toolMs: pendingRequest.toolMs,
    postProcessMs,
    success: outcome.success,
    error: outcome.error ?? null,
    errorType: outcome.errorType ?? null,
    retries: pendingRequest.retries,
  }
}

export const TelemetryPanelPlugin: Plugin = async () => {
  await ensureBinary()
  launchPanel()

  return {
    event: async ({ event }) => {
      if (event.type === "session.status") {
        if (event.properties.status.type === "retry") {
          for (const request of pending.values()) {
            if (request.sessionId === event.properties.sessionID) request.retries += 1
          }
        }

        return
      }

      if (event.type === "session.error") {
        if (!event.properties.sessionID) return
        attachSessionError(event.properties.sessionID, compactError(event.properties.error, "session error"))
        return
      }

      if (event.type === "message.part.updated") {
        const requestKey = key(event.properties.sessionID, event.properties.part.messageID)

        if (event.properties.part.type === "text") {
          if (event.properties.part.synthetic || event.properties.part.ignored) return

          queueTextPreviewSignal(requestKey, event.properties.part.text, event.properties.time)
          trackPartTiming(
            requestKey,
            event.properties.part.id,
            "stream",
            event.properties.part.time?.start ?? event.properties.time,
            event.properties.part.time?.end,
            event.properties.part.time?.start ?? event.properties.time,
          )
          return
        }

        if (event.properties.part.type === "reasoning") {
          trackPartTiming(
            requestKey,
            event.properties.part.id,
            "reasoning",
            event.properties.part.time?.start,
            event.properties.part.time?.end,
            event.properties.part.time?.start,
          )
          return
        }

        if (event.properties.part.type !== "tool") return

        const toolState = event.properties.part.state
        const toolStart = toolState?.time?.start
        const toolEnd = toolState?.time?.end

        if (toolState?.status === "error") {
          const request = pending.get(requestKey)
          if (!request) {
            queueToolErrorSignal(requestKey, toolState.error, event.properties.part.tool)
          } else {
            drainToolErrorSignal(requestKey, request)
            applyToolErrorSignal(request, {
              error: compactError(
                toolState.error,
                event.properties.part.tool ? `${event.properties.part.tool} error` : "tool error",
              ),
              count: 1,
            })
          }
        }

        trackPartTiming(requestKey, event.properties.part.id, "tool", toolStart, toolEnd, toolStart)
        return
      }

      if (event.type === "message.updated") {
        if (event.properties.info.role !== "assistant") return
        if (event.properties.info.summary) {
          const requestKey = key(event.properties.sessionID, event.properties.info.id)
          clearRequestState(requestKey)
          return
        }

        const requestKey = key(event.properties.sessionID, event.properties.info.id)
        const existing = pending.get(requestKey)
        const next =
          existing ??
          ({
            sessionId: event.properties.sessionID,
            messageId: event.properties.info.id,
            providerId: event.properties.info.providerID,
            modelId: event.properties.info.modelID,
            startedAt: event.properties.info.time.created,
            retries: 0,
            streamMs: 0,
            reasoningMs: 0,
            toolMs: 0,
            postProcessMs: 0,
            toolErrorCount: 0,
          } satisfies PendingRequest)

        next.startedAt = Math.min(next.startedAt, event.properties.info.time.created)
        next.providerId = event.properties.info.providerID
        next.modelId = event.properties.info.modelID
        if (event.properties.info.error) {
          next.messageError = compactError(event.properties.info.error, "message error")
        } else if (event.properties.info.time.error) {
          next.legacyMessageError = compactError(event.properties.info.time.error, "message error")
        }
        drainToolErrorSignal(requestKey, next)
        drainTimingSignal(requestKey, next)
        drainTextPreviewSignal(requestKey, next)
        if (!existing) pending.set(requestKey, next)

        if (event.properties.info.time.completed == null) return
        if (completedRequests.has(requestKey)) return

        await append(recordFromPending(next, event.properties.info.time.completed)).catch(() => undefined)
        completedRequests.add(requestKey)
        clearRequestState(requestKey)
      }
    },
  }
}
