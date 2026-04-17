import { appendFile, chmod, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises"
import { existsSync } from "node:fs"
import { dirname, join } from "node:path"
import { homedir } from "node:os"

type SessionStatusEvent = {
  type: "session.status"
  properties: {
    sessionID: string
    status: {
      type: string
    }
  }
}

type MessagePartDeltaEvent = {
  type: "message.part.delta"
  properties: {
    sessionID: string
    messageID: string
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
      time: {
        created: number
        completed?: number | null
        error?: unknown
      }
    }
  }
}

type SessionErrorEvent = {
  type: "session.error"
  properties: {
    sessionID?: string | null
    error: unknown
  }
}

type TelemetryEvent = SessionStatusEvent | MessagePartDeltaEvent | MessageUpdatedEvent | SessionErrorEvent

type Plugin = () => Promise<{
  event: (input: { event: TelemetryEvent }) => Promise<void>
}>

type PendingRequest = {
  sessionId: string
  messageId: string
  providerId: string
  modelId: string
  startedAt: number
  firstTokenAt?: number
  retries: number
}

const root = join(homedir(), ".opencode-telemetry")
const file = join(root, "telemetry.jsonl")
const executablePath = join(
  root,
  process.platform === "win32" ? "OpenCodeTelemetryPanel.exe" : "OpenCodeTelemetryPanel",
)
const packagePath = new URL("../package.json", import.meta.url)
const pending = new Map<string, PendingRequest>()
const firstTokenAt = new Map<string, number>()
let binaryReady: Promise<void> | undefined
let panelLaunched = false

function key(sessionId: string, messageId: string) {
  return `${sessionId}:${messageId}`
}

function compactError(error: unknown) {
  if (!error) return "session error"
  if (typeof error !== "object") return String(error)
  if ("data" in error && error.data && typeof error.data === "object" && "message" in error.data) {
    return String((error.data as { message?: unknown }).message ?? (error as { message?: unknown }).message ?? "")
  }
  return String((error as { message?: unknown }).message ?? error)
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

function recordFromPending(pendingRequest: PendingRequest, finishedAt: number, success: boolean, error?: string) {
  const firstTokenAt = pendingRequest.firstTokenAt ?? finishedAt
  return {
    kind: "request",
    sessionId: pendingRequest.sessionId,
    messageId: pendingRequest.messageId,
    providerId: pendingRequest.providerId,
    modelId: pendingRequest.modelId,
    startedAt: pendingRequest.startedAt,
    firstTokenAt,
    completedAt: finishedAt,
    success,
    error: error ?? null,
    retries: pendingRequest.retries,
  }
}

export const TelemetryPanelPlugin: Plugin = async () => {
  await ensureBinary()
  launchPanel()

  return {
    event: async ({ event }) => {
      if (event.type === "session.status") {
        if (event.properties.status.type === "idle") {
          for (const [requestKey, request] of pending.entries()) {
            if (request.sessionId !== event.properties.sessionID) continue
            pending.delete(requestKey)
            firstTokenAt.delete(requestKey)
          }
          return
        }

        if (event.properties.status.type === "retry") {
          for (const request of pending.values()) {
            if (request.sessionId === event.properties.sessionID) request.retries += 1
          }
        }

        return
      }

      if (event.type === "message.part.delta") {
        const requestKey = key(event.properties.sessionID, event.properties.messageID)
        if (!firstTokenAt.has(requestKey)) firstTokenAt.set(requestKey, Date.now())

        const request = pending.get(requestKey)
        if (request && request.firstTokenAt === undefined) request.firstTokenAt = firstTokenAt.get(requestKey)
        return
      }

      if (event.type === "message.updated") {
        if (event.properties.info.role !== "assistant") return

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
          } satisfies PendingRequest)

        if (next.firstTokenAt === undefined) next.firstTokenAt = firstTokenAt.get(requestKey)

        if (!existing) pending.set(requestKey, next)

        if (!event.properties.info.time.completed) return

        await append(
          recordFromPending(
            next,
            event.properties.info.time.completed,
            !event.properties.info.time.error,
            event.properties.info.time.error ? compactError(event.properties.info.time.error) : undefined,
          ),
        ).catch(() => undefined)
        pending.delete(requestKey)
        firstTokenAt.delete(requestKey)
        return
      }

      if (event.type === "session.error") {
        const sessionId = event.properties.sessionID
        if (!sessionId) return

        const requests = [...pending.values()].filter((request) => request.sessionId === sessionId)
        const request = requests.sort((left, right) => right.startedAt - left.startedAt)[0]
        if (!request) return

        await append(recordFromPending(request, Date.now(), false, compactError(event.properties.error))).catch(
          () => undefined,
        )
        const requestKey = key(request.sessionId, request.messageId)
        pending.delete(requestKey)
        firstTokenAt.delete(requestKey)
      }
    },
  }
}
