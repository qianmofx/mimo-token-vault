use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::time::Instant;
use tauri::Manager;

// ── Constants: MiMo API ──────────────────────────────────────────────────

const PAYG_BASE: &str = "https://api.xiaomimimo.com/v1";
const PAYG_ANTHROPIC_BASE: &str = "https://api.xiaomimimo.com/anthropic/v1";

const TOKEN_PLAN_CLUSTERS: &[(&str, &str, &str)] = &[
    ("中国 (cn)", "https://token-plan-cn.xiaomimimo.com/v1", "https://token-plan-cn.xiaomimimo.com/anthropic/v1"),
    ("新加坡 (sgp)", "https://token-plan-sgp.xiaomimimo.com/v1", "https://token-plan-sgp.xiaomimimo.com/anthropic/v1"),
    ("欧洲 (ams)", "https://token-plan-ams.xiaomimimo.com/v1", "https://token-plan-ams.xiaomimimo.com/anthropic/v1"),
];

// ── Data Types ───────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KeyEntry {
    pub id: String,
    pub key: String,
    #[serde(rename = "keyType")]
    pub key_type: String,           // "payg" | "tokenplan" | "unknown"
    #[serde(rename = "isValid")]
    pub is_valid: Option<bool>,
    #[serde(rename = "lastChecked")]
    pub last_checked: Option<String>,
    #[serde(rename = "createdAt")]
    pub created_at: String,
    #[serde(default)]
    pub models: Vec<String>,
    #[serde(default)]
    pub cluster: String,
    #[serde(rename = "anthropicOk", default)]
    pub anthropic_ok: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VerifyResult {
    pub ok: bool,
    pub status: u16,
    #[serde(rename = "keyType")]
    pub key_type: String,
    #[serde(default)]
    pub models: Vec<String>,
    pub elapsed: f64,
    #[serde(default)]
    pub cluster: String,
    #[serde(default)]
    pub base: String,
    #[serde(default)]
    pub reason: String,
}

/// MiMo 返回的模型列表结构
#[derive(Debug, Deserialize)]
struct ModelsResponse {
    data: Vec<ModelItem>,
}

#[derive(Debug, Deserialize)]
struct ModelItem {
    id: String,
}

// ── Key Type Detection ───────────────────────────────────────────────────

fn detect_key_type(key: &str) -> &str {
    let key = key.trim();
    if key.starts_with("sk-") {
        "payg"
    } else if key.starts_with("tp-") {
        "tokenplan"
    } else {
        "unknown"
    }
}

// ── API Helpers ──────────────────────────────────────────────────────────

fn make_client() -> Result<Client, String> {
    Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| format!("创建 HTTP 客户端失败: {}", e))
}

fn extract_error(body: &str) -> String {
    serde_json::from_str::<serde_json::Value>(body)
        .ok()
        .and_then(|v| v.get("error")?.get("message")?.as_str().map(String::from))
        .unwrap_or_else(|| body.chars().take(200).collect())
}

// ── Core: Verify Key (MiMo API) ─────────────────────────────────────────

async fn verify_payg(key: &str, client: &Client) -> VerifyResult {
    let url = format!("{}/models", PAYG_BASE);
    let start = Instant::now();
    match client
        .get(&url)
        .header("api-key", key)
        .send()
        .await
    {
        Ok(resp) => {
            let elapsed = start.elapsed().as_secs_f64();
            let status = resp.status().as_u16();
            let body = resp.text().await.unwrap_or_default();
            if status == 200 {
                if let Ok(data) = serde_json::from_str::<ModelsResponse>(&body) {
                    let models: Vec<String> = data.data.into_iter().map(|m| m.id).collect();
                    return VerifyResult {
                        ok: true, status, key_type: "payg".into(),
                        models, elapsed, cluster: String::new(),
                        base: PAYG_BASE.into(), reason: String::new(),
                    };
                }
            }
            VerifyResult {
                ok: false, status, key_type: "payg".into(),
                models: vec![], elapsed, cluster: String::new(),
                base: PAYG_BASE.into(),
                reason: extract_error(&body),
            }
        }
        Err(e) => VerifyResult {
            ok: false, status: 0, key_type: "payg".into(),
            models: vec![], elapsed: 0.0, cluster: String::new(),
            base: PAYG_BASE.into(), reason: e.to_string(),
        },
    }
}

