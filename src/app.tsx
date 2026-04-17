import { getCurrentWindow } from "@tauri-apps/api/window"
import { createMemo, createResource, createSignal, For, Show, onCleanup, onMount } from "solid-js"
import { formatMs, formatNumber, formatPercent, formatTimestamp } from "./format"
import type { ModelMetrics, RecentRequest } from "./telemetry"
import { loadSnapshot, loadTelemetryPath } from "./telemetry"

const panelCopy = {
  en: {
    toggleLabel: "中文",
    toggleAria: "Switch to Chinese",
    brandSubtitle: "Floating live metrics for your current OpenCode session",
    emptyTitle: "Waiting for telemetry",
    emptyBody:
      "Start one real request in OpenCode after the plugin loads. The panel will appear as soon as the first telemetry event is written.",
    dataFile: "Data file",
    loadingPath: "Loading path...",
    liveOverview: "Live overview",
    heroTitle: "Native telemetry panel",
    heroBody: (requests: number, models: number) =>
      `Tracking ${formatNumber(requests)} requests across ${formatNumber(models)} models with a 1.2s live refresh loop.`,
    success: "Success",
    p95Latency: "P95 latency",
    data: "Data",
    requests: "Requests",
    records: (count: number) => `${formatNumber(count)} records`,
    successDetail: (successes: number, failures: number) =>
      `${formatNumber(successes)} ok · ${formatNumber(failures)} fail`,
    avgWait: "Avg wait",
    toFirstToken: "to first token",
    avgStream: "Avg stream",
    firstTokenToFinish: "first token to finish",
    avgTotal: "Avg total",
    p95Short: "p95",
    retries: "Retries",
    retryEventsObserved: "retry events observed",
    models: "Models",
    modelsDescription: "Per model latency and reliability.",
    recent: "Recent",
    recentDescription: "Latest completed requests.",
    noFinishedRequests: "No finished requests yet.",
    requestsAndRetries: (requests: number, retries: number) =>
      `${formatNumber(requests)} requests · ${formatNumber(retries)} retries`,
    wait: "Wait",
    stream: "Stream",
    total: "Total",
    ok: "ok",
    error: "error",
    retry: "Retry",
    refreshAria: "Refresh snapshot",
    closeAria: "Close panel",
  },
  zh: {
    toggleLabel: "EN",
    toggleAria: "切换到英文",
    brandSubtitle: "当前会话的实时概览面板",
    emptyTitle: "等待数据写入",
    emptyBody: "在 OpenCode 中发起一次真实请求后，面板会在第一条记录写入时自动显示。",
    dataFile: "数据位置",
    loadingPath: "正在读取路径...",
    liveOverview: "实时状态",
    heroTitle: "对话响应概览",
    heroBody: (requests: number, models: number) =>
      `已记录 ${formatNumber(requests)} 次请求，覆盖 ${formatNumber(models)} 个模型，面板会每 1.2 秒自动刷新。`,
    success: "成功率",
    p95Latency: "P95 延迟",
    data: "存储位置",
    requests: "请求总数",
    records: (count: number) => `${formatNumber(count)} 条记录`,
    successDetail: (successes: number, failures: number) =>
      `${formatNumber(successes)} 次成功 · ${formatNumber(failures)} 次失败`,
    avgWait: "首字等待",
    toFirstToken: "从发起请求到收到首个 token",
    avgStream: "输出耗时",
    firstTokenToFinish: "从首个 token 到输出结束",
    avgTotal: "平均总耗时",
    p95Short: "P95",
    retries: "重试总数",
    retryEventsObserved: "本轮会话中记录到的重试次数",
    models: "模型表现",
    modelsDescription: "查看各模型的响应速度和稳定性。",
    recent: "最近记录",
    recentDescription: "刚刚完成的请求会显示在这里。",
    noFinishedRequests: "暂时还没有已完成的请求。",
    requestsAndRetries: (requests: number, retries: number) =>
      `${formatNumber(requests)} 次调用 · ${formatNumber(retries)} 次重试`,
    wait: "首字等待",
    stream: "输出耗时",
    total: "总耗时",
    ok: "成功",
    error: "失败",
    retry: "重试",
    refreshAria: "刷新面板数据",
    closeAria: "关闭面板",
  },
} as const

type Locale = keyof typeof panelCopy
type PanelCopy = (typeof panelCopy)[Locale]

function RefreshIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path
        d="M15.25 5.6V2.75l2.45 2.45-2.45 2.45V5.6h-.28A5.97 5.97 0 0 0 9 11.57"
        fill="none"
        stroke="currentColor"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="1.7"
      />
      <path
        d="M4.75 14.4v2.85L2.3 14.8l2.45-2.45v2.05h.28A5.97 5.97 0 0 0 11 8.43"
        fill="none"
        stroke="currentColor"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="1.7"
      />
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="M6 6l8 8M14 6l-8 8" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.8" />
    </svg>
  )
}

