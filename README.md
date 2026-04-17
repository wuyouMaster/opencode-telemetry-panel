# OpenCode Telemetry Panel

OpenCode telemetry plugin plus a Tauri floating panel.

中文文档: [README_CN.md](./README_CN.md)

![OpenCode Telemetry Panel home](./PixPin_2026-04-17_12-24-34.png)

## Changelog

Core changes from `v0.0.7` to `72761b9` (`v0.0.8`):

- Added global, session, and model filters so the panel can drill into scoped metrics, model performance, and recent requests.
- Expanded the native snapshot pipeline and telemetry aggregation to keep filter options and dashboard metrics in sync on each refresh.
- Refreshed the floating panel UI with a cleaner glass layout, stronger visual hierarchy, and updated bilingual copy.

## What it does

- Captures request telemetry from OpenCode events.
- Stores telemetry in `~/.opencode-telemetry/telemetry.jsonl`.
- Launches a native floating panel from the plugin.
- Downloads the matching executable automatically when the plugin loads.

## Package Layout

- `plugin/opencode-telemetry-panel.ts` OpenCode plugin entry.
- `src/` Solid panel UI.
- `src-tauri/` Tauri backend.
- `scripts/postinstall.mjs` binary downloader.

## Install In OpenCode

Add the published npm package to your global or project OpenCode config:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["@wuyoumaster/opencode-telemetry-panel@0.0.8"]
}
```

Restart OpenCode after updating the config. When OpenCode loads the plugin for the first time, it downloads the matching native binary into `~/.opencode-telemetry/`.

## Manual Package Install

```bash
bun add @wuyoumaster/opencode-telemetry-panel
```

or

```bash
npm i @wuyoumaster/opencode-telemetry-panel
```

Manual package installation still runs `postinstall` and downloads the matching binary into `~/.opencode-telemetry/`.

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
