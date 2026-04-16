import { getCurrentWindow } from "@tauri-apps/api/window"
import { createMemo, createResource, For, Show, onCleanup, onMount } from "solid-js"
import { formatMs, formatNumber, formatPercent, formatTimestamp } from "./format"
import type { ModelMetrics, RecentRequest } from "./telemetry"
import { loadSnapshot, loadTelemetryPath } from "./telemetry"

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

function ModelCard(props: { model: ModelMetrics }) {
  const successWidth = `${Math.min(100, Math.max(0, props.model.successRate))}%`

  return (
    <section class="model-card">
      <div class="model-head">
        <div>
          <div class="model-key">{props.model.key}</div>
          <div class="model-meta">
            {formatNumber(props.model.requests)} requests · {formatNumber(props.model.retries)} retries
          </div>
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
          <span>Wait</span>
          <strong>{formatMs(props.model.avgWaitMs)}</strong>
        </div>
        <div>
          <span>Stream</span>
          <strong>{formatMs(props.model.avgNetworkMs)}</strong>
        </div>
        <div>
          <span>Total</span>
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

function RecentItem(props: { item: RecentRequest }) {
  return (
    <li class="recent-item">
      <div class="recent-main">
        <div class="recent-title">{props.item.key}</div>
        <div class="recent-subtitle">{formatTimestamp(props.item.finishedAt)}</div>
      </div>
      <div class="recent-metrics">
        <span>{formatMs(props.item.waitMs)} wait</span>
        <span>{formatMs(props.item.networkMs)} stream</span>
        <span>{formatMs(props.item.latencyMs)} total</span>
      </div>
      <div class={`status-pill ${props.item.success ? "good" : "bad"}`}>{props.item.success ? "ok" : "error"}</div>
      <Show when={!props.item.success && props.item.error}>
        <div class="recent-error">{props.item.error}</div>
      </Show>
    </li>
  )
}

function EmptyState(props: { path?: string }) {
  return (
    <section class="empty-state">
      <div class="empty-title">Waiting for telemetry</div>
      <p>
        Copy <code>plugin/opencode-telemetry-panel.ts</code> into your OpenCode plugin directory, then restart OpenCode.
      </p>
      <p class="empty-path">
        Data file: <code>{props.path ?? "~/.opencode-telemetry/telemetry.jsonl"}</code>
      </p>
    </section>
  )
}

export function App() {
  const [snapshot, { refetch }] = createResource(loadSnapshot)
  const [telemetryPath] = createResource(loadTelemetryPath)

  onMount(() => {
    const timer = window.setInterval(() => void refetch(), 1200)
    onCleanup(() => window.clearInterval(timer))
  })

  const models = createMemo(() => snapshot()?.models ?? [])
  const recent = createMemo(() => snapshot()?.recent ?? [])
  const summary = createMemo(() => snapshot()?.summary)
  const activeSummary = createMemo(() => {
    const value = summary()
    return value && value.requests > 0 ? value : undefined
  })

  const refresh = () => void refetch()
  const dragPanel = async () => {
    await getCurrentWindow().startDragging()
  }
  const closePanel = async () => {
    await getCurrentWindow().close()
  }

  return (
    <div class="shell">
      <div class="shell-glow shell-glow-a" />
      <div class="shell-glow shell-glow-b" />

      <header class="chrome">
        <button class="brand" type="button" onPointerDown={dragPanel} aria-label="Drag window">
          <span class="brand-dot" />
          <span>
            <strong>OpenCode Telemetry</strong>
            <small>{telemetryPath() ?? "Loading path..."}</small>
          </span>
        </button>

        <div class="chrome-actions">
          <button type="button" class="icon-button" onClick={refresh} aria-label="Refresh snapshot">
            ↻
          </button>
          <button type="button" class="icon-button danger" onClick={closePanel} aria-label="Close panel">
            ×
          </button>
        </div>
      </header>

      <main class="content">
        <Show when={activeSummary()} fallback={<EmptyState path={telemetryPath() ?? undefined} />}>
          {(data) => (
            <>
              <section class="summary-grid">
                <MetricCard
                  label="Requests"
                  value={formatNumber(data().requests)}
                  detail={`${formatNumber(snapshot()?.recordCount ?? 0)} records`}
                  accent="#8b5cf6"
                />
                <MetricCard
                  label="Success"
                  value={formatPercent(data().successRate)}
                  detail={`${formatNumber(data().successes)} ok · ${formatNumber(data().failures)} fail`}
                  accent="#22c55e"
                />
                <MetricCard
                  label="Avg wait"
                  value={formatMs(data().avgWaitMs)}
                  detail="to first token"
                  accent="#38bdf8"
                />
                <MetricCard
                  label="Avg stream"
                  value={formatMs(data().avgNetworkMs)}
                  detail="first token to finish"
                  accent="#f59e0b"
                />
                <MetricCard
                  label="Avg total"
                  value={formatMs(data().avgLatencyMs)}
                  detail={`p95 ${formatMs(data().p95LatencyMs)}`}
                  accent="#f472b6"
                />
                <MetricCard
                  label="Retries"
                  value={formatNumber(data().retries)}
                  detail="retry events observed"
                  accent="#eab308"
                />
              </section>

              <section class="panel-section">
                <div class="section-head">
                  <div>
                    <h2>Models</h2>
                    <p>Per model latency and reliability.</p>
                  </div>
                  <span class="section-badge">{formatNumber(models().length)}</span>
                </div>

                <div class="model-list">
                  <For each={models()}>{(model) => <ModelCard model={model} />}</For>
                </div>
              </section>

              <section class="panel-section">
                <div class="section-head">
                  <div>
                    <h2>Recent</h2>
                    <p>Latest completed requests.</p>
                  </div>
                  <span class="section-badge">{formatNumber(recent().length)}</span>
                </div>

                <Show when={recent().length > 0} fallback={<div class="empty-inline">No finished requests yet.</div>}>
                  <ul class="recent-list">
                    <For each={recent()}>{(item) => <RecentItem item={item} />}</For>
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