async fn verify_tokenplan(key: &str, client: &Client) -> VerifyResult {
    let mut errors: Vec<String> = Vec::new();
    for (cluster_name, v1_base, _anthro_base) in TOKEN_PLAN_CLUSTERS {
        let url = format!("{}/models", v1_base);
        let start = Instant::now();
        match client
            .get(&url)
            .header("api-key", key)
            .send()
            .await
        {
            Ok(resp) => {
                let elapsed = start.elapsed().as_secs_f64();
                let status = resp.status().as_u16();
                let body = resp.text().await.unwrap_or_default();
                if status == 200 {
                    if let Ok(data) = serde_json::from_str::<ModelsResponse>(&body) {
                        let models: Vec<String> = data.data.into_iter().map(|m| m.id).collect();
                        return VerifyResult {
                            ok: true, status, key_type: "tokenplan".into(),
                            models, elapsed, cluster: cluster_name.to_string(),
                            base: v1_base.to_string(), reason: String::new(),
                        };
                    }
                }
                errors.push(format!("[{}] HTTP {}: {}", cluster_name, status, extract_error(&body)));
            }
            Err(e) => {
                errors.push(format!("[{}] {}", cluster_name, e));
            }
        }
    }
    VerifyResult {
        ok: false, status: 0, key_type: "tokenplan".into(),
        models: vec![], elapsed: 0.0, cluster: String::new(),
        base: String::new(),
        reason: format!("所有集群均验证失败:\n{}", errors.join("\n")),
    }
}

// ── Core: Anthropic Protocol Test ────────────────────────────────────────

async fn verify_anthropic_payg(key: &str, client: &Client) -> VerifyResult {
    let url = format!("{}/messages", PAYG_ANTHROPIC_BASE);
    let payload = serde_json::json!({
        "model": "mimo-v2.5-pro",
        "max_tokens": 1,
        "messages": [{"role": "user", "content": "hi"}]
    });
    let start = Instant::now();
    match client
        .post(&url)
        .header("api-key", key)
        .header("Content-Type", "application/json")
        .json(&payload)
        .send()
        .await
    {
        Ok(resp) => {
            let elapsed = start.elapsed().as_secs_f64();
            let status = resp.status().as_u16();
            if status == 200 {
                VerifyResult {
                    ok: true, status, key_type: "payg".into(),
                    models: vec![], elapsed, cluster: String::new(),
                    base: PAYG_ANTHROPIC_BASE.into(), reason: String::new(),
                }
            } else {
                let body = resp.text().await.unwrap_or_default();
                VerifyResult {
                    ok: false, status, key_type: "payg".into(),
                    models: vec![], elapsed, cluster: String::new(),
                    base: PAYG_ANTHROPIC_BASE.into(),
                    reason: extract_error(&body),
                }
            }
        }
        Err(e) => VerifyResult {
            ok: false, status: 0, key_type: "payg".into(),
            models: vec![], elapsed: 0.0, cluster: String::new(),
            base: PAYG_ANTHROPIC_BASE.into(), reason: e.to_string(),
        },
    }
}

async fn verify_anthropic_tokenplan(key: &str, client: &Client) -> VerifyResult {
    let mut errors: Vec<String> = Vec::new();
    for (cluster_name, _v1_base, anthro_base) in TOKEN_PLAN_CLUSTERS {
        let url = format!("{}/messages", anthro_base);
        let payload = serde_json::json!({
            "model": "mimo-v2.5-pro",
            "max_tokens": 1,
            "messages": [{"role": "user", "content": "hi"}]
        });
        let start = Instant::now();
        match client
            .post(&url)
            .header("api-key", key)
            .header("Content-Type", "application/json")
            .json(&payload)
            .send()
            .await
        {
            Ok(resp) => {
                let elapsed = start.elapsed().as_secs_f64();
                let status = resp.status().as_u16();
                if status == 200 {
                    return VerifyResult {
                        ok: true, status, key_type: "tokenplan".into(),
                        models: vec![], elapsed, cluster: cluster_name.to_string(),
                        base: anthro_base.to_string(), reason: String::new(),
                    };
                }
                errors.push(format!("[{}] HTTP {}", cluster_name, status));
            }
            Err(e) => {
                errors.push(format!("[{}] {}", cluster_name, e));
            }
        }
    }
    VerifyResult {
        ok: false, status: 0, key_type: "tokenplan".into(),
        models: vec![], elapsed: 0.0, cluster: String::new(),
        base: String::new(),
        reason: format!("所有集群 Anthropic 均失败:\n{}", errors.join("\n")),
    }
}

