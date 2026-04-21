import { getCurrentWindow } from "@tauri-apps/api/window"
import { createEffect, createMemo, createResource, createSignal, For, Show, onCleanup, onMount } from "solid-js"
import { formatMs, formatNumber, formatPercent, formatTimestamp } from "./format"
import type { FailureBreakdown, FilterOption, FilterScope, ModelMetrics, RecentRequest, SnapshotQuery } from "./telemetry"
import { loadSnapshot, loadTelemetryPath } from "./telemetry"

const panelCopy = {
  en: {
    toggleLabel: "中文",
    toggleAria: "Switch to Chinese",
    brandSubtitle: "Floating live metrics for your current OpenCode session",
    emptyTitle: "Waiting for telemetry",
    emptyBody:
      "Start a real request in OpenCode after the plugin loads. The panel will appear as soon as the first record is written.",
    noResultsTitle: "No matching records",
    noResultsBody: (scopeLabel: string) => `No records match the current ${scopeLabel} filter. Try another selection.`,
    dataFile: "Data file",
    loadingPath: "Loading path...",
    liveOverview: "Live overview",
    heroTitle: "Native telemetry panel",
    heroBody: (requests: number, models: number) =>
      `Tracking ${formatNumber(requests)} completed requests across ${formatNumber(models)} models with a 1.2s live refresh loop.`,
    success: "Success",
    p95Latency: "P95 latency",
    data: "Data",
    requests: "Requests",
    records: (shown: number, total: number) =>
      shown === total
        ? `${formatNumber(shown)} records`
        : `${formatNumber(shown)} shown / ${formatNumber(total)} total`,
    successDetail: (successes: number, failures: number) =>
      `${formatNumber(successes)} ok · ${formatNumber(failures)} fail`,
    avgWait: "Wait time",
    toFirstToken: "from request to first output",
    avgStream: "Text stream",
    streamDetail: "model text output",
    avgReasoning: "Reasoning",
    reasoningDetail: "thinking time",
    avgTool: "Tool time",
    toolDetail: "tool execution",
    avgPostProcess: "Post-processing",
    postProcessDetail: "after text, reasoning, and tools",
    avgTotal: "Total latency",
    totalDetail: "request to completion",
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
    reasoning: "Reasoning",
    tool: "Tool",
    postProcess: "Post",
    total: "Total",
    ok: "ok",
    error: "error",
    retry: "Retry",
    refreshAria: "Refresh snapshot",
    closeAria: "Close panel",
    filterLabel: "Filter",
    filterAll: "All",
    filterSession: "Session",
    filterModel: "Model",
    filterFailure: "Failure",
    sessionSelectPlaceholder: "Choose a session",
    modelSelectPlaceholder: "Choose a model",
    failureSelectPlaceholder: "Choose a failure class",
    allView: "Global view",
    failureReasons: "Failure reasons",
    failureReasonsDescription: "Breakdown of failed requests in the current view.",
    noFailures: "No failures in the current view.",
    failureRequests: "requests",
  },
  zh: {
    toggleLabel: "EN",
    toggleAria: "切换到英文",
    brandSubtitle: "当前会话的实时指标面板",
    emptyTitle: "等待数据写入",
    emptyBody: "在 OpenCode 中发起一次真实请求后，面板会在第一条记录写入时自动显示。",
    noResultsTitle: "当前筛选没有结果",
    noResultsBody: (scopeLabel: string) => `当前“${scopeLabel}”筛选下暂时没有匹配记录，换个条件试试。`,
    dataFile: "数据位置",
    loadingPath: "正在读取路径...",
    liveOverview: "实时状态",
    heroTitle: "会话响应概览",
    heroBody: (requests: number, models: number) =>
      `已记录 ${formatNumber(requests)} 次完成请求，覆盖 ${formatNumber(models)} 个模型，面板会每 1.2 秒自动刷新。`,
    success: "成功率",
    p95Latency: "P95 延迟",
    data: "存储位置",
    requests: "请求总数",
    records: (shown: number, total: number) =>
      shown === total
        ? `${formatNumber(shown)} 条记录`
        : `已显示 ${formatNumber(shown)} / 共 ${formatNumber(total)} 条`,
    successDetail: (successes: number, failures: number) =>
      `${formatNumber(successes)} 次成功 · ${formatNumber(failures)} 次失败`,
    avgWait: "等待时长",
    toFirstToken: "从请求到首个输出",
    avgStream: "文本流",
    streamDetail: "模型正文输出",
    avgReasoning: "思考",
    reasoningDetail: "推理过程",
    avgTool: "工具耗时",
    toolDetail: "工具执行时间",
    avgPostProcess: "后处理",
    postProcessDetail: "文本、思考和工具之后",
    avgTotal: "总耗时",
    totalDetail: "从请求到完成",
    p95Short: "P95",
    retries: "重试总数",
    retryEventsObserved: "本次会话记录到的重试次数",
    models: "模型表现",
    modelsDescription: "查看各模型的响应速度和稳定性。",
    recent: "最近记录",
    recentDescription: "刚完成的请求会显示在这里。",
    noFinishedRequests: "暂时还没有已完成的请求。",
    requestsAndRetries: (requests: number, retries: number) =>
      `${formatNumber(requests)} 次调用 · ${formatNumber(retries)} 次重试`,
    wait: "等待",
    stream: "流式",
    reasoning: "思考",
    tool: "工具",
    postProcess: "后处理",
    total: "总计",
    ok: "成功",
    error: "失败",
    retry: "重试",
    refreshAria: "刷新面板数据",
    closeAria: "关闭面板",
    filterLabel: "筛选",
    filterAll: "全部",
    filterSession: "会话",
    filterModel: "模型",
    filterFailure: "失败",
    sessionSelectPlaceholder: "选择会话",
    modelSelectPlaceholder: "选择模型",
    failureSelectPlaceholder: "选择失败类型",
    allView: "全局视图",
    failureReasons: "失败原因",
    failureReasonsDescription: "展示当前视图中失败请求的构成。",
    noFailures: "当前视图中没有失败请求。",
    failureRequests: "次请求",
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

function FilterBar(props: {
  copy: PanelCopy
  scope: FilterScope
  sessionValue: string
  modelValue: string
  failureValue: string
  sessionOptions: FilterOption[]
  modelOptions: FilterOption[]
  failureOptions: FilterOption[]
  onScopeChange: (scope: FilterScope) => void
  onSessionChange: (value: string) => void
  onModelChange: (value: string) => void
  onFailureChange: (value: string) => void
}) {
  const formatOption = (option: FilterOption, scope: FilterScope) => {
    const value =
      scope === "session"
        ? shortValue(option.value)
        : scope === "failure"
          ? humanizeFailureType(option.value)
          : option.value
    return `${value} · ${formatNumber(option.count)}`
  }

  const currentValue = () =>
    props.scope === "session"
      ? props.sessionValue
      : props.scope === "failure"
        ? props.failureValue
        : props.modelValue
  const currentOptions = () =>
    props.scope === "session"
      ? props.sessionOptions
      : props.scope === "failure"
        ? props.failureOptions
        : props.modelOptions

  const scopeSummary = () => {
    if (props.scope === "all") return props.copy.allView
    if (props.scope === "session")
      return props.sessionValue ? shortValue(props.sessionValue) : props.copy.sessionSelectPlaceholder
    if (props.scope === "failure")
      return props.failureValue ? humanizeFailureType(props.failureValue) : props.copy.failureSelectPlaceholder
    return props.modelValue || props.copy.modelSelectPlaceholder
  }

  const handleFilterValue = (value: string) => {
    if (props.scope === "session") {
      props.onSessionChange(value)
      return
    }
    if (props.scope === "failure") {
      props.onFailureChange(value)
      return
    }
    props.onModelChange(value)
  }

  return (
    <section class="filter-bar">
      <div class="filter-head">
        <div class="filter-copy">
          <span>{props.copy.filterLabel}</span>
          <strong>{scopeSummary()}</strong>
        </div>

        <div class="filter-segments" role="tablist" aria-label={props.copy.filterLabel}>
          <button
            type="button"
            class={`scope-chip ${props.scope === "all" ? "active" : ""}`}
            aria-pressed={props.scope === "all"}
            onClick={() => props.onScopeChange("all")}
          >
            {props.copy.filterAll}
          </button>
          <button
            type="button"
            class={`scope-chip ${props.scope === "session" ? "active" : ""}`}
            aria-pressed={props.scope === "session"}
            onClick={() => props.onScopeChange("session")}
          >
            {props.copy.filterSession}
          </button>
          <button
            type="button"
            class={`scope-chip ${props.scope === "model" ? "active" : ""}`}
            aria-pressed={props.scope === "model"}
            onClick={() => props.onScopeChange("model")}
          >
            {props.copy.filterModel}
          </button>
          <button
            type="button"
            class={`scope-chip ${props.scope === "failure" ? "active" : ""}`}
            aria-pressed={props.scope === "failure"}
            onClick={() => props.onScopeChange("failure")}
          >
            {props.copy.filterFailure}
          </button>
        </div>
      </div>

      <Show when={props.scope !== "all"}>
        <label class="filter-select">
          <span>{props.copy.filterLabel}</span>
          <div class="filter-select-shell">
            <select
              value={currentValue()}
              onChange={(event) => handleFilterValue(event.currentTarget.value)}
            >
              <option value="" disabled selected={!currentValue()}>
                {props.scope === "session"
                  ? props.copy.sessionSelectPlaceholder
                  : props.scope === "failure"
                    ? props.copy.failureSelectPlaceholder
                    : props.copy.modelSelectPlaceholder}
              </option>
              <For each={currentOptions()}>
                {(option) => (
                  <option value={option.value} selected={option.value === currentValue()}>
                    {formatOption(option, props.scope)}
                  </option>
                )}
              </For>
            </select>
          </div>
        </label>
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
          <strong>{formatMs(props.model.avgStreamMs)}</strong>
        </div>
        <div>
          <span>{props.copy.reasoning}</span>
          <strong>{formatMs(props.model.avgReasoningMs)}</strong>
        </div>
        <div>
          <span>{props.copy.tool}</span>
          <strong>{formatMs(props.model.avgToolMs)}</strong>
        </div>
        <div>
          <span>{props.copy.postProcess}</span>
          <strong>{formatMs(props.model.avgPostProcessMs)}</strong>
        </div>
        <div>
          <span>{props.copy.total}</span>
          <strong>{formatMs(props.model.avgLatencyMs)}</strong>
        </div>
        <div>
          <span>{props.copy.p95Short}</span>
          <strong>{formatMs(props.model.p95LatencyMs)}</strong>
        </div>
      </div>
    </section>
  )
}

function FailureBreakdownSection(props: { items: FailureBreakdown[]; copy: PanelCopy }) {
  const totalFailures = () => props.items.reduce((sum, item) => sum + item.count, 0)

  return (
    <section class="panel-section">
      <div class="section-head">
        <div>
          <h2>{props.copy.failureReasons}</h2>
          <p>{props.copy.failureReasonsDescription}</p>
        </div>
        <span class="section-badge">{formatNumber(totalFailures())}</span>
      </div>

      <Show when={props.items.length > 0} fallback={<div class="empty-inline">{props.copy.noFailures}</div>}>
        <div class="failure-list">
          <For each={props.items}>
            {(item) => {
              const width = `${Math.min(100, Math.max(0, item.share))}%`
              return (
                <article class="failure-card">
                  <div class="failure-head">
                    <div>
                      <div class="failure-type">{humanizeFailureType(item.errorType)}</div>
                      <div class="failure-meta">
                        {formatNumber(item.count)} {props.copy.failureRequests}
                      </div>
                    </div>
                    <div class="failure-share">{formatPercent(item.share)}</div>
                  </div>
                  <div class="failure-bar">
                    <div class="failure-bar-fill" style={{ width }} />
                  </div>
                </article>
              )
            }}
          </For>
        </div>
      </Show>
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
          {props.copy.stream} {formatMs(props.item.streamMs)}
        </span>
        <span class="recent-pill">
          {props.copy.reasoning} {formatMs(props.item.reasoningMs)}
        </span>
        <span class="recent-pill">
          {props.copy.tool} {formatMs(props.item.toolMs)}
        </span>
        <span class="recent-pill">
          {props.copy.postProcess} {formatMs(props.item.postProcessMs)}
        </span>
        <span class="recent-pill">
          {props.copy.total} {formatMs(props.item.latencyMs)}
        </span>
        <Show when={props.item.retries > 0}>
          <span class="recent-pill recent-pill-warm">
            {props.copy.retry} {formatNumber(props.item.retries)}
          </span>
        </Show>
        <Show when={!props.item.success && props.item.errorType}>
          <span class="recent-pill recent-pill-failure-type">{humanizeFailureType(props.item.errorType ?? "unknown_error")}</span>
        </Show>
      </div>
      <Show when={!props.item.success && props.item.error}>
        <div class="recent-error">{props.item.error}</div>
      </Show>
    </li>
  )
}

function EmptyState(props: { path?: string; copy: PanelCopy; filtered: boolean; scopeLabel: string }) {
  return (
    <section class="empty-state">
      <div class="empty-title">{props.filtered ? props.copy.noResultsTitle : props.copy.emptyTitle}</div>
      <p>{props.filtered ? props.copy.noResultsBody(props.scopeLabel) : props.copy.emptyBody}</p>
      <p class="empty-path">
        {props.copy.dataFile}: <code>{props.path ?? "~/.opencode-telemetry/telemetry.jsonl"}</code>
      </p>
    </section>
  )
}

function shortValue(value: string) {
  if (value.length <= 14) return value
  return `${value.slice(0, 6)}…${value.slice(-4)}`
}

function humanizeFailureType(value: string) {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase())
    .trim()
}

export function App() {
  const [locale, setLocale] = createSignal<Locale>("en")
  const [scope, setScope] = createSignal<FilterScope>("all")
  const [sessionValue, setSessionValue] = createSignal("")
  const [modelValue, setModelValue] = createSignal("")
  const [failureValue, setFailureValue] = createSignal("")
  const [ready, setReady] = createSignal(false)

  const query = createMemo<SnapshotQuery>(() => ({
    scope: scope(),
    value:
      scope() === "session"
        ? sessionValue() || undefined
        : scope() === "model"
          ? modelValue() || undefined
          : scope() === "failure"
            ? failureValue() || undefined
            : undefined,
  }))

  const queryKey = createMemo(() => {
    const next = query()
    return [next.scope, next.value ?? ""].join(":")
  })

  const [snapshot, { refetch }] = createResource(queryKey, () => loadSnapshot(query()))
  const [telemetryPath] = createResource(loadTelemetryPath)

  onMount(() => {
    const storedLocale = window.localStorage.getItem("opencode-telemetry-locale")
    if (storedLocale === "en" || storedLocale === "zh") setLocale(storedLocale)

    const storedScope = window.localStorage.getItem("opencode-telemetry-scope")
    if (storedScope === "all" || storedScope === "session" || storedScope === "model") setScope(storedScope)

    const storedSession = window.localStorage.getItem("opencode-telemetry-session")
    if (storedSession) setSessionValue(storedSession)

    const storedModel = window.localStorage.getItem("opencode-telemetry-model")
    if (storedModel) setModelValue(storedModel)

    const storedFailure = window.localStorage.getItem("opencode-telemetry-failure")
    if (storedFailure) setFailureValue(storedFailure)

    setReady(true)

    const timer = window.setInterval(() => void refetch(), 1200)
    onCleanup(() => window.clearInterval(timer))
  })

  const copy = createMemo(() => panelCopy[locale()])
  const totalRecordCount = createMemo(() => snapshot()?.totalRecordCount ?? 0)
  const recordCount = createMemo(() => snapshot()?.recordCount ?? 0)
  const sessionOptions = createMemo(() => snapshot()?.sessionOptions ?? [])
  const modelOptions = createMemo(() => snapshot()?.modelOptions ?? [])
  const failureOptions = createMemo(() => snapshot()?.failureOptions ?? [])
  const models = createMemo(() => snapshot()?.models ?? [])
  const recent = createMemo(() => snapshot()?.recent ?? [])
  const summary = createMemo(() => snapshot()?.summary)
  const failureBreakdown = createMemo(() => snapshot()?.failureBreakdown ?? [])
  const activeSummary = createMemo(() => {
    const value = summary()
    return value && value.requests > 0 ? value : undefined
  })
  const scopeLabel = createMemo(() => {
    if (scope() === "session") return copy().filterSession
    if (scope() === "model") return copy().filterModel
    if (scope() === "failure") return copy().filterFailure
    return copy().filterAll
  })

  createEffect(() => {
    if (!ready()) return
    window.localStorage.setItem("opencode-telemetry-locale", locale())
  })

  createEffect(() => {
    if (!ready()) return
    window.localStorage.setItem("opencode-telemetry-scope", scope())
  })

  createEffect(() => {
    if (scope() !== "session") return
    const options = sessionOptions()
    const current = sessionValue()
    if (options.length && (!current || !options.some((option) => option.value === current)))
      setSessionValue(options[0].value)
  })

  createEffect(() => {
    if (scope() !== "model") return
    const options = modelOptions()
    const current = modelValue()
    if (options.length && (!current || !options.some((option) => option.value === current)))
      setModelValue(options[0].value)
  })

  createEffect(() => {
    if (scope() !== "failure") return
    const options = failureOptions()
    const current = failureValue()
    if (options.length && (!current || !options.some((option) => option.value === current)))
      setFailureValue(options[0].value)
  })

  createEffect(() => {
    if (!ready()) return
    window.localStorage.setItem("opencode-telemetry-session", sessionValue())
  })

  createEffect(() => {
    if (!ready()) return
    window.localStorage.setItem("opencode-telemetry-model", modelValue())
  })

  createEffect(() => {
    if (!ready()) return
    window.localStorage.setItem("opencode-telemetry-failure", failureValue())
  })

  const refresh = () => void refetch()
  const dragPanel = async (event: MouseEvent) => {
    if (event.button !== 0) return
    const target = event.target instanceof HTMLElement ? event.target : undefined
    if (target?.closest(".chrome-actions") || target?.closest(".filter-select") || target?.closest(".filter-segments"))
      return
    await getCurrentWindow().startDragging()
  }
  const closePanel = async () => {
    await getCurrentWindow().close()
  }
  const handleScopeChange = (nextScope: FilterScope) => {
    setScope(nextScope)
    if (nextScope === "session" && !sessionValue()) setSessionValue(sessionOptions()[0]?.value ?? "")
    if (nextScope === "model" && !modelValue()) setModelValue(modelOptions()[0]?.value ?? "")
    if (nextScope === "failure" && !failureValue()) setFailureValue(failureOptions()[0]?.value ?? "")
  }
  const toggleLocale = () => {
    setLocale((current) => (current === "en" ? "zh" : "en"))
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
        <FilterBar
          copy={copy()}
          scope={scope()}
          sessionValue={sessionValue()}
          modelValue={modelValue()}
          failureValue={failureValue()}
          sessionOptions={sessionOptions()}
          modelOptions={modelOptions()}
          failureOptions={failureOptions()}
          onScopeChange={handleScopeChange}
          onSessionChange={setSessionValue}
          onModelChange={setModelValue}
          onFailureChange={setFailureValue}
        />

        <Show
          when={activeSummary()}
          fallback={
            <EmptyState
              path={telemetryPath() ?? undefined}
              copy={copy()}
              filtered={totalRecordCount() > 0}
              scopeLabel={scopeLabel()}
            />
          }
        >
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
                  detail={copy().records(recordCount(), totalRecordCount())}
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
                  value={formatMs(data().avgStreamMs)}
                  detail={copy().streamDetail}
                  accent="#f59e0b"
                />
                <MetricCard
                  label={copy().avgReasoning}
                  value={formatMs(data().avgReasoningMs)}
                  detail={copy().reasoningDetail}
                  accent="#ef4444"
                />
                <MetricCard
                  label={copy().avgTool}
                  value={formatMs(data().avgToolMs)}
                  detail={copy().toolDetail}
                  accent="#fb7185"
                />
                <MetricCard
                  label={copy().avgPostProcess}
                  value={formatMs(data().avgPostProcessMs)}
                  detail={copy().postProcessDetail}
                  accent="#a855f7"
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

              <FailureBreakdownSection items={failureBreakdown()} copy={copy()} />

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
