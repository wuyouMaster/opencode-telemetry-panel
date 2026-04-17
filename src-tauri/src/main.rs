#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    env, fs,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::Manager;

const TELEMETRY_DIR: &str = ".opencode-telemetry";
const TELEMETRY_FILE: &str = "telemetry.jsonl";

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
#[allow(dead_code)]
struct TelemetryRecord {
    kind: String,
    session_id: String,
    message_id: String,
    provider_id: String,
    model_id: String,
    started_at: u64,
    first_token_at: Option<u64>,
    completed_at: Option<u64>,
    success: bool,
    error: Option<String>,
    retries: Option<u64>,
}

#[derive(Debug, Deserialize, Serialize, Clone, Copy, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
enum FilterScope {
    #[default]
    All,
    Session,
    Model,
}

#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct SnapshotQuery {
    scope: Option<FilterScope>,
    value: Option<String>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct FilterOption {
    value: String,
    count: usize,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct SummaryMetrics {
    requests: u64,
    successes: u64,
    failures: u64,
    retries: u64,
    success_rate: f64,
    avg_latency_ms: f64,
    avg_wait_ms: f64,
    avg_network_ms: f64,
    p95_latency_ms: f64,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ModelMetrics {
    key: String,
    provider_id: String,
    model_id: String,
    latest_at: u64,
    requests: u64,
    successes: u64,
    failures: u64,
    retries: u64,
    success_rate: f64,
    avg_latency_ms: f64,
    avg_wait_ms: f64,
    avg_network_ms: f64,
    p95_latency_ms: f64,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct RecentRequest {
    key: String,
    provider_id: String,
    model_id: String,
    finished_at: u64,
    success: bool,
    wait_ms: f64,
    network_ms: f64,
    latency_ms: f64,
    retries: u64,
    error: Option<String>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct DashboardSnapshot {
    source_path: String,
    generated_at: u64,
    record_count: usize,
    total_record_count: usize,
    filter_scope: FilterScope,
    filter_value: Option<String>,
    session_options: Vec<FilterOption>,
    model_options: Vec<FilterOption>,
    summary: SummaryMetrics,
    models: Vec<ModelMetrics>,
    recent: Vec<RecentRequest>,
}

#[derive(Debug, Clone)]
struct CompletedRequest {
    key: String,
    provider_id: String,
    model_id: String,
    finished_at: u64,
    success: bool,
    wait_ms: f64,
    network_ms: f64,
    latency_ms: f64,
    retries: u64,
    error: Option<String>,
}

fn home_dir() -> PathBuf {
    env::var_os("HOME")
        .or_else(|| env::var_os("USERPROFILE"))
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("."))
}

fn telemetry_file_path() -> PathBuf {
    home_dir().join(TELEMETRY_DIR).join(TELEMETRY_FILE)
}

fn read_records(path: &Path) -> Vec<TelemetryRecord> {
    fs::read_to_string(path)
        .ok()
        .map(|content| {
            content
                .lines()
                .filter_map(|line| serde_json::from_str::<TelemetryRecord>(line).ok())
                .filter(|record| record.kind == "request")
                .collect()
        })
        .unwrap_or_default()
}

fn record_key(record: &TelemetryRecord) -> String {
    format!("{}/{}", record.provider_id, record.model_id)
}

fn average(values: &[f64]) -> f64 {
    if values.is_empty() {
        return 0.0;
    }
    values.iter().sum::<f64>() / values.len() as f64
}

fn percentile(values: &[f64], ratio: f64) -> f64 {
    if values.is_empty() {
        return 0.0;
    }

    let mut sorted = values.to_vec();
    sorted.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));

    if sorted.len() == 1 {
        return sorted[0];
    }

    let rank = (ratio.clamp(0.0, 1.0) * (sorted.len() - 1) as f64).round() as usize;
    sorted[rank]
}

fn build_session_options(records: &[TelemetryRecord]) -> Vec<FilterOption> {
    let mut grouped: HashMap<String, (usize, u64)> = HashMap::new();

    for record in records {
        let latest = record.completed_at.unwrap_or(record.started_at);
        let entry = grouped
            .entry(record.session_id.clone())
            .or_insert((0, latest));
        entry.0 += 1;
        if latest > entry.1 {
            entry.1 = latest;
        }
    }

    let mut grouped: Vec<_> = grouped.into_iter().collect();
    grouped.sort_by(|left, right| {
        right
            .1
             .0
            .cmp(&left.1 .0)
            .then_with(|| right.1 .1.cmp(&left.1 .1))
            .then_with(|| left.0.cmp(&right.0))
    });

    grouped
        .into_iter()
        .map(|(value, (count, _))| FilterOption { value, count })
        .collect()
}

fn build_model_options(records: &[TelemetryRecord]) -> Vec<FilterOption> {
    let mut grouped: HashMap<String, (usize, u64)> = HashMap::new();

    for record in records {
        let latest = record.completed_at.unwrap_or(record.started_at);
        let entry = grouped.entry(record_key(record)).or_insert((0, latest));
        entry.0 += 1;
        if latest > entry.1 {
            entry.1 = latest;
        }
    }

    let mut grouped: Vec<_> = grouped.into_iter().collect();
    grouped.sort_by(|left, right| {
        right
            .1
             .0
            .cmp(&left.1 .0)
            .then_with(|| right.1 .1.cmp(&left.1 .1))
            .then_with(|| left.0.cmp(&right.0))
    });

    grouped
        .into_iter()
        .map(|(value, (count, _))| FilterOption { value, count })
        .collect()
}

fn matches_filter(record: &TelemetryRecord, query: &SnapshotQuery) -> bool {
    let scope = query.scope.unwrap_or_default();
    let value = query.value.as_deref().filter(|value| !value.is_empty());

    match (scope, value) {
        (FilterScope::All, _) => true,
        (FilterScope::Session, Some(value)) => record.session_id == value,
        (FilterScope::Model, Some(value)) => record_key(record) == value,
        _ => false,
    }
}

fn build_requests(records: &[&TelemetryRecord]) -> Vec<CompletedRequest> {
    records
        .iter()
        .map(|record| {
            let completed_at = record.completed_at.unwrap_or(record.started_at);
            let first_token_at = record.first_token_at.unwrap_or(completed_at);
            let wait_ms = first_token_at.saturating_sub(record.started_at) as f64;
            let network_ms = completed_at.saturating_sub(first_token_at) as f64;
            let latency_ms = completed_at.saturating_sub(record.started_at) as f64;

            CompletedRequest {
                key: record_key(record),
                provider_id: record.provider_id.clone(),
                model_id: record.model_id.clone(),
                finished_at: completed_at,
                success: record.success,
                wait_ms,
                network_ms,
                latency_ms,
                retries: record.retries.unwrap_or(0),
                error: record.error.clone(),
            }
        })
        .collect()
}

fn summarize(requests: &[CompletedRequest]) -> SummaryMetrics {
    let latencies: Vec<f64> = requests.iter().map(|request| request.latency_ms).collect();
    let waits: Vec<f64> = requests.iter().map(|request| request.wait_ms).collect();
    let networks: Vec<f64> = requests.iter().map(|request| request.network_ms).collect();
    let requests_count = requests.len() as u64;
    let successes = requests.iter().filter(|request| request.success).count() as u64;
    let retries = requests.iter().map(|request| request.retries).sum();

    SummaryMetrics {
        requests: requests_count,
        successes,
        failures: requests_count.saturating_sub(successes),
        retries,
        success_rate: if requests_count == 0 {
            0.0
        } else {
            successes as f64 * 100.0 / requests_count as f64
        },
        avg_latency_ms: average(&latencies),
        avg_wait_ms: average(&waits),
        avg_network_ms: average(&networks),
        p95_latency_ms: percentile(&latencies, 0.95),
    }
}

fn summarize_models(requests: &[CompletedRequest]) -> Vec<ModelMetrics> {
    let mut grouped: HashMap<String, Vec<&CompletedRequest>> = HashMap::new();

    for request in requests {
        grouped
            .entry(request.key.clone())
            .or_default()
            .push(request);
    }

    let mut models: Vec<ModelMetrics> = grouped
        .into_iter()
        .map(|(key, items)| {
            let latencies: Vec<f64> = items.iter().map(|request| request.latency_ms).collect();
            let waits: Vec<f64> = items.iter().map(|request| request.wait_ms).collect();
            let networks: Vec<f64> = items.iter().map(|request| request.network_ms).collect();
            let requests_count = items.len() as u64;
            let successes = items.iter().filter(|request| request.success).count() as u64;
            let retries = items.iter().map(|request| request.retries).sum();
            let latest_at = items
                .iter()
                .map(|request| request.finished_at)
                .max()
                .unwrap_or(0);
            let provider_id = items
                .first()
                .map(|request| request.provider_id.clone())
                .unwrap_or_default();
            let model_id = items
                .first()
                .map(|request| request.model_id.clone())
                .unwrap_or_default();

            ModelMetrics {
                key,
                provider_id,
                model_id,
                latest_at,
                requests: requests_count,
                successes,
                failures: requests_count.saturating_sub(successes),
                retries,
                success_rate: if requests_count == 0 {
                    0.0
                } else {
                    successes as f64 * 100.0 / requests_count as f64
                },
                avg_latency_ms: average(&latencies),
                avg_wait_ms: average(&waits),
                avg_network_ms: average(&networks),
                p95_latency_ms: percentile(&latencies, 0.95),
            }
        })
        .collect();

    models.sort_by(|left, right| {
        right
            .requests
            .cmp(&left.requests)
            .then_with(|| right.latest_at.cmp(&left.latest_at))
    });

    models
}

fn summarize_recent(requests: &[CompletedRequest]) -> Vec<RecentRequest> {
    let mut recent: Vec<RecentRequest> = requests
        .iter()
        .map(|request| RecentRequest {
            key: request.key.clone(),
            provider_id: request.provider_id.clone(),
            model_id: request.model_id.clone(),
            finished_at: request.finished_at,
            success: request.success,
            wait_ms: request.wait_ms,
            network_ms: request.network_ms,
            latency_ms: request.latency_ms,
            retries: request.retries,
            error: request.error.clone(),
        })
        .collect();

    recent.sort_by(|left, right| right.finished_at.cmp(&left.finished_at));
    recent.truncate(10);
    recent
}

#[tauri::command]
fn telemetry_path() -> String {
    telemetry_file_path().display().to_string()
}

#[tauri::command]
fn snapshot(query: Option<SnapshotQuery>) -> DashboardSnapshot {
    let path = telemetry_file_path();
    let records = read_records(&path);
    let query = query.unwrap_or_default();
    let filtered: Vec<&TelemetryRecord> = records
        .iter()
        .filter(|record| matches_filter(record, &query))
        .collect();
    let requests = build_requests(&filtered);
    let generated_at = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0);

    DashboardSnapshot {
        source_path: path.display().to_string(),
        generated_at,
        record_count: filtered.len(),
        total_record_count: records.len(),
        filter_scope: query.scope.unwrap_or_default(),
        filter_value: query.value.filter(|value| !value.is_empty()),
        session_options: build_session_options(&records),
        model_options: build_model_options(&records),
        summary: summarize(&requests),
        models: summarize_models(&requests),
        recent: summarize_recent(&requests),
    }
}

fn focus_main_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, args, cwd| {
            let _ = (args, cwd);
            focus_main_window(&app);
        }))
        .invoke_handler(tauri::generate_handler![snapshot, telemetry_path])
        .run(tauri::generate_context!())
        .expect("error while running Tauri application");
}