function MetricCard(props: { label: string; value: string; detail?: string; accent?: string }) {
  return (
    <section class="metric-card">
      <div class="metric-label">{props.label}</div>
      <div class="metric-value" style={props.accent ? { color: props.accent } : undefined}>
        {props.value}
      </div>
      <Show when={props.detail}>
        <div class="metric-detail">{props.detail}</div>
      </Show>
    </section>
  )
}

function ModelCard(props: { model: ModelMetrics; copy: PanelCopy }) {
  const successWidth = `${Math.min(100, Math.max(0, props.model.successRate))}%`

  return (
    <section class="model-card">
      <div class="model-head">
        <div>
          <div class="model-key">{props.model.key}</div>
          <div class="model-meta">{props.copy.requestsAndRetries(props.model.requests, props.model.retries)}</div>
        </div>
        <div
          class={`status-pill ${props.model.successRate >= 95 ? "good" : props.model.successRate >= 80 ? "warn" : "bad"}`}
        >
          {formatPercent(props.model.successRate)}
        </div>
      </div>
      <div class="model-bar">
        <div class="model-bar-fill" style={{ width: successWidth }} />
      </div>
      <div class="model-grid">
        <div>
          <span>{props.copy.wait}</span>
          <strong>{formatMs(props.model.avgWaitMs)}</strong>
        </div>
        <div>
          <span>{props.copy.stream}</span>
          <strong>{formatMs(props.model.avgNetworkMs)}</strong>
        </div>
        <div>
          <span>{props.copy.total}</span>
          <strong>{formatMs(props.model.avgLatencyMs)}</strong>
        </div>
        <div>
          <span>P95</span>
          <strong>{formatMs(props.model.p95LatencyMs)}</strong>
        </div>
      </div>
    </section>
  )
}

function RecentItem(props: { item: RecentRequest; copy: PanelCopy }) {
  return (
    <li class="recent-item">
      <div class="recent-head">
        <div class="recent-main">
          <div class="recent-title">{props.item.key}</div>
          <div class="recent-subtitle">{formatTimestamp(props.item.finishedAt)}</div>
        </div>
        <div class={`status-pill ${props.item.success ? "good" : "bad"}`}>
          {props.item.success ? props.copy.ok : props.copy.error}
        </div>
      </div>
      <div class="recent-metrics">
        <span class="recent-pill">
          {props.copy.wait} {formatMs(props.item.waitMs)}
        </span>
        <span class="recent-pill">
          {props.copy.stream} {formatMs(props.item.networkMs)}
        </span>
        <span class="recent-pill">
          {props.copy.total} {formatMs(props.item.latencyMs)}
        </span>
        <Show when={props.item.retries > 0}>
          <span class="recent-pill recent-pill-warm">
            {props.copy.retry} {formatNumber(props.item.retries)}
          </span>
        </Show>
      </div>
      <Show when={!props.item.success && props.item.error}>
        <div class="recent-error">{props.item.error}</div>
      </Show>
    </li>
  )
}

function EmptyState(props: { path?: string; copy: PanelCopy }) {
  return (
    <section class="empty-state">
      <div class="empty-title">{props.copy.emptyTitle}</div>
      <p>{props.copy.emptyBody}</p>
      <p class="empty-path">
        {props.copy.dataFile}: <code>{props.path ?? "~/.opencode-telemetry/telemetry.jsonl"}</code>
      </p>
    </section>
  )
}

