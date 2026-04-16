# OpenCode Telemetry Panel

OpenCode telemetry plugin plus a Tauri floating panel.

中文文档: [README_CN.md](./README_CN.md)

## What it does

- Captures request telemetry from OpenCode events.
- Stores telemetry in `~/.opencode-telemetry/telemetry.jsonl`.
- Launches a native floating panel from the plugin.
- Downloads the matching executable automatically during `postinstall`.

## Package Layout

- `plugin/opencode-telemetry-panel.ts` OpenCode plugin entry.
- `src/` Solid panel UI.
- `src-tauri/` Tauri backend.
- `scripts/postinstall.mjs` binary downloader.

## Install

```bash
bun add @opencode-ai/telemetry-panel
```

or

```bash
npm i @opencode-ai/telemetry-panel
```

The install step runs `postinstall` and downloads the matching binary into `~/.opencode-telemetry/`.

## Environment Variables

- `OPENCODE_TELEMETRY_PANEL_REPO` overrides the GitHub repo slug used for binary downloads.
- `OPENCODE_TELEMETRY_PANEL_BIN` forces a custom binary path.
- `OPENCODE_TELEMETRY_PANEL_SKIP_DOWNLOAD=1` disables binary download during CI installs.

## Supported Platforms

- Windows x64
- macOS x64
- macOS arm64

Linux is intentionally not supported for release artifacts yet.

## Development

```bash
bun install
bun run tauri dev
```

## Build Executable

```bash
bun run build:exe
```

This outputs the executable only, not an installer.

## Release

- Push a `v*` tag to publish npm and GitHub Release artifacts.
- GitHub Releases contain the platform-specific executables.

## Notes

- The plugin reads the binary from `~/.opencode-telemetry/OpenCodeTelemetryPanel(.exe)` by default.
- On Windows, the binary is `OpenCodeTelemetryPanel.exe`.
