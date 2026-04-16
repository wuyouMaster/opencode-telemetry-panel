# OpenCode Telemetry Panel

OpenCode 监控插件 + Tauri 浮窗面板。

English: [README.md](./README.md)

## 功能

- 监听 OpenCode 事件并记录请求指标。
- 将 telemetry 保存到 `~/.opencode-telemetry/telemetry.jsonl`。
- 由插件拉起本地浮窗面板。
- 安装时通过 `postinstall` 自动下载匹配平台的可执行文件。

## 仓库结构

- `plugin/opencode-telemetry-panel.ts` OpenCode 插件入口。
- `src/` Solid 前端界面。
- `src-tauri/` Tauri 后端。
- `scripts/postinstall.mjs` 二进制下载脚本。

## 安装

```bash
bun add @opencode-ai/telemetry-panel
```

或者

```bash
npm i @opencode-ai/telemetry-panel
```

安装时会执行 `postinstall`，把对应平台的可执行文件下载到 `~/.opencode-telemetry/`。

## 环境变量

- `OPENCODE_TELEMETRY_PANEL_REPO` 覆盖下载二进制时使用的 GitHub 仓库地址。
- `OPENCODE_TELEMETRY_PANEL_BIN` 手动指定可执行文件路径。

## 支持平台

- Windows x64
- macOS x64
- macOS arm64

暂时不发布 Linux 构建产物。

## 开发

```bash
bun install
bun run tauri dev
```

## 构建可执行文件

```bash
bun run build:exe
```

这里只输出可执行文件，不生成安装包。

## 发布

- 推送 `v*` tag 会同时触发 npm 发布和 GitHub Release。
- GitHub Release 会附带各平台的可执行文件。

## 说明

- 插件默认从 `~/.opencode-telemetry/OpenCodeTelemetryPanel(.exe)` 读取可执行文件。
- Windows 下文件名是 `OpenCodeTelemetryPanel.exe`。