export function App() {
  const [snapshot, { refetch }] = createResource(loadSnapshot)
  const [telemetryPath] = createResource(loadTelemetryPath)
  const [locale, setLocale] = createSignal<Locale>("en")

  onMount(() => {
    const stored = window.localStorage.getItem("opencode-telemetry-locale")
    if (stored === "en" || stored === "zh") setLocale(stored)
    const timer = window.setInterval(() => void refetch(), 1200)
    onCleanup(() => window.clearInterval(timer))
  })

  const copy = createMemo(() => panelCopy[locale()])
  const models = createMemo(() => snapshot()?.models ?? [])
  const recent = createMemo(() => snapshot()?.recent ?? [])
  const summary = createMemo(() => snapshot()?.summary)
  const activeSummary = createMemo(() => {
    const value = summary()
    return value && value.requests > 0 ? value : undefined
  })

  const refresh = () => void refetch()
  const dragPanel = async (event: MouseEvent) => {
    if (event.button !== 0) return
    const target = event.target instanceof HTMLElement ? event.target : undefined
    if (target?.closest(".chrome-actions")) return
    await getCurrentWindow().startDragging()
  }
  const closePanel = async () => {
    await getCurrentWindow().close()
  }
  const toggleLocale = () => {
    setLocale((current) => {
      const next = current === "en" ? "zh" : "en"
      window.localStorage.setItem("opencode-telemetry-locale", next)
      return next
    })
  }

  return (
    <div class="shell">
      <div class="shell-glow shell-glow-a" />
      <div class="shell-glow shell-glow-b" />

      <header class="chrome" onMouseDown={dragPanel}>
        <div class="brand" aria-label="Drag window">
          <span class="brand-mark" />
          <span class="brand-copy">
            <strong>OpenCode Telemetry</strong>
            <small>{copy().brandSubtitle}</small>
          </span>
        </div>

        <div class="chrome-actions">
          <button type="button" class="lang-button" onClick={toggleLocale} aria-label={copy().toggleAria}>
            {copy().toggleLabel}
          </button>
          <button type="button" class="icon-button" onClick={refresh} aria-label={copy().refreshAria}>
            <RefreshIcon />
          </button>
          <button type="button" class="icon-button danger" onClick={closePanel} aria-label={copy().closeAria}>
            <CloseIcon />
          </button>
        </div>
      </header>

      <main class="content">
        <Show when={activeSummary()} fallback={<EmptyState path={telemetryPath() ?? undefined} copy={copy()} />}>
          {(data) => (
            <>
              <section class="hero-card">
                <div class="hero-copy">
                  <div class="hero-eyebrow">{copy().liveOverview}</div>
                  <h1>{copy().heroTitle}</h1>
                  <p>{copy().heroBody(data().requests, models().length)}</p>
                </div>
                <div class="hero-meta">
                  <div class="hero-chip">
                    <span>{copy().success}</span>
                    <strong>{formatPercent(data().successRate)}</strong>
                  </div>
                  <div class="hero-chip">
                    <span>{copy().p95Latency}</span>
                    <strong>{formatMs(data().p95LatencyMs)}</strong>
                  </div>
                  <div class="hero-path" title={telemetryPath() ?? undefined}>
                    <span>{copy().data}</span>
                    <code>{telemetryPath() ?? copy().loadingPath}</code>
                  </div>
                </div>
              </section>

              <section class="summary-grid">
                <MetricCard
                  label={copy().requests}
                  value={formatNumber(data().requests)}
                  detail={copy().records(snapshot()?.recordCount ?? 0)}
                  accent="#8b5cf6"
                />
                <MetricCard
                  label={copy().success}
                  value={formatPercent(data().successRate)}
                  detail={copy().successDetail(data().successes, data().failures)}
                  accent="#22c55e"
                />
                <MetricCard
                  label={copy().avgWait}
                  value={formatMs(data().avgWaitMs)}
                  detail={copy().toFirstToken}
                  accent="#38bdf8"
                />
                <MetricCard
                  label={copy().avgStream}
                  value={formatMs(data().avgNetworkMs)}
                  detail={copy().firstTokenToFinish}
                  accent="#f59e0b"
                />
                <MetricCard
                  label={copy().avgTotal}
                  value={formatMs(data().avgLatencyMs)}
                  detail={`${copy().p95Short} ${formatMs(data().p95LatencyMs)}`}
                  accent="#f472b6"
                />
                <MetricCard
                  label={copy().retries}
                  value={formatNumber(data().retries)}
                  detail={copy().retryEventsObserved}
                  accent="#eab308"
                />
              </section>

              <section class="panel-section">
                <div class="section-head">
                  <div>
                    <h2>{copy().models}</h2>
                    <p>{copy().modelsDescription}</p>
                  </div>
                  <span class="section-badge">{formatNumber(models().length)}</span>
                </div>

                <div class="model-list">
                  <For each={models()}>{(model) => <ModelCard model={model} copy={copy()} />}</For>
                </div>
              </section>

              <section class="panel-section">
                <div class="section-head">
                  <div>
                    <h2>{copy().recent}</h2>
                    <p>{copy().recentDescription}</p>
                  </div>
                  <span class="section-badge">{formatNumber(recent().length)}</span>
                </div>

                <Show when={recent().length > 0} fallback={<div class="empty-inline">{copy().noFinishedRequests}</div>}>
                  <ul class="recent-list">
                    <For each={recent()}>{(item) => <RecentItem item={item} copy={copy()} />}</For>
                  </ul>
                </Show>
              </section>
            </>
          )}
        </Show>
      </main>
    </div>
  )
}
