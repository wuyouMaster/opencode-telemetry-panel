# OpenCode Telemetry Panel

OpenCode 监控插件 + Tauri 浮窗面板。

English: [README.md](./README.md)

![OpenCode Telemetry Panel 首页界面](./v0.1.2.1.png)
![OpenCode Telemetry Panel example1](./v0.1.2.png)
![OpenCode Telemetry Panel example2](./Weixin%20Image_20260417142221_3070_1358.png)

## latest version: 
- v0.1.3

## Change Log

`v0.1.1` 到 `v0.1.2` 之间的核心改动：

- 新增更细的耗时指标，覆盖等待、文本流、思考、工具执行和后处理，并同步到总览、模型和最近记录视图。
- 增加失败类型分类、失败原因面板和失败筛选维度，方便更快分析错误。
- 扩展最近记录卡片和模型卡片，让新增指标直接显示在主看板里。

`v0.0.8` 到 `v0.1.1` 之间的核心改动：

- `v0.0.9`：重新梳理 telemetry 指标，改用首个输出时间并避免重复完成记录；补充了教程/引导文档和截图，并修复了最初的筛选交互问题。
- `v0.1.0`：修复筛选切换 bug，保证范围切换时选中值与快照数据同步。
- `v0.1.1`：调整浮窗面板的 CSS 和文案，整体更简洁、更精致。

`v0.0.7` 到 `72761b9`（`v0.0.8`）之间的核心改动：

- 新增全局、会话、模型三种筛选视图，可以按范围查看指标、模型表现和最近请求。
- 扩展原生快照和 telemetry 聚合逻辑，让筛选项和看板指标在每次刷新时保持同步。
- 重做浮窗面板视觉样式，更新玻璃态布局、信息层级和中英双语文案。

## 功能

- 监听 OpenCode 事件并记录请求指标。
- 将 telemetry 保存到 `~/.opencode-telemetry/telemetry.jsonl`。
- 由插件拉起本地浮窗面板。
- 插件加载时自动下载匹配平台的可执行文件。

## 仓库结构

- `plugin/opencode-telemetry-panel.ts` OpenCode 插件入口。
- `src/` Solid 前端界面。
- `src-tauri/` Tauri 后端。
- `scripts/postinstall.mjs` 二进制下载脚本。

## 在 OpenCode 中安装

把已发布的 npm 包写入全局或项目级 OpenCode 配置：

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["@wuyoumaster/opencode-telemetry-panel@0.1.3"]
}
```

更新配置后重启 OpenCode。插件首次加载时，会把对应平台的原生二进制下载到 `~/.opencode-telemetry/`。

## 手动安装 npm 包

```bash
bun add @wuyoumaster/opencode-telemetry-panel
```

或者

```bash
npm i @wuyoumaster/opencode-telemetry-panel
```

手动安装 npm 包时仍会执行 `postinstall`，把对应平台的可执行文件下载到 `~/.opencode-telemetry/`。

## 环境变量

- `OPENCODE_TELEMETRY_PANEL_REPO` 覆盖下载二进制时使用的 GitHub 仓库地址。
- `OPENCODE_TELEMETRY_PANEL_BIN` 手动指定可执行文件路径。
- `OPENCODE_TELEMETRY_PANEL_SKIP_DOWNLOAD=1` 可在 CI 安装时跳过二进制下载。

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
