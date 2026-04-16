import { chmod, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises"
import { existsSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"

const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"))
const root = join(homedir(), ".opencode-telemetry")
const binaryName = process.platform === "win32" ? "OpenCodeTelemetryPanel.exe" : "OpenCodeTelemetryPanel"
const binaryPath = join(root, binaryName)
const version = packageJson.version
const repo = resolveRepo(packageJson)
const asset = resolveAsset()

if (!asset) {
  console.warn("[opencode-telemetry-panel] skipping binary download on unsupported platform")
  process.exit(0)
}

if (!repo) {
  console.warn("[opencode-telemetry-panel] skipping binary download because repository is not configured")
  process.exit(0)
}

await mkdir(root, { recursive: true })

const url = `https://github.com/${repo}/releases/download/v${version}/${asset}`
const response = await fetch(url)

if (!response.ok) {
  if (response.status === 404) {
    console.warn(`[opencode-telemetry-panel] binary not found at ${url}; skipping download`)
    process.exit(0)
  }

  throw new Error(`failed to download telemetry panel binary from ${url}: ${response.status} ${response.statusText}`)
}

const tempPath = `${binaryPath}.download`
await writeFile(tempPath, Buffer.from(await response.arrayBuffer()))

if (process.platform !== "win32") await chmod(tempPath, 0o755)

if (existsSync(binaryPath)) await rm(binaryPath, { force: true })
await rename(tempPath, binaryPath)

function resolveRepo(pkg) {
  const override = process.env.OPENCODE_TELEMETRY_PANEL_REPO?.trim()
  if (override) return parseRepo(override) ?? override.replace(/^https?:\/\/github\.com\//, "").replace(/\.git$/, "")

  const value = pkg.repository
  if (typeof value === "string") return parseRepo(value)
  if (value && typeof value.url === "string") return parseRepo(value.url)
}

function parseRepo(value) {
  const text = value.trim()
  if (!text) return
  const https = text.match(/github\.com[:/](.+?)(?:\.git)?$/)
  if (https) return https[1]

  const git = text.match(/^git@github\.com:(.+?)(?:\.git)?$/)
  if (git) return git[1]
}

function resolveAsset() {
  if (process.platform === "win32" && process.arch === "x64") return "opencode-telemetry-panel-windows-x64.exe"
  if (process.platform === "darwin" && process.arch === "arm64") return "opencode-telemetry-panel-macos-arm64"
  if (process.platform === "darwin" && process.arch === "x64") return "opencode-telemetry-panel-macos-x64"
}