// ── Tauri Commands ───────────────────────────────────────────────────────

#[tauri::command]
async fn verify_key(key: String) -> Result<VerifyResult, String> {
    let key_type = detect_key_type(&key);
    let client = make_client()?;

    match key_type {
        "payg" => Ok(verify_payg(&key, &client).await),
        "tokenplan" => Ok(verify_tokenplan(&key, &client).await),
        _ => Ok(VerifyResult {
            ok: false, status: 0, key_type: "unknown".into(),
            models: vec![], elapsed: 0.0, cluster: String::new(),
            base: String::new(),
            reason: "Key 格式无法识别，需要 sk- 或 tp- 开头".into(),
        }),
    }
}

#[tauri::command]
async fn verify_key_anthropic(key: String) -> Result<VerifyResult, String> {
    let key_type = detect_key_type(&key);
    let client = make_client()?;

    match key_type {
        "payg" => Ok(verify_anthropic_payg(&key, &client).await),
        "tokenplan" => Ok(verify_anthropic_tokenplan(&key, &client).await),
        _ => Ok(VerifyResult {
            ok: false, status: 0, key_type: "unknown".into(),
            models: vec![], elapsed: 0.0, cluster: String::new(),
            base: String::new(),
            reason: "Key 格式无法识别".into(),
        }),
    }
}

#[tauri::command]
async fn test_chat(
    key: String,
    base_url: String,
    model: String,
    prompt: String,
) -> Result<serde_json::Value, String> {
    let client = make_client()?;
    let url = format!("{}/chat/completions", base_url.trim_end_matches('/'));
    let payload = serde_json::json!({
        "model": model,
        "messages": [{"role": "user", "content": prompt}],
        "max_tokens": 1024,
        "stream": false,
    });
    let start = Instant::now();
    match client
        .post(&url)
        .header("api-key", &key)
        .header("Content-Type", "application/json")
        .json(&payload)
        .timeout(std::time::Duration::from_secs(30))
        .send()
        .await
    {
        Ok(resp) => {
            let elapsed = start.elapsed().as_secs_f64();
            let status = resp.status().as_u16();
            let body = resp.text().await.unwrap_or_default();
            if status == 200 {
                if let Ok(mut val) = serde_json::from_str::<serde_json::Value>(&body) {
                    if let Some(obj) = val.as_object_mut() {
                        obj.insert("elapsed".into(), serde_json::json!(elapsed));
                    }
                    return Ok(val);
                }
            }
            Ok(serde_json::json!({
                "ok": false,
                "status": status,
                "reason": extract_error(&body),
                "elapsed": elapsed,
            }))
        }
        Err(e) => Ok(serde_json::json!({
            "ok": false,
            "status": 0,
            "reason": e.to_string(),
            "elapsed": 0,
        })),
    }
}

// ── Storage Commands ─────────────────────────────────────────────────────

fn keys_path(app: &tauri::AppHandle) -> PathBuf {
    app.path()
        .app_data_dir()
        .expect("failed to get app data dir")
        .join("keys.json")
}

fn ensure_app_dir(app: &tauri::AppHandle) {
    let dir = app.path().app_data_dir().expect("failed to get app data dir");
    fs::create_dir_all(&dir).ok();
}

#[tauri::command]
fn load_keys(app: tauri::AppHandle) -> Result<Vec<KeyEntry>, String> {
    ensure_app_dir(&app);
    let path = keys_path(&app);
    if !path.exists() {
        return Ok(Vec::new());
    }
    let data = fs::read_to_string(&path).map_err(|e| format!("读取失败: {}", e))?;
    serde_json::from_str(&data).map_err(|e| format!("解析失败: {}", e))
}

#[tauri::command]
fn save_keys(app: tauri::AppHandle, keys: Vec<KeyEntry>) -> Result<(), String> {
    ensure_app_dir(&app);
    let path = keys_path(&app);
    let data = serde_json::to_string_pretty(&keys).map_err(|e| format!("序列化失败: {}", e))?;
    fs::write(&path, data).map_err(|e| format!("写入失败: {}", e))
}

#[tauri::command]
fn clear_keys(app: tauri::AppHandle) -> Result<(), String> {
    let path = keys_path(&app);
    if path.exists() {
        fs::remove_file(&path).map_err(|e| format!("删除失败: {}", e))?;
    }
    Ok(())
}

// ── App Entry ────────────────────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            verify_key,
            verify_key_anthropic,
            test_chat,
            load_keys,
            save_keys,
            clear_keys,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
