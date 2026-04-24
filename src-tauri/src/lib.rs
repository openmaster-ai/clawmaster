use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::io::{ErrorKind, Write};
use std::net::{SocketAddr, TcpStream};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::Manager;

const CMD_ERR_PREFIX: &str = "CLAWMASTER_ERR:";
const MODELS_DEV_CACHE_MAX_AGE_MS: u64 = 24 * 60 * 60 * 1000;
static RUNTIME_TEMP_DIR_COUNTER: AtomicU64 = AtomicU64::new(0);
const SKILLGUARD_SCAN_ROOTS: &[&str] = &[
    ".openclaw/skills",
    ".openclaw/workspace/skills",
    ".agents/skills",
    ".codex/skills",
    ".config/openclaw/skills",
];

fn cmd_err(code: &'static str) -> String {
    format!("{}{}", CMD_ERR_PREFIX, serde_json::json!({ "code": code }))
}

fn cmd_err_p(code: &'static str, params: serde_json::Value) -> String {
    format!(
        "{}{}",
        CMD_ERR_PREFIX,
        serde_json::json!({ "code": code, "params": params })
    )
}

fn shorten_chars(s: &str, max_chars: usize) -> String {
    let mut it = s.chars();
    let head: String = it.by_ref().take(max_chars).collect();
    if it.next().is_some() {
        format!("{}…", head)
    } else {
        head
    }
}

fn cmd_err_d(code: &'static str, detail: impl std::fmt::Display) -> String {
    let detail = shorten_chars(&detail.to_string(), 4000);
    cmd_err_p(code, serde_json::json!({ "detail": detail }))
}

fn cmd_err_stderr(code: &'static str, stderr: &str) -> String {
    let t = shorten_chars(stderr.trim(), 2000);
    cmd_err_p(code, serde_json::json!({ "stderr": t }))
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SystemInfo {
    pub nodejs: NodejsInfo,
    pub npm: NpmInfo,
    pub openclaw: OpenClawInfo,
    pub storage: LocalDataInfo,
    pub runtime: RuntimeInfo,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NodejsInfo {
    pub installed: bool,
    pub version: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NpmInfo {
    pub installed: bool,
    pub version: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenClawInfo {
    pub installed: bool,
    pub version: String,
    pub config_path: String,
    pub data_dir: String,
    pub path_source: String,
    pub profile_mode: String,
    pub profile_name: Option<String>,
    pub override_active: bool,
    pub config_path_candidates: Vec<String>,
    pub existing_config_paths: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeDistroInfo {
    pub name: String,
    pub state: String,
    pub version: Option<u8>,
    pub is_default: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub has_openclaw: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub openclaw_version: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeInfo {
    pub mode: String,
    pub host_platform: String,
    pub wsl_available: bool,
    pub selected_distro: Option<String>,
    pub selected_distro_exists: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub backend_port: Option<u16>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub auto_start_backend: Option<bool>,
    pub distros: Vec<RuntimeDistroInfo>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalDataInfo {
    pub state: String,
    pub engine: String,
    pub runtime_target: String,
    pub profile_key: String,
    pub data_root: Option<String>,
    pub engine_root: Option<String>,
    pub node_requirement: String,
    pub supports_embedded: bool,
    pub target_platform: String,
    pub target_arch: String,
    pub reason_code: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GatewayStatus {
    pub running: bool,
    pub port: u16,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OpenClawConfig {
    #[serde(flatten)]
    pub data: serde_json::Value,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DoctorFixDto {
    pub ok: bool,
    pub code: i32,
    pub stdout: String,
    pub stderr: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GatewayStartBootstrapDto {
    pub ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BootstrapAfterInstallDto {
    pub doctor_fix: DoctorFixDto,
    pub gateway_start: GatewayStartBootstrapDto,
}

static OPENCLAW_EXE: OnceLock<PathBuf> = OnceLock::new();
static CLAWPROBE_EXE: OnceLock<PathBuf> = OnceLock::new();
static SYSTEM_CMD_EXE: OnceLock<Mutex<HashMap<String, PathBuf>>> = OnceLock::new();
const DEFAULT_NPM_PROXY_REGISTRY_URL: &str = "https://registry.npmmirror.com";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
struct OpenclawProfileSelection {
    kind: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct ClawmasterSettings {
    #[serde(skip_serializing_if = "Option::is_none")]
    openclaw_profile: Option<OpenclawProfileSelection>,
    #[serde(skip_serializing_if = "Option::is_none")]
    runtime: Option<ClawmasterRuntimeSelection>,
    #[serde(skip_serializing_if = "Option::is_none")]
    npm_proxy: Option<ClawmasterNpmProxySelection>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
struct ClawmasterRuntimeSelection {
    mode: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    wsl_distro: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    backend_port: Option<u16>,
    #[serde(skip_serializing_if = "Option::is_none")]
    auto_start_backend: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
struct ClawmasterNpmProxySelection {
    enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ClawmasterNpmProxyInfo {
    enabled: bool,
    registry_url: Option<String>,
}

#[derive(Debug, Clone)]
struct OpenclawConfigResolution {
    config_path: PathBuf,
    data_dir: PathBuf,
    source: String,
    profile_selection: OpenclawProfileSelection,
    override_active: bool,
    config_path_candidates: Vec<PathBuf>,
    existing_config_paths: Vec<PathBuf>,
}

/// GUI processes (especially when launched from Finder on macOS) often lack nvm/fnm global bins in PATH,
/// so `openclaw` may differ from Terminal or be missing. Resolve via login shell `command -v openclaw`.
fn openclaw_executable_path() -> PathBuf {
    if let Some(override_path) = std::env::var_os("CLAWMASTER_OPENCLAW_BIN") {
        let path = PathBuf::from(override_path);
        if path.exists() {
            return path;
        }
    }

    OPENCLAW_EXE
        .get_or_init(|| {
            try_resolve_openclaw_via_login_shell().unwrap_or_else(|| PathBuf::from("openclaw"))
        })
        .clone()
}

fn clawmaster_settings_path() -> PathBuf {
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".clawmaster")
        .join("settings.json")
}

fn read_clawmaster_settings() -> ClawmasterSettings {
    let path = clawmaster_settings_path();
    let Ok(raw) = fs::read_to_string(path) else {
        return ClawmasterSettings::default();
    };
    serde_json::from_str(&raw).unwrap_or_default()
}

fn write_clawmaster_settings(settings: &ClawmasterSettings) -> Result<(), String> {
    let path = clawmaster_settings_path();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| cmd_err_d("CLAWMASTER_SETTINGS_MKDIR_FAILED", e))?;
    }
    let raw = serde_json::to_string_pretty(settings)
        .map_err(|e| cmd_err_d("CLAWMASTER_SETTINGS_SERIALIZE_FAILED", e))?;
    fs::write(path, format!("{raw}\n"))
        .map_err(|e| cmd_err_d("CLAWMASTER_SETTINGS_WRITE_FAILED", e))?;
    Ok(())
}

fn normalize_clawmaster_runtime_selection(
    mode: Option<String>,
    wsl_distro: Option<String>,
    backend_port: Option<u16>,
    auto_start_backend: Option<bool>,
) -> ClawmasterRuntimeSelection {
    let normalized_mode = if matches!(mode.as_deref(), Some("wsl2")) {
        "wsl2".to_string()
    } else {
        "native".to_string()
    };
    ClawmasterRuntimeSelection {
        mode: normalized_mode.clone(),
        wsl_distro: if normalized_mode == "wsl2" {
            wsl_distro
                .map(|value| value.trim().to_string())
                .filter(|value| !value.is_empty())
        } else {
            None
        },
        backend_port,
        auto_start_backend,
    }
}

fn get_clawmaster_runtime_selection() -> ClawmasterRuntimeSelection {
    let settings = read_clawmaster_settings();
    normalize_clawmaster_runtime_selection(
        settings.runtime.as_ref().map(|item| item.mode.clone()),
        settings
            .runtime
            .as_ref()
            .and_then(|item| item.wsl_distro.clone()),
        settings.runtime.as_ref().and_then(|item| item.backend_port),
        settings
            .runtime
            .as_ref()
            .and_then(|item| item.auto_start_backend),
    )
}

fn set_clawmaster_runtime_selection(
    mode: Option<String>,
    wsl_distro: Option<String>,
    backend_port: Option<u16>,
    auto_start_backend: Option<bool>,
) -> Result<ClawmasterRuntimeSelection, String> {
    let normalized =
        normalize_clawmaster_runtime_selection(mode, wsl_distro, backend_port, auto_start_backend);
    let mut settings = read_clawmaster_settings();
    if normalized.mode == "native"
        && normalized.wsl_distro.is_none()
        && normalized.backend_port.is_none()
        && normalized.auto_start_backend.is_none()
    {
        settings.runtime = None;
    } else {
        settings.runtime = Some(normalized.clone());
    }
    write_clawmaster_settings(&settings)?;
    Ok(normalized)
}

fn normalize_clawmaster_npm_proxy_selection(enabled: Option<bool>) -> ClawmasterNpmProxySelection {
    ClawmasterNpmProxySelection {
        enabled: enabled.unwrap_or(false),
    }
}

fn get_clawmaster_npm_proxy_selection() -> ClawmasterNpmProxySelection {
    let settings = read_clawmaster_settings();
    normalize_clawmaster_npm_proxy_selection(settings.npm_proxy.as_ref().map(|item| item.enabled))
}

fn set_clawmaster_npm_proxy_selection(
    enabled: Option<bool>,
) -> Result<ClawmasterNpmProxySelection, String> {
    let normalized = normalize_clawmaster_npm_proxy_selection(enabled);
    let mut settings = read_clawmaster_settings();
    if normalized.enabled {
        settings.npm_proxy = Some(normalized.clone());
    } else {
        settings.npm_proxy = None;
    }
    write_clawmaster_settings(&settings)?;
    Ok(normalized)
}

fn get_clawmaster_npm_proxy_registry_url() -> Option<String> {
    if get_clawmaster_npm_proxy_selection().enabled {
        Some(DEFAULT_NPM_PROXY_REGISTRY_URL.to_string())
    } else {
        None
    }
}

fn clawmaster_npm_proxy_info_from_selection(
    selection: ClawmasterNpmProxySelection,
) -> ClawmasterNpmProxyInfo {
    ClawmasterNpmProxyInfo {
        enabled: selection.enabled,
        registry_url: if selection.enabled {
            Some(DEFAULT_NPM_PROXY_REGISTRY_URL.to_string())
        } else {
            None
        },
    }
}

fn should_apply_npm_registry_proxy(args: &[String]) -> bool {
    let Some(subcommand) = args.first().map(|item| item.trim().to_ascii_lowercase()) else {
        return false;
    };
    if subcommand != "install" && subcommand != "i" {
        return false;
    }
    !args
        .iter()
        .any(|arg| arg == "--registry" || arg.starts_with("--registry="))
}

fn with_configured_npm_registry_args(args: &[String]) -> Vec<String> {
    let mut normalized = args.to_vec();
    let Some(registry_url) = get_clawmaster_npm_proxy_registry_url() else {
        return normalized;
    };
    if !should_apply_npm_registry_proxy(&normalized) {
        return normalized;
    }
    normalized.push("--registry".to_string());
    normalized.push(registry_url);
    normalized
}

fn sanitize_profile_name(input: &str) -> Result<String, String> {
    let trimmed = input.trim();
    if trimmed.is_empty() {
        return Err("Profile name is required".to_string());
    }
    if trimmed == "default" {
        return Err(
            "Use the default profile option instead of the reserved name \"default\"".to_string(),
        );
    }
    if !trimmed
        .chars()
        .all(|ch| ch.is_ascii_alphanumeric() || ch == '.' || ch == '_' || ch == '-')
    {
        return Err(
            "Profile name may only contain letters, numbers, dot, underscore, and hyphen"
                .to_string(),
        );
    }
    Ok(trimmed.to_string())
}

fn normalize_openclaw_profile_selection(
    kind: Option<String>,
    name: Option<String>,
) -> Result<OpenclawProfileSelection, String> {
    match kind.as_deref() {
        None | Some("default") => Ok(OpenclawProfileSelection {
            kind: "default".to_string(),
            name: None,
        }),
        Some("dev") => Ok(OpenclawProfileSelection {
            kind: "dev".to_string(),
            name: None,
        }),
        Some("named") => Ok(OpenclawProfileSelection {
            kind: "named".to_string(),
            name: Some(sanitize_profile_name(name.as_deref().unwrap_or_default())?),
        }),
        _ => Err("Unsupported OpenClaw profile kind".to_string()),
    }
}

fn get_openclaw_profile_selection() -> OpenclawProfileSelection {
    let settings = read_clawmaster_settings();
    normalize_openclaw_profile_selection(
        settings
            .openclaw_profile
            .as_ref()
            .map(|item| item.kind.clone()),
        settings
            .openclaw_profile
            .as_ref()
            .and_then(|item| item.name.clone()),
    )
    .unwrap_or(OpenclawProfileSelection {
        kind: "default".to_string(),
        name: None,
    })
}

fn set_openclaw_profile_selection(
    kind: Option<String>,
    name: Option<String>,
) -> Result<OpenclawProfileSelection, String> {
    let normalized = normalize_openclaw_profile_selection(kind, name)?;
    let mut settings = read_clawmaster_settings();
    if normalized.kind == "default" {
        settings.openclaw_profile = None;
    } else {
        settings.openclaw_profile = Some(normalized.clone());
    }
    write_clawmaster_settings(&settings)?;
    Ok(normalized)
}

fn clear_openclaw_profile_selection() -> Result<(), String> {
    let mut settings = read_clawmaster_settings();
    settings.openclaw_profile = None;
    write_clawmaster_settings(&settings)
}

fn get_openclaw_profile_args(selection: &OpenclawProfileSelection) -> Vec<String> {
    match selection.kind.as_str() {
        "dev" => vec!["--dev".to_string()],
        "named" => selection
            .name
            .as_ref()
            .map(|name| vec!["--profile".to_string(), name.clone()])
            .unwrap_or_default(),
        _ => vec![],
    }
}

fn get_openclaw_profile_data_dir(
    selection: &OpenclawProfileSelection,
    home_dir: &Path,
) -> Option<PathBuf> {
    match selection.kind.as_str() {
        "dev" => Some(home_dir.join(".openclaw-dev")),
        "named" => selection
            .name
            .as_ref()
            .map(|name| home_dir.join(format!(".openclaw-{name}"))),
        _ => None,
    }
}

fn normalize_openclaw_profile_seed(
    mode: Option<String>,
    source_path: Option<String>,
) -> Result<(String, Option<String>), String> {
    match mode.as_deref() {
        None | Some("empty") => Ok(("empty".to_string(), None)),
        Some("clone-current") => Ok(("clone-current".to_string(), None)),
        Some("import-config") => Ok((
            "import-config".to_string(),
            Some(source_path.unwrap_or_default().trim().to_string()),
        )),
        _ => Err("Unsupported OpenClaw profile seed mode".to_string()),
    }
}

fn resolve_openclaw_profile_seed_source_path(
    seed_mode: &str,
    seed_path: Option<&str>,
) -> Result<Option<PathBuf>, String> {
    match seed_mode {
        "empty" => Ok(None),
        "clone-current" => {
            let source_path = get_config_path();
            if !source_path.exists() {
                return Err(
                    "Current OpenClaw config does not exist, so there is nothing to clone yet"
                        .to_string(),
                );
            }
            Ok(Some(source_path))
        }
        "import-config" => {
            let source = seed_path.unwrap_or_default().trim();
            if source.is_empty() {
                return Err("Enter an OpenClaw config path before importing".to_string());
            }
            let source_path = expand_home_path(source);
            if !source_path.exists() {
                return Err("Imported OpenClaw config path does not exist".to_string());
            }
            if !source_path.is_file() {
                return Err("Imported OpenClaw config path must point to a file".to_string());
            }
            Ok(Some(source_path))
        }
        _ => Err("Unsupported OpenClaw profile seed mode".to_string()),
    }
}

fn seed_named_openclaw_profile_config(
    selection: &OpenclawProfileSelection,
    seed_mode: &str,
    seed_path: Option<&str>,
) -> Result<(), String> {
    if selection.kind != "named" || seed_mode == "empty" {
        return Ok(());
    }

    #[cfg(target_os = "windows")]
    if let Some(distro) = active_wsl_distro() {
        let wsl_home = get_wsl_home_dir(&distro);
        let target_dir = get_openclaw_profile_data_dir_posix(selection, &wsl_home)
            .ok_or_else(|| "Named OpenClaw profile target could not be resolved".to_string())?;
        let target_config_path = join_posix(&target_dir, "openclaw.json");
        if wsl_file_exists(&distro, &target_config_path) {
            return Err(
                "Target named profile already has an OpenClaw config. Choose a new profile name or switch directly."
                    .to_string(),
            );
        }

        let raw = match seed_mode {
            "clone-current" => {
                read_active_openclaw_text_file(&get_config_path())?.ok_or_else(|| {
                    "Current OpenClaw config does not exist, so there is nothing to clone yet"
                        .to_string()
                })?
            }
            "import-config" => {
                let source = seed_path.unwrap_or_default().trim();
                if source.is_empty() {
                    return Err("Enter an OpenClaw config path before importing".to_string());
                }
                let source_path = expand_home_path(source);
                if !source_path.exists() {
                    return Err("Imported OpenClaw config path does not exist".to_string());
                }
                if !source_path.is_file() {
                    return Err("Imported OpenClaw config path must point to a file".to_string());
                }
                fs::read_to_string(&source_path)
                    .map_err(|e| cmd_err_d("PROFILE_SEED_READ_FAILED", e))?
            }
            _ => return Err("Unsupported OpenClaw profile seed mode".to_string()),
        };
        let parsed: serde_json::Value = serde_json::from_str(&raw)
            .map_err(|_| "Imported OpenClaw config must be valid JSON".to_string())?;
        let content = serde_json::to_string_pretty(&parsed)
            .map_err(|e| cmd_err_d("PROFILE_SEED_SERIALIZE_FAILED", e))?;
        write_text_file_in_wsl(&distro, &target_config_path, &format!("{content}\n"))?;
        return Ok(());
    }

    let home_dir = dirs::home_dir().unwrap_or_else(|| PathBuf::from("."));
    let target_dir = get_openclaw_profile_data_dir(selection, &home_dir)
        .ok_or_else(|| "Named OpenClaw profile target could not be resolved".to_string())?;
    let target_config_path = target_dir.join("openclaw.json");
    if target_config_path.exists() {
        return Err(
            "Target named profile already has an OpenClaw config. Choose a new profile name or switch directly."
                .to_string(),
        );
    }

    let source_path = resolve_openclaw_profile_seed_source_path(seed_mode, seed_path)?
        .ok_or_else(|| "OpenClaw profile seed source was not resolved".to_string())?;
    let raw =
        fs::read_to_string(&source_path).map_err(|e| cmd_err_d("PROFILE_SEED_READ_FAILED", e))?;
    let parsed: serde_json::Value = serde_json::from_str(&raw)
        .map_err(|_| "Imported OpenClaw config must be valid JSON".to_string())?;

    fs::create_dir_all(&target_dir).map_err(|e| cmd_err_d("PROFILE_SEED_MKDIR_FAILED", e))?;
    let content = serde_json::to_string_pretty(&parsed)
        .map_err(|e| cmd_err_d("PROFILE_SEED_SERIALIZE_FAILED", e))?;
    fs::write(&target_config_path, format!("{content}\n"))
        .map_err(|e| cmd_err_d("PROFILE_SEED_WRITE_FAILED", e))?;
    Ok(())
}

#[cfg(target_os = "windows")]
fn active_wsl_distro() -> Option<String> {
    let runtime = get_clawmaster_runtime_selection();
    if should_use_wsl_runtime(&runtime) {
        resolve_selected_wsl_distro(&runtime)
    } else {
        None
    }
}

fn openclaw_cmd() -> Command {
    #[cfg(target_os = "windows")]
    if let Some(distro) = active_wsl_distro() {
        let mut c = Command::new("wsl.exe");
        c.stdin(Stdio::null());
        c.args(["-d", &distro, "--", "openclaw"]);
        for arg in get_openclaw_profile_args(&get_openclaw_profile_selection()) {
            c.arg(arg);
        }
        return c;
    }

    let mut c = Command::new(openclaw_executable_path());
    c.stdin(Stdio::null());
    for arg in get_openclaw_profile_args(&get_openclaw_profile_selection()) {
        c.arg(arg);
    }
    c
}

fn clawprobe_executable_path() -> PathBuf {
    CLAWPROBE_EXE
        .get_or_init(|| {
            try_resolve_clawprobe_via_login_shell().unwrap_or_else(|| PathBuf::from("clawprobe"))
        })
        .clone()
}

fn clawprobe_cmd() -> Command {
    #[cfg(target_os = "windows")]
    if let Some(distro) = active_wsl_distro() {
        let mut c = Command::new("wsl.exe");
        c.args(["-d", &distro, "--", "clawprobe"]);
        return c;
    }

    Command::new(clawprobe_executable_path())
}

fn try_resolve_clawprobe_via_login_shell() -> Option<PathBuf> {
    #[cfg(target_os = "windows")]
    {
        let output = Command::new("cmd")
            .args(["/C", "where clawprobe"])
            .output()
            .ok()?;
        if !output.status.success() {
            return None;
        }
        let out = String::from_utf8_lossy(&output.stdout).to_string();
        let line = out.lines().next()?.trim();
        if line.is_empty() {
            return None;
        }
        let p = PathBuf::from(line);
        return if p.exists() { Some(p) } else { None };
    }
    #[cfg(not(target_os = "windows"))]
    {
        let (shell, shell_args): (&str, &[&str]) = if cfg!(target_os = "macos") {
            ("/bin/zsh", &["-ilc", "command -v clawprobe"])
        } else {
            ("/bin/bash", &["--login", "-c", "command -v clawprobe"])
        };
        let output = Command::new(shell).args(shell_args).output().ok()?;
        if !output.status.success() {
            return None;
        }
        let out = String::from_utf8_lossy(&output.stdout).to_string();
        let line = out.lines().next()?.trim();
        if line.is_empty() {
            return None;
        }
        let p = PathBuf::from(line);
        if p.exists() {
            Some(p)
        } else {
            None
        }
    }
}

fn try_resolve_openclaw_via_login_shell() -> Option<PathBuf> {
    #[cfg(target_os = "windows")]
    {
        let output = Command::new("cmd")
            .args(["/C", "where openclaw"])
            .output()
            .ok()?;
        if !output.status.success() {
            return None;
        }
        let out = String::from_utf8_lossy(&output.stdout).to_string();
        let line = out.lines().next()?.trim();
        if line.is_empty() {
            return None;
        }
        let p = PathBuf::from(line);
        return if p.exists() { Some(p) } else { None };
    }
    #[cfg(not(target_os = "windows"))]
    {
        let (shell, shell_args): (&str, &[&str]) = if cfg!(target_os = "macos") {
            ("/bin/zsh", &["-ilc", "command -v openclaw"])
        } else {
            ("/bin/bash", &["--login", "-c", "command -v openclaw"])
        };
        let output = Command::new(shell).args(shell_args).output().ok()?;
        if !output.status.success() {
            return None;
        }
        let out = String::from_utf8_lossy(&output.stdout).to_string();
        let line = out.lines().next()?.trim();
        if line.is_empty() {
            return None;
        }
        let p = PathBuf::from(line);
        if p.exists() {
            Some(p)
        } else {
            None
        }
    }
}

fn normalize_login_shell_which_line(line: &str) -> Option<String> {
    let s = line.trim().lines().next()?.trim();
    if s.is_empty() {
        return None;
    }
    let alias_prefix = "alias ";
    let mut v = if let Some(rest) = s.strip_prefix(alias_prefix) {
        let (_, rhs) = rest.split_once('=')?;
        rhs.trim().to_string()
    } else {
        s.to_string()
    };
    if (v.starts_with('"') && v.ends_with('"')) || (v.starts_with('\'') && v.ends_with('\'')) {
        v = v[1..v.len() - 1].to_string();
    }
    if v.is_empty() {
        return None;
    }
    if v.contains(char::is_whitespace) && !Path::new(&v).is_absolute() {
        return None;
    }
    Some(v)
}

fn try_resolve_system_command_via_login_shell(cmd: &str) -> Option<PathBuf> {
    #[cfg(target_os = "windows")]
    {
        let output = Command::new("cmd")
            .args(["/C", &format!("where {cmd}")])
            .output()
            .ok()?;
        if !output.status.success() {
            return None;
        }
        let out = String::from_utf8_lossy(&output.stdout);
        let line = out.lines().next()?.trim();
        if line.is_empty() {
            return None;
        }
        let p = PathBuf::from(line);
        return if p.exists() { Some(p) } else { None };
    }
    #[cfg(not(target_os = "windows"))]
    {
        let (shell, shell_args): (&str, Vec<String>) = if cfg!(target_os = "macos") {
            (
                "/bin/zsh",
                vec!["-ilc".to_string(), format!("command -v {cmd}")],
            )
        } else {
            (
                "/bin/bash",
                vec![
                    "--login".to_string(),
                    "-c".to_string(),
                    format!("command -v {cmd}"),
                ],
            )
        };
        let output = Command::new(shell).args(&shell_args).output().ok()?;
        if !output.status.success() {
            return None;
        }
        let out = String::from_utf8_lossy(&output.stdout);
        let normalized = normalize_login_shell_which_line(&out)?;
        let p = PathBuf::from(normalized);
        if p.exists() {
            Some(p)
        } else {
            None
        }
    }
}

fn resolve_system_command_path(cmd: &str) -> PathBuf {
    let cache = SYSTEM_CMD_EXE.get_or_init(|| Mutex::new(HashMap::new()));
    if let Ok(guard) = cache.lock() {
        if let Some(p) = guard.get(cmd) {
            return p.clone();
        }
    }

    let resolved = if cmd == "bash" {
        resolve_bash_command_path()
    } else {
        try_resolve_system_command_via_login_shell(cmd).unwrap_or_else(|| PathBuf::from(cmd))
    };

    if let Ok(mut guard) = cache.lock() {
        guard.insert(cmd.to_string(), resolved.clone());
    }
    resolved
}

#[cfg(not(target_os = "macos"))]
const OLLAMA_USER_LOCAL_INSTALL_SCRIPT: &str = concat!(
    "set -e && ",
    "mkdir -p ~/.local/bin ~/.local/lib/ollama && ",
    "ARCH=$(uname -m) && ",
    "case $ARCH in x86_64) ARCH=amd64;; aarch64|arm64) ARCH=arm64;; esac && ",
    "LATEST=$(curl -fsSI https://github.com/ollama/ollama/releases/latest 2>/dev/null | grep -i '^location:' | sed 's|.*/tag/||' | tr -d '\\r\\n') && ",
    "URL=\"https://github.com/ollama/ollama/releases/download/${LATEST}/ollama-linux-${ARCH}.tar.zst\" && ",
    "echo \"Downloading ${URL}...\" && ",
    "curl -fsSL \"${URL}\" | zstd -d | tar x -C ~/.local 2>&1 && ",
    "chmod +x ~/.local/bin/ollama && ",
    "echo \"Installed ollama ${LATEST} to ~/.local/bin/ollama\""
);

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct OllamaInstallationInfo {
    installed: bool,
    version: Option<String>,
}

fn normalize_ollama_version(raw: &str) -> String {
    raw.trim()
        .trim_start_matches("ollama version ")
        .trim()
        .to_string()
}

fn host_ollama_candidates() -> Vec<PathBuf> {
    let mut candidates = vec![resolve_system_command_path("ollama")];
    if let Some(home_dir) = dirs::home_dir() {
        let local_bin = home_dir
            .join(".local")
            .join("bin")
            .join(if cfg!(target_os = "windows") {
                "ollama.exe"
            } else {
                "ollama"
            });
        if !candidates.iter().any(|candidate| candidate == &local_bin) {
            candidates.push(local_bin);
        }
    }
    candidates
}

fn resolve_ollama_installation_host() -> Result<(PathBuf, String), String> {
    for candidate in host_ollama_candidates() {
        let output = Command::new(&candidate)
            .arg("--version")
            .output()
            .map_err(|e| cmd_err_d("OLLAMA_CMD_SPAWN_FAILED", e));
        let Ok(output) = output else {
            continue;
        };
        if output.status.success() {
            return Ok((
                candidate,
                normalize_ollama_version(&String::from_utf8_lossy(&output.stdout)),
            ));
        }
    }
    Err(cmd_err("OLLAMA_NOT_FOUND"))
}

fn run_host_command_with_input(
    program: &str,
    args: &[&str],
    input: &str,
) -> Result<std::process::Output, String> {
    let mut child = Command::new(program)
        .args(args)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| cmd_err_d("OLLAMA_CMD_SPAWN_FAILED", e))?;

    if let Some(mut stdin) = child.stdin.take() {
        stdin
            .write_all(input.as_bytes())
            .map_err(|e| cmd_err_d("OLLAMA_CMD_STDIN_WRITE_FAILED", e))?;
    }

    child
        .wait_with_output()
        .map_err(|e| cmd_err_d("OLLAMA_CMD_WAIT_FAILED", e))
}

fn download_text_via_curl(url: &str) -> Result<String, String> {
    let output = Command::new(resolve_system_command_path("curl"))
        .args(["-fsSL", url])
        .output()
        .map_err(|e| cmd_err_d("OLLAMA_INSTALL_DOWNLOAD_FAILED", e))?;
    if !output.status.success() {
        return Err(cmd_err_stderr(
            "OLLAMA_INSTALL_DOWNLOAD_FAILED",
            &String::from_utf8_lossy(&output.stderr),
        ));
    }
    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

#[cfg(target_os = "windows")]
fn download_file_via_curl(url: &str, target: &Path) -> Result<(), String> {
    let output = Command::new(resolve_system_command_path("curl"))
        .args(["-fsSL", "-o"])
        .arg(target)
        .arg(url)
        .output()
        .map_err(|e| cmd_err_d("OLLAMA_INSTALL_DOWNLOAD_FAILED", e))?;
    if output.status.success() {
        Ok(())
    } else {
        Err(cmd_err_stderr(
            "OLLAMA_INSTALL_DOWNLOAD_FAILED",
            &String::from_utf8_lossy(&output.stderr),
        ))
    }
}

#[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
fn run_host_ollama_fallback_install() -> Result<String, String> {
    let output = Command::new(resolve_bash_command_path())
        .args(["-lc", OLLAMA_USER_LOCAL_INSTALL_SCRIPT])
        .output()
        .map_err(|e| cmd_err_d("OLLAMA_CMD_SPAWN_FAILED", e))?;
    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
    } else {
        Err(cmd_err_stderr(
            "OLLAMA_INSTALL_FAILED",
            &String::from_utf8_lossy(&output.stderr),
        ))
    }
}

fn join_posix(base: &str, child: &str) -> String {
    let normalized_base = base.trim_end_matches('/');
    if normalized_base.is_empty() {
        format!("/{child}")
    } else {
        format!("{normalized_base}/{child}")
    }
}

#[cfg(target_os = "windows")]
fn dirname_posix(path: &str) -> String {
    let trimmed = path.trim_end_matches('/');
    match trimmed.rsplit_once('/') {
        Some((parent, _)) if !parent.is_empty() => parent.to_string(),
        _ => "/".to_string(),
    }
}

#[cfg(target_os = "windows")]
fn get_openclaw_profile_data_dir_posix(
    selection: &OpenclawProfileSelection,
    home_dir: &str,
) -> Option<String> {
    match selection.kind.as_str() {
        "dev" => Some(join_posix(home_dir, ".openclaw-dev")),
        "named" => selection
            .name
            .as_ref()
            .map(|name| join_posix(home_dir, &format!(".openclaw-{name}"))),
        _ => None,
    }
}

#[derive(Debug, Clone)]
#[cfg(target_os = "windows")]
struct WslExecOutput {
    code: i32,
    stdout: String,
    stderr: String,
}

#[cfg(target_os = "windows")]
fn shell_escape_posix_arg(value: &str) -> String {
    format!("'{}'", value.replace('\'', "'\"'\"'"))
}

#[cfg(any(target_os = "windows", test))]
fn parse_wsl_list_verbose(stdout: &str) -> Vec<RuntimeDistroInfo> {
    stdout
        .lines()
        .map(|line| line.trim_end_matches('\r').trim_start_matches('\u{feff}'))
        .filter(|line| !line.trim().is_empty())
        .filter(|line| !line.trim_start().to_ascii_uppercase().starts_with("NAME"))
        .filter_map(|line| {
            let Ok(pattern) = regex_like_parse_wsl_line(line) else {
                return None;
            };
            Some(pattern)
        })
        .collect()
}

#[cfg(any(target_os = "windows", test))]
fn regex_like_parse_wsl_line(line: &str) -> Result<RuntimeDistroInfo, ()> {
    let mut chars = line.chars().peekable();
    let mut is_default = false;
    while matches!(chars.peek(), Some(ch) if ch.is_whitespace()) {
        chars.next();
    }
    if matches!(chars.peek(), Some('*')) {
        is_default = true;
        chars.next();
    }
    while matches!(chars.peek(), Some(ch) if ch.is_whitespace()) {
        chars.next();
    }
    let remaining: String = chars.collect();
    let columns = remaining
        .split("  ")
        .map(str::trim)
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>();
    if columns.len() < 3 {
        return Err(());
    }
    let version = columns.last().and_then(|value| value.parse::<u8>().ok());
    let state = columns
        .get(columns.len().saturating_sub(2))
        .map(|value| (*value).to_string())
        .ok_or(())?;
    let name = columns[..columns.len() - 2].join(" ");
    if name.is_empty() {
        return Err(());
    }
    Ok(RuntimeDistroInfo {
        name,
        state,
        version,
        is_default,
        has_openclaw: None,
        openclaw_version: None,
    })
}

#[cfg(target_os = "windows")]
fn list_wsl_distros() -> Vec<RuntimeDistroInfo> {
    let output = Command::new("wsl.exe")
        .args(["--list", "--verbose"])
        .output();
    match output {
        Ok(output) if output.status.success() => {
            parse_wsl_list_verbose(&String::from_utf8_lossy(&output.stdout))
        }
        _ => vec![],
    }
}

#[cfg(not(target_os = "windows"))]
fn list_wsl_distros() -> Vec<RuntimeDistroInfo> {
    vec![]
}

#[cfg(target_os = "windows")]
fn resolve_selected_wsl_distro(selection: &ClawmasterRuntimeSelection) -> Option<String> {
    let distros = list_wsl_distros();
    resolve_selected_wsl_distro_from_list(&distros, selection)
}

#[cfg_attr(not(target_os = "windows"), allow(dead_code))]
fn resolve_selected_wsl_distro_from_list(
    distros: &[RuntimeDistroInfo],
    selection: &ClawmasterRuntimeSelection,
) -> Option<String> {
    if let Some(name) = selection
        .wsl_distro
        .as_ref()
        .map(|value| value.trim())
        .filter(|value| !value.is_empty())
    {
        if let Some(found) = distros.iter().find(|item| item.name == name) {
            return Some(found.name.clone());
        }
        return None;
    }
    distros
        .iter()
        .find(|item| item.is_default)
        .or_else(|| distros.first())
        .map(|item| item.name.clone())
}

#[cfg(not(target_os = "windows"))]
fn resolve_selected_wsl_distro(_selection: &ClawmasterRuntimeSelection) -> Option<String> {
    None
}

fn should_use_wsl_runtime(selection: &ClawmasterRuntimeSelection) -> bool {
    cfg!(target_os = "windows") && selection.mode == "wsl2"
}

#[cfg(target_os = "windows")]
fn exec_wsl_command(distro: &str, cmd: &str, args: &[&str]) -> Result<WslExecOutput, String> {
    let output = Command::new("wsl.exe")
        .args(["-d", distro, "--", cmd])
        .args(args)
        .output()
        .map_err(|e| cmd_err_d("WSL_COMMAND_SPAWN_FAILED", e))?;
    Ok(WslExecOutput {
        code: output.status.code().unwrap_or(-1),
        stdout: String::from_utf8_lossy(&output.stdout).to_string(),
        stderr: String::from_utf8_lossy(&output.stderr).to_string(),
    })
}

#[cfg(target_os = "windows")]
fn run_wsl_shell(
    distro: &str,
    script: &str,
    stdin_payload: Option<&str>,
) -> Result<WslExecOutput, String> {
    let mut command = Command::new("wsl.exe");
    command
        .args(["-d", distro, "--", "bash", "-lc", script])
        .stdin(if stdin_payload.is_some() {
            Stdio::piped()
        } else {
            Stdio::null()
        })
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    let mut child = command
        .spawn()
        .map_err(|e| cmd_err_d("WSL_COMMAND_SPAWN_FAILED", e))?;

    if let Some(payload) = stdin_payload {
        if let Some(mut stdin) = child.stdin.take() {
            stdin
                .write_all(payload.as_bytes())
                .map_err(|e| cmd_err_d("WSL_COMMAND_STDIN_WRITE_FAILED", e))?;
        }
    }

    let output = child
        .wait_with_output()
        .map_err(|e| cmd_err_d("WSL_COMMAND_WAIT_FAILED", e))?;
    Ok(WslExecOutput {
        code: output.status.code().unwrap_or(-1),
        stdout: String::from_utf8_lossy(&output.stdout).to_string(),
        stderr: String::from_utf8_lossy(&output.stderr).to_string(),
    })
}

#[cfg(target_os = "windows")]
fn get_wsl_home_dir(distro: &str) -> String {
    match run_wsl_shell(distro, "printf %s \"$HOME\"", None) {
        Ok(output) if output.code == 0 && !output.stdout.trim().is_empty() => {
            output.stdout.trim().to_string()
        }
        _ => "/home".to_string(),
    }
}

#[cfg(target_os = "windows")]
fn wsl_file_exists(distro: &str, path: &str) -> bool {
    run_wsl_shell(
        distro,
        &format!("[ -f {} ]", shell_escape_posix_arg(path)),
        None,
    )
    .map(|output| output.code == 0)
    .unwrap_or(false)
}

#[cfg(target_os = "windows")]
fn wsl_is_dir(distro: &str, path: &str) -> bool {
    run_wsl_shell(
        distro,
        &format!("[ -d {} ]", shell_escape_posix_arg(path)),
        None,
    )
    .map(|output| output.code == 0)
    .unwrap_or(false)
}

#[cfg(target_os = "windows")]
fn read_text_file_in_wsl(distro: &str, path: &str) -> Result<Option<String>, String> {
    let output = run_wsl_shell(
        distro,
        &format!("cat {}", shell_escape_posix_arg(path)),
        None,
    )?;
    if output.code != 0 {
        return Ok(None);
    }
    Ok(Some(output.stdout))
}

#[cfg(target_os = "windows")]
fn write_text_file_in_wsl(distro: &str, path: &str, content: &str) -> Result<(), String> {
    let parent = dirname_posix(path);
    let script = format!(
        "mkdir -p {} && cat > {}",
        shell_escape_posix_arg(&parent),
        shell_escape_posix_arg(path)
    );
    let output = run_wsl_shell(distro, &script, Some(content))?;
    if output.code == 0 {
        Ok(())
    } else {
        Err(cmd_err_d(
            "WSL_FILE_WRITE_FAILED",
            output.stderr.trim().to_string(),
        ))
    }
}

#[cfg(target_os = "windows")]
fn resolve_ollama_installation_wsl(distro: &str) -> Result<(String, String), String> {
    let mut candidates = Vec::new();
    if let Ok(output) = run_wsl_shell(distro, "command -v ollama", None) {
        let resolved = output.stdout.trim();
        if output.code == 0 && !resolved.is_empty() {
            candidates.push(resolved.to_string());
        }
    }
    let local_bin = format!(
        "{}/.local/bin/ollama",
        get_wsl_home_dir(distro).trim_end_matches('/')
    );
    if !candidates.iter().any(|candidate| candidate == &local_bin) {
        candidates.push(local_bin);
    }

    for candidate in candidates {
        let output = exec_wsl_command(distro, &candidate, &["--version"])?;
        if output.code == 0 {
            return Ok((candidate, normalize_ollama_version(&output.stdout)));
        }
    }

    Err(cmd_err("OLLAMA_NOT_FOUND"))
}

// OpenClaw config file path
fn get_config_path_candidates_for(
    is_windows: bool,
    home_dir: PathBuf,
    config_dir: PathBuf,
) -> Vec<PathBuf> {
    if is_windows {
        let home_path = home_dir.join(".openclaw").join("openclaw.json");
        let roaming_path = config_dir.join("openclaw").join("openclaw.json");

        if home_path == roaming_path {
            vec![home_path]
        } else {
            vec![home_path, roaming_path]
        }
    } else {
        vec![home_dir.join(".openclaw").join("openclaw.json")]
    }
}

fn resolve_config_path_from_candidates(candidates: &[PathBuf]) -> PathBuf {
    for candidate in candidates {
        if candidate.exists() {
            return candidate.clone();
        }
    }
    candidates
        .first()
        .cloned()
        .unwrap_or_else(|| PathBuf::from("openclaw.json"))
}

fn get_config_resolution() -> OpenclawConfigResolution {
    let home_dir = dirs::home_dir().unwrap_or_else(|| PathBuf::from("."));
    let config_dir = dirs::config_dir().unwrap_or_else(|| PathBuf::from("."));
    let profile_selection = get_openclaw_profile_selection();
    let _runtime_selection = get_clawmaster_runtime_selection();
    let default_candidates =
        get_config_path_candidates_for(cfg!(target_os = "windows"), home_dir.clone(), config_dir);
    let existing_config_paths = default_candidates
        .iter()
        .filter(|candidate| candidate.exists())
        .cloned()
        .collect::<Vec<_>>();

    #[cfg(target_os = "windows")]
    if should_use_wsl_runtime(&_runtime_selection) {
        if let Some(distro) = resolve_selected_wsl_distro(&_runtime_selection) {
            let wsl_home = get_wsl_home_dir(&distro);
            let data_dir = get_openclaw_profile_data_dir_posix(&profile_selection, &wsl_home)
                .unwrap_or_else(|| join_posix(&wsl_home, ".openclaw"));
            let config_path = join_posix(&data_dir, "openclaw.json");
            let config_exists = wsl_file_exists(&distro, &config_path);
            let override_active = profile_selection.kind != "default";
            return OpenclawConfigResolution {
                config_path: PathBuf::from(config_path.clone()),
                data_dir: PathBuf::from(data_dir.clone()),
                source: if profile_selection.kind == "dev" {
                    "profile-dev".to_string()
                } else if profile_selection.kind == "named" {
                    "profile-named".to_string()
                } else if config_exists {
                    "existing-default-home".to_string()
                } else {
                    "default-home".to_string()
                },
                profile_selection,
                override_active,
                config_path_candidates: vec![PathBuf::from(config_path.clone())],
                existing_config_paths: if config_exists {
                    vec![PathBuf::from(config_path)]
                } else {
                    vec![]
                },
            };
        }
    }

    if let Some(data_dir) = get_openclaw_profile_data_dir(&profile_selection, &home_dir) {
        return OpenclawConfigResolution {
            config_path: data_dir.join("openclaw.json"),
            data_dir,
            source: if profile_selection.kind == "dev" {
                "profile-dev".to_string()
            } else {
                "profile-named".to_string()
            },
            profile_selection,
            override_active: true,
            config_path_candidates: default_candidates,
            existing_config_paths,
        };
    }

    let config_path = resolve_config_path_from_candidates(&default_candidates);
    let source = if default_candidates.get(1) == Some(&config_path) {
        "existing-default-roaming".to_string()
    } else if config_path.exists() {
        "existing-default-home".to_string()
    } else {
        "default-home".to_string()
    };

    OpenclawConfigResolution {
        data_dir: config_path
            .parent()
            .map(Path::to_path_buf)
            .unwrap_or_else(|| PathBuf::from(".")),
        config_path,
        source,
        profile_selection,
        override_active: false,
        config_path_candidates: default_candidates,
        existing_config_paths,
    }
}

fn normalize_arch_label(arch: &str) -> String {
    match arch {
        "x86_64" => "x64".to_string(),
        "aarch64" => "arm64".to_string(),
        other => other.to_string(),
    }
}

fn parse_node_major(version: &str) -> Option<u32> {
    let digits = version
        .trim()
        .trim_start_matches('v')
        .chars()
        .take_while(|ch| ch.is_ascii_digit())
        .collect::<String>();
    digits.parse::<u32>().ok()
}

fn supports_seekdb_embedded(target_platform: &str, target_arch: &str) -> bool {
    match normalize_local_data_target_platform(target_platform) {
        "linux" => target_arch == "x64" || target_arch == "arm64",
        "darwin" => target_arch == "arm64",
        _ => false,
    }
}

fn normalize_local_data_target_platform(platform: &str) -> &str {
    match platform {
        "macos" => "darwin",
        other => other,
    }
}

fn local_data_profile_key(profile_selection: &OpenclawProfileSelection) -> String {
    if profile_selection.kind == "named" {
        if let Some(name) = profile_selection.name.as_ref() {
            return format!("named:{name}");
        }
    }
    profile_selection.kind.clone()
}

fn clawmaster_data_root_native(
    profile_selection: &OpenclawProfileSelection,
    home_dir: &Path,
) -> PathBuf {
    let base = home_dir.join(".clawmaster").join("data");
    match profile_selection.kind.as_str() {
        "dev" => base.join("dev"),
        "named" => profile_selection
            .name
            .as_ref()
            .map(|name| base.join("named").join(name))
            .unwrap_or_else(|| base.join("default")),
        _ => base.join("default"),
    }
}

#[cfg(target_os = "windows")]
fn clawmaster_data_root_posix(
    profile_selection: &OpenclawProfileSelection,
    home_dir: &str,
) -> String {
    let base = join_posix(&join_posix(home_dir, ".clawmaster"), "data");
    match profile_selection.kind.as_str() {
        "dev" => join_posix(&base, "dev"),
        "named" => profile_selection
            .name
            .as_ref()
            .map(|name| join_posix(&join_posix(&base, "named"), name))
            .unwrap_or_else(|| join_posix(&base, "default")),
        _ => join_posix(&base, "default"),
    }
}

fn local_data_status_for_root(
    runtime_target: &str,
    profile_key: String,
    data_root: String,
    target_platform: &str,
    target_arch: &str,
    node_installed: bool,
    node_version: &str,
    join_child: impl Fn(&str, &str) -> String,
) -> LocalDataInfo {
    let supports_embedded = supports_seekdb_embedded(target_platform, target_arch);
    let node_major = parse_node_major(node_version);
    let fallback_root = join_child(&data_root, "fallback");

    if !node_installed {
        return LocalDataInfo {
            state: "degraded".to_string(),
            engine: "fallback".to_string(),
            runtime_target: runtime_target.to_string(),
            profile_key,
            data_root: Some(data_root),
            engine_root: Some(fallback_root),
            node_requirement: ">=20".to_string(),
            supports_embedded,
            target_platform: target_platform.to_string(),
            target_arch: target_arch.to_string(),
            reason_code: Some("node_missing".to_string()),
        };
    }

    if node_major.map(|major| major < 20).unwrap_or(true) {
        return LocalDataInfo {
            state: "degraded".to_string(),
            engine: "fallback".to_string(),
            runtime_target: runtime_target.to_string(),
            profile_key,
            data_root: Some(data_root),
            engine_root: Some(fallback_root),
            node_requirement: ">=20".to_string(),
            supports_embedded,
            target_platform: target_platform.to_string(),
            target_arch: target_arch.to_string(),
            reason_code: Some("node_too_old".to_string()),
        };
    }

    LocalDataInfo {
        state: "ready".to_string(),
        engine: "fallback".to_string(),
        runtime_target: runtime_target.to_string(),
        profile_key,
        data_root: Some(data_root.clone()),
        engine_root: Some(join_child(&data_root, "fallback")),
        node_requirement: ">=20".to_string(),
        supports_embedded,
        target_platform: target_platform.to_string(),
        target_arch: target_arch.to_string(),
        reason_code: None,
    }
}

fn resolve_local_data_status(
    _runtime_selection: &ClawmasterRuntimeSelection,
    profile_selection: &OpenclawProfileSelection,
    node_installed: bool,
    node_version: &str,
    _selected_wsl_distro: Option<&str>,
    _wsl_home_dir: Option<&str>,
) -> LocalDataInfo {
    let target_arch = normalize_arch_label(std::env::consts::ARCH);
    let profile_key = local_data_profile_key(profile_selection);

    #[cfg(target_os = "windows")]
    if should_use_wsl_runtime(_runtime_selection) {
        let supports_embedded = supports_seekdb_embedded("linux", &target_arch);
        if _selected_wsl_distro.is_none() {
            return LocalDataInfo {
                state: "blocked".to_string(),
                engine: "unavailable".to_string(),
                runtime_target: "wsl2".to_string(),
                profile_key,
                data_root: None,
                engine_root: None,
                node_requirement: ">=20".to_string(),
                supports_embedded,
                target_platform: "linux".to_string(),
                target_arch,
                reason_code: Some("wsl_distro_missing".to_string()),
            };
        }

        let data_root =
            clawmaster_data_root_posix(profile_selection, _wsl_home_dir.unwrap_or("/home"));
        return local_data_status_for_root(
            "wsl2",
            profile_key,
            data_root,
            "linux",
            &target_arch,
            node_installed,
            node_version,
            join_posix,
        );
    }

    let home_dir = dirs::home_dir().unwrap_or_else(|| PathBuf::from("."));
    let data_root = clawmaster_data_root_native(profile_selection, &home_dir)
        .to_string_lossy()
        .to_string();
    local_data_status_for_root(
        "native",
        profile_key,
        data_root,
        normalize_local_data_target_platform(std::env::consts::OS),
        &target_arch,
        node_installed,
        node_version,
        |base, child| {
            PathBuf::from(base)
                .join(child)
                .to_string_lossy()
                .to_string()
        },
    )
}

fn get_config_path() -> PathBuf {
    get_config_resolution().config_path
}

fn get_openclaw_memory_dir() -> PathBuf {
    #[cfg(target_os = "windows")]
    if active_wsl_distro().is_some() {
        let config_path = get_config_path();
        return PathBuf::from(join_posix(
            &dirname_posix(&config_path.to_string_lossy()),
            "memory",
        ));
    }

    get_config_path()
        .parent()
        .unwrap_or(&PathBuf::from("."))
        .join("memory")
}

fn read_active_openclaw_text_file(path: &Path) -> Result<Option<String>, String> {
    #[cfg(target_os = "windows")]
    if let Some(distro) = active_wsl_distro() {
        return read_text_file_in_wsl(&distro, &path.to_string_lossy());
    }

    match fs::read_to_string(path) {
        Ok(content) => Ok(Some(content)),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(cmd_err_d("IO_ERROR", error)),
    }
}

const BASE64_STANDARD_ALPHABET: &[u8; 64] =
    b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

fn encode_base64_standard(input: &[u8]) -> String {
    let mut out = String::with_capacity((input.len() + 2) / 3 * 4);
    let mut index = 0;
    while index < input.len() {
        let chunk_len = (input.len() - index).min(3);
        let mut chunk = [0u8; 3];
        for offset in 0..chunk_len {
            chunk[offset] = input[index + offset];
        }
        out.push(BASE64_STANDARD_ALPHABET[(chunk[0] >> 2) as usize] as char);
        out.push(
            BASE64_STANDARD_ALPHABET[(((chunk[0] & 0x03) << 4) | (chunk[1] >> 4)) as usize] as char,
        );
        if chunk_len > 1 {
            out.push(
                BASE64_STANDARD_ALPHABET[(((chunk[1] & 0x0F) << 2) | (chunk[2] >> 6)) as usize]
                    as char,
            );
        } else {
            out.push('=');
        }
        if chunk_len > 2 {
            out.push(BASE64_STANDARD_ALPHABET[(chunk[2] & 0x3F) as usize] as char);
        } else {
            out.push('=');
        }
        index += 3;
    }
    out
}

fn decode_base64_standard(input: &str) -> Result<Vec<u8>, String> {
    const INVALID: u8 = 0xFF;
    let mut table = [INVALID; 256];
    for (index, &ch) in b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"
        .iter()
        .enumerate()
    {
        table[ch as usize] = index as u8;
    }

    let cleaned: Vec<u8> = input
        .bytes()
        .filter(|byte| !byte.is_ascii_whitespace())
        .collect();
    if cleaned.len() % 4 != 0 {
        return Err("invalid base64 length".to_string());
    }

    let mut out = Vec::with_capacity(cleaned.len() / 4 * 3);
    for chunk in cleaned.chunks(4) {
        let mut values = [0u8; 4];
        let mut padding = 0;
        for (index, &byte) in chunk.iter().enumerate() {
            if byte == b'=' {
                padding += 1;
                continue;
            }
            if padding > 0 {
                return Err("invalid base64 padding".to_string());
            }
            let decoded = table[byte as usize];
            if decoded == INVALID {
                return Err("invalid base64 character".to_string());
            }
            values[index] = decoded;
        }
        out.push((values[0] << 2) | (values[1] >> 4));
        if padding < 2 {
            out.push((values[1] << 4) | (values[2] >> 2));
        }
        if padding < 1 {
            out.push((values[2] << 6) | values[3]);
        }
    }
    Ok(out)
}

fn read_active_openclaw_binary_file(path: &Path) -> Result<Option<Vec<u8>>, String> {
    #[cfg(target_os = "windows")]
    if let Some(distro) = active_wsl_distro() {
        if !wsl_file_exists(&distro, &path.to_string_lossy()) {
            return Ok(None);
        }
        // Pipe through base64 so Windows stdout newline translation cannot
        // corrupt image bytes on their way out of wsl.exe.
        let script = format!(
            "base64 -- {} | tr -d '\\n'",
            shell_escape_posix_arg(&path.to_string_lossy())
        );
        let output = run_wsl_shell(&distro, &script, None)?;
        if output.code != 0 {
            return Err(cmd_err_d("WSL_BINARY_READ_FAILED", output.stderr.trim()));
        }
        let decoded = decode_base64_standard(output.stdout.trim())
            .map_err(|error| cmd_err_d("WSL_BINARY_READ_FAILED", error))?;
        return Ok(Some(decoded));
    }

    match fs::read(path) {
        Ok(content) => Ok(Some(content)),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(cmd_err_d("IO_ERROR", error)),
    }
}

fn write_active_openclaw_text_file(path: &Path, content: &str) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    if let Some(distro) = active_wsl_distro() {
        return write_text_file_in_wsl(&distro, &path.to_string_lossy(), content);
    }

    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| cmd_err_d("IO_ERROR", e))?;
    }
    fs::write(path, content).map_err(|e| cmd_err_d("IO_ERROR", e))
}

fn resolve_runtime_input_path(input: &str) -> Result<PathBuf, String> {
    #[cfg(target_os = "windows")]
    if let Some(distro) = active_wsl_distro() {
        let script = format!(
            "value={}\n{}",
            shell_escape_posix_arg(input),
            r#"
resolve_path() {
  local value="$1"
  case "$value" in
    "~")
      value="$HOME"
      ;;
    "~/"*)
      value="$HOME/${value#~/}"
      ;;
  esac
  if [ -z "$value" ]; then
    realpath -m "$PWD"
    return
  fi
  if [ "${value#/}" != "$value" ]; then
    realpath -m "$value"
    return
  fi
  realpath -m "$PWD/$value"
}
resolve_path "$value"
"#
        );
        let output = run_wsl_shell(&distro, script.trim(), None)?;
        if output.code != 0 {
            return Err(cmd_err_d(
                "RUNTIME_PATH_RESOLVE_FAILED",
                output.stderr.trim().to_string(),
            ));
        }
        let resolved = output.stdout.trim();
        if resolved.is_empty() {
            return Err(cmd_err("RUNTIME_PATH_RESOLVE_FAILED"));
        }
        return Ok(PathBuf::from(resolved));
    }

    let expanded = expand_home_path(input);
    if expanded.is_absolute() {
        return Ok(expanded);
    }
    let cwd = std::env::current_dir().map_err(|e| cmd_err_d("RUNTIME_PATH_RESOLVE_FAILED", e))?;
    Ok(cwd.join(expanded))
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct RuntimeTextFileDto {
    path: String,
    exists: bool,
    content: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct RequiredRuntimeTextFileDto {
    path: String,
    content: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct RuntimeBinaryFileDto {
    path: String,
    mime_type: String,
    base64: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ContentDraftVariantSummaryDto {
    id: String,
    run_id: String,
    platform: String,
    title: Option<String>,
    slug: Option<String>,
    source_url: Option<String>,
    saved_at: Option<String>,
    draft_path: String,
    manifest_path: String,
    images_dir: String,
    image_files: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ContentDraftDeleteResultDto {
    removed_path: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct McpImportCandidateDto {
    id: String,
    format: String,
    path: String,
    exists: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct OpenclawMemoryFileEntry {
    name: String,
    relative_path: String,
    absolute_path: String,
    size: u64,
    modified_at_ms: u64,
    extension: String,
    kind: String,
}

fn default_content_drafts_root() -> PathBuf {
    #[cfg(target_os = "windows")]
    if let Some(distro) = active_wsl_distro() {
        return PathBuf::from(join_posix(
            &get_wsl_home_dir(&distro),
            ".openclaw/workspace/content-drafts",
        ));
    }

    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".openclaw")
        .join("workspace")
        .join("content-drafts")
}

fn active_content_drafts_root() -> PathBuf {
    #[cfg(target_os = "windows")]
    if active_wsl_distro().is_some() {
        return PathBuf::from(join_posix(
            &get_config_resolution().data_dir.to_string_lossy(),
            "workspace/content-drafts",
        ));
    }

    get_config_resolution()
        .data_dir
        .join("workspace")
        .join("content-drafts")
}

fn workspace_content_drafts_root() -> Option<PathBuf> {
    let workspace_dir = std::env::var("OPENCLAW_WORKSPACE_DIR").ok()?;
    let trimmed = workspace_dir.trim();
    if trimmed.is_empty() {
        return None;
    }

    #[cfg(target_os = "windows")]
    if active_wsl_distro().is_some() {
        return Some(PathBuf::from(join_posix(trimmed, "content-drafts")));
    }

    Some(PathBuf::from(trimmed).join("content-drafts"))
}

fn data_dir_content_drafts_root() -> Option<PathBuf> {
    let data_dir = std::env::var("OPENCLAW_DATA_DIR").ok()?;
    let trimmed = data_dir.trim();
    if trimmed.is_empty() {
        return None;
    }

    #[cfg(target_os = "windows")]
    if active_wsl_distro().is_some() {
        return Some(PathBuf::from(join_posix(
            trimmed,
            "workspace/content-drafts",
        )));
    }

    Some(
        PathBuf::from(trimmed)
            .join("workspace")
            .join("content-drafts"),
    )
}

fn config_path_content_drafts_root() -> Option<PathBuf> {
    let config_path = std::env::var("OPENCLAW_CONFIG_PATH").ok()?;
    let trimmed = config_path.trim();
    if trimmed.is_empty() {
        return None;
    }

    #[cfg(target_os = "windows")]
    if active_wsl_distro().is_some() {
        return Some(PathBuf::from(join_posix(
            &dirname_posix(trimmed),
            "workspace/content-drafts",
        )));
    }

    Some(
        PathBuf::from(trimmed)
            .parent()
            .unwrap_or_else(|| Path::new("."))
            .join("workspace")
            .join("content-drafts"),
    )
}

fn content_drafts_roots() -> Vec<PathBuf> {
    let mut roots = Vec::new();
    let mut candidates = Vec::new();
    if let Some(workspace_root) = workspace_content_drafts_root() {
        candidates.push(workspace_root);
    }
    if let Some(data_root) = data_dir_content_drafts_root() {
        candidates.push(data_root);
    }
    if let Some(config_root) = config_path_content_drafts_root() {
        candidates.push(config_root);
    }
    candidates.push(active_content_drafts_root());
    candidates.push(default_content_drafts_root());

    for root in candidates {
        if !roots.iter().any(|existing| existing == &root) {
            roots.push(root);
        }
    }
    roots
}

fn content_draft_mime_type(path: &Path) -> String {
    match path
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| value.to_ascii_lowercase())
        .as_deref()
    {
        Some("png") => "image/png".to_string(),
        Some("jpg") | Some("jpeg") => "image/jpeg".to_string(),
        Some("webp") => "image/webp".to_string(),
        Some("gif") => "image/gif".to_string(),
        Some("svg") => "image/svg+xml".to_string(),
        _ => "application/octet-stream".to_string(),
    }
}

fn safe_host_canonicalize(candidate: &Path) -> PathBuf {
    if let Ok(real) = fs::canonicalize(candidate) {
        return real;
    }
    match candidate.parent() {
        Some(parent) if parent != candidate => match fs::canonicalize(parent) {
            Ok(real_parent) => match candidate.file_name() {
                Some(name) => real_parent.join(name),
                None => candidate.to_path_buf(),
            },
            Err(_) => candidate.to_path_buf(),
        },
        _ => candidate.to_path_buf(),
    }
}

fn content_draft_path_allowed(path: &Path) -> bool {
    #[cfg(target_os = "windows")]
    if active_wsl_distro().is_some() {
        let candidate = path.to_string_lossy();
        return content_drafts_roots().iter().any(|root| {
            let normalized_root = root.to_string_lossy();
            let trimmed = normalized_root.trim_end_matches('/');
            candidate == trimmed || candidate.starts_with(&format!("{trimmed}/"))
        });
    }

    let canonical_candidate = safe_host_canonicalize(path);
    content_drafts_roots()
        .iter()
        .map(|root| safe_host_canonicalize(root))
        .any(|root| canonical_candidate.starts_with(&root))
}

fn resolve_allowed_content_draft_path(input: &str) -> Result<PathBuf, String> {
    let resolved = resolve_runtime_input_path(input)?;
    if !content_draft_path_allowed(&resolved) {
        return Err(cmd_err_p(
            "CONTENT_DRAFT_PATH_NOT_ALLOWED",
            serde_json::json!({ "path": resolved.to_string_lossy() }),
        ));
    }
    Ok(resolved)
}

fn normalize_content_draft_variant(
    manifest_path: &Path,
    raw: &serde_json::Value,
) -> Option<ContentDraftVariantSummaryDto> {
    let platform_dir = manifest_path.parent()?;
    let run_dir = platform_dir.parent()?;
    let platform = raw
        .get("platform")
        .and_then(|value| value.as_str())
        .unwrap_or_else(|| {
            platform_dir
                .file_name()
                .and_then(|value| value.to_str())
                .unwrap_or("")
        })
        .trim()
        .to_ascii_lowercase();
    let run_id = raw
        .get("runId")
        .and_then(|value| value.as_str())
        .unwrap_or_else(|| {
            run_dir
                .file_name()
                .and_then(|value| value.to_str())
                .unwrap_or("")
        })
        .trim()
        .to_string();
    if platform.is_empty() || run_id.is_empty() {
        return None;
    }

    let draft_path = raw
        .get("draftPath")
        .and_then(|value| value.as_str())
        .filter(|value| !value.trim().is_empty())
        .map(PathBuf::from)
        .unwrap_or_else(|| platform_dir.join("draft.md"));
    let images_dir = raw
        .get("imagesDir")
        .and_then(|value| value.as_str())
        .filter(|value| !value.trim().is_empty())
        .map(PathBuf::from)
        .unwrap_or_else(|| platform_dir.join("images"));
    let image_files = raw
        .get("imageFiles")
        .and_then(|value| value.as_array())
        .map(|items| {
            items
                .iter()
                .filter_map(|item| item.as_str())
                .map(|item| item.to_string())
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();

    Some(ContentDraftVariantSummaryDto {
        id: format!("{run_id}:{platform}"),
        run_id,
        platform,
        title: raw
            .get("title")
            .and_then(|value| value.as_str())
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty()),
        slug: raw
            .get("slug")
            .and_then(|value| value.as_str())
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty()),
        source_url: raw
            .get("sourceUrl")
            .and_then(|value| value.as_str())
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty()),
        saved_at: raw
            .get("savedAt")
            .and_then(|value| value.as_str())
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty()),
        draft_path: draft_path.to_string_lossy().to_string(),
        manifest_path: manifest_path.to_string_lossy().to_string(),
        images_dir: images_dir.to_string_lossy().to_string(),
        image_files,
    })
}

fn collect_content_draft_manifests_host(root: &Path) -> Vec<PathBuf> {
    let mut manifests = Vec::new();
    if !root.is_dir() {
        return manifests;
    }
    let Ok(run_entries) = fs::read_dir(root) else {
        return manifests;
    };
    for run_entry in run_entries.flatten() {
        let run_path = run_entry.path();
        if !run_path.is_dir() {
            continue;
        }
        let Ok(platform_entries) = fs::read_dir(&run_path) else {
            continue;
        };
        for platform_entry in platform_entries.flatten() {
            let platform_path = platform_entry.path();
            if !platform_path.is_dir() {
                continue;
            }
            let manifest_path = platform_path.join("manifest.json");
            if manifest_path.is_file() {
                manifests.push(manifest_path);
            }
        }
    }
    manifests
}

#[cfg(target_os = "windows")]
fn collect_content_draft_manifests_wsl(distro: &str, root: &str) -> Result<Vec<PathBuf>, String> {
    if !wsl_is_dir(distro, root) {
        return Ok(vec![]);
    }
    let script = format!(
        "find {} -mindepth 2 -maxdepth 2 -type f -name manifest.json -print",
        shell_escape_posix_arg(root)
    );
    let output = run_wsl_shell(distro, &script, None)?;
    if output.code != 0 {
        return Err(cmd_err_d(
            "CONTENT_DRAFT_MANIFEST_LIST_FAILED",
            output.stderr.trim(),
        ));
    }
    Ok(output
        .stdout
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .map(PathBuf::from)
        .collect())
}

fn list_content_draft_variants_state() -> Result<Vec<ContentDraftVariantSummaryDto>, String> {
    let mut manifest_paths = Vec::<PathBuf>::new();
    #[cfg(target_os = "windows")]
    if let Some(distro) = active_wsl_distro() {
        for root in content_drafts_roots() {
            for manifest_path in
                collect_content_draft_manifests_wsl(&distro, &root.to_string_lossy())?
            {
                if !manifest_paths
                    .iter()
                    .any(|existing| existing == &manifest_path)
                {
                    manifest_paths.push(manifest_path);
                }
            }
        }
    } else {
        for root in content_drafts_roots() {
            for manifest_path in collect_content_draft_manifests_host(&root) {
                if !manifest_paths
                    .iter()
                    .any(|existing| existing == &manifest_path)
                {
                    manifest_paths.push(manifest_path);
                }
            }
        }
    }
    #[cfg(not(target_os = "windows"))]
    for root in content_drafts_roots() {
        for manifest_path in collect_content_draft_manifests_host(&root) {
            if !manifest_paths
                .iter()
                .any(|existing| existing == &manifest_path)
            {
                manifest_paths.push(manifest_path);
            }
        }
    }

    let mut variants = Vec::new();
    for manifest_path in manifest_paths {
        let Some(content) = read_active_openclaw_text_file(&manifest_path)? else {
            continue;
        };
        let Ok(raw) = serde_json::from_str::<serde_json::Value>(&content) else {
            continue;
        };
        if let Some(variant) = normalize_content_draft_variant(&manifest_path, &raw) {
            variants.push(variant);
        }
    }

    variants.sort_by(|left, right| {
        let left_saved = left.saved_at.as_deref().unwrap_or("");
        let right_saved = right.saved_at.as_deref().unwrap_or("");
        right_saved
            .cmp(left_saved)
            .then_with(|| right.id.cmp(&left.id))
    });
    Ok(variants)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct OpenclawMemoryFilesPayload {
    root: String,
    files: Vec<OpenclawMemoryFileEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct OpenclawMemorySearchHit {
    id: String,
    content: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    score: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    path: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct OpenclawMemorySearchCapabilityPayload {
    mode: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    reason: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    detail: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct OpenclawMemoryReindexPayload {
    exit_code: i32,
    stdout: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    stderr: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ManagedMemoryStoreContextPayload {
    implementation: String,
    engine: String,
    runtime_mode: String,
    runtime_target: String,
    host_platform: String,
    host_arch: String,
    target_platform: String,
    target_arch: String,
    selected_wsl_distro: Option<String>,
    profile_key: String,
    data_root: String,
    runtime_root: String,
    storage_path: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    db_path: Option<String>,
    legacy_db_path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ManagedMemoryBridgeConfigPayload {
    data_root: String,
    engine: String,
    auto_capture: bool,
    auto_recall: bool,
    infer_on_add: bool,
    recall_limit: u32,
    recall_score_threshold: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    user_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    agent_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ManagedMemoryBridgeEntryPayload {
    enabled: bool,
    config: ManagedMemoryBridgeConfigPayload,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ManagedMemoryBridgeDesiredPayload {
    slot_value: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    entry: Option<ManagedMemoryBridgeEntryPayload>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ManagedMemoryBridgeStatusPayload {
    plugin_id: String,
    slot_key: String,
    state: String,
    issues: Vec<String>,
    installed: bool,
    plugin_status: Option<String>,
    installed_plugin_path: Option<String>,
    runtime_plugin_path: Option<String>,
    plugin_path: String,
    plugin_path_exists: bool,
    store: ManagedMemoryStoreContextPayload,
    current_slot_value: Option<String>,
    current_entry: Option<ManagedMemoryBridgeEntryPayload>,
    desired: ManagedMemoryBridgeDesiredPayload,
}

fn classify_openclaw_memory_file(name: &str) -> &'static str {
    let lower = name.to_ascii_lowercase();
    if lower.ends_with(".sqlite") || lower.ends_with(".db") {
        "sqlite"
    } else if lower.ends_with(".wal") || lower.ends_with(".shm") || lower.ends_with(".journal") {
        "journal"
    } else if lower.ends_with(".json") {
        "json"
    } else if lower.ends_with(".txt") || lower.ends_with(".log") || lower.ends_with(".md") {
        "text"
    } else {
        "other"
    }
}

fn collect_openclaw_memory_files(
    root: &Path,
    dir: &Path,
    out: &mut Vec<OpenclawMemoryFileEntry>,
) -> Result<(), String> {
    for entry in fs::read_dir(dir).map_err(|e| cmd_err_d("OPENCLAW_MEMORY_FILES_READ_FAILED", e))? {
        let entry = entry.map_err(|e| cmd_err_d("OPENCLAW_MEMORY_FILES_READ_FAILED", e))?;
        let path = entry.path();
        let file_type = entry
            .file_type()
            .map_err(|e| cmd_err_d("OPENCLAW_MEMORY_FILES_READ_FAILED", e))?;
        if file_type.is_dir() {
            collect_openclaw_memory_files(root, &path, out)?;
            continue;
        }
        if !file_type.is_file() {
            continue;
        }
        let meta = entry
            .metadata()
            .map_err(|e| cmd_err_d("OPENCLAW_MEMORY_FILES_READ_FAILED", e))?;
        let modified_at_ms = meta
            .modified()
            .ok()
            .and_then(|value| value.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|value| value.as_millis().min(u64::MAX as u128) as u64)
            .unwrap_or(0);
        let relative_path = path
            .strip_prefix(root)
            .unwrap_or(&path)
            .to_string_lossy()
            .to_string();
        let name = entry.file_name().to_string_lossy().to_string();
        let extension = path
            .extension()
            .and_then(|value| value.to_str())
            .unwrap_or("")
            .to_string();
        out.push(OpenclawMemoryFileEntry {
            name: name.clone(),
            relative_path,
            absolute_path: path.to_string_lossy().to_string(),
            size: meta.len(),
            modified_at_ms,
            extension,
            kind: classify_openclaw_memory_file(&name).to_string(),
        });
    }
    Ok(())
}

#[cfg(target_os = "windows")]
fn collect_openclaw_memory_files_wsl(
    distro: &str,
    root: &str,
) -> Result<Vec<OpenclawMemoryFileEntry>, String> {
    if !wsl_is_dir(distro, root) {
        return Ok(vec![]);
    }
    let script = format!(
        "find {} -type f -print0 | while IFS= read -r -d '' file; do size=$(stat -c %s \"$file\" 2>/dev/null || echo 0); mtime=$(stat -c %Y \"$file\" 2>/dev/null || echo 0); printf '%s\\t%s\\t%s\\n' \"$file\" \"$size\" \"$mtime\"; done",
        shell_escape_posix_arg(root)
    );
    let output = run_wsl_shell(distro, &script, None)?;
    if output.code != 0 {
        return Err(cmd_err_d(
            "OPENCLAW_MEMORY_FILES_READ_FAILED",
            output.stderr.trim(),
        ));
    }
    let mut files = Vec::new();
    for line in output.stdout.lines().filter(|line| !line.trim().is_empty()) {
        let mut parts = line.splitn(3, '\t');
        let absolute_path = match parts.next() {
            Some(value) if !value.is_empty() => value.to_string(),
            _ => continue,
        };
        let size = parts
            .next()
            .and_then(|value| value.parse::<u64>().ok())
            .unwrap_or(0);
        let modified_at_ms = parts
            .next()
            .and_then(|value| value.parse::<u64>().ok())
            .map(|seconds| seconds.saturating_mul(1000))
            .unwrap_or(0);
        let name = absolute_path
            .rsplit('/')
            .next()
            .unwrap_or(absolute_path.as_str())
            .to_string();
        let relative_path = absolute_path
            .strip_prefix(root)
            .unwrap_or(absolute_path.as_str())
            .trim_start_matches('/')
            .to_string();
        let extension = Path::new(&name)
            .extension()
            .and_then(|value| value.to_str())
            .unwrap_or_default()
            .to_string();
        files.push(OpenclawMemoryFileEntry {
            name: name.clone(),
            relative_path,
            absolute_path,
            size,
            modified_at_ms,
            extension,
            kind: classify_openclaw_memory_file(&name).to_string(),
        });
    }
    Ok(files)
}

fn resolve_openclaw_memory_relative_path(relative_path: &str) -> Result<PathBuf, String> {
    let trimmed = relative_path.trim();
    if trimmed.is_empty() {
        return Err(cmd_err("OPENCLAW_MEMORY_FILE_REQUIRED"));
    }
    let rel = PathBuf::from(trimmed);
    if rel.is_absolute()
        || rel.components().any(|component| {
            matches!(
                component,
                std::path::Component::ParentDir
                    | std::path::Component::RootDir
                    | std::path::Component::Prefix(_)
            )
        })
    {
        return Err(cmd_err("OPENCLAW_MEMORY_FILE_INVALID"));
    }
    Ok(get_openclaw_memory_dir().join(rel))
}

fn extract_workspace_dirs_from_memory_status(stdout: &str, agent: Option<&str>) -> Vec<PathBuf> {
    let parsed =
        serde_json::from_str::<serde_json::Value>(stdout).unwrap_or_else(|_| serde_json::json!([]));
    let mut dirs = Vec::new();
    if let Some(entries) = parsed.as_array() {
        for item in entries {
            let agent_id = item
                .get("agentId")
                .and_then(|v| v.as_str())
                .filter(|value| !value.trim().is_empty())
                .unwrap_or("main");
            if let Some(expected) = agent {
                if agent_id != expected {
                    continue;
                }
            }
            if let Some(workspace_dir) = item
                .get("status")
                .and_then(|status| status.get("workspaceDir"))
                .and_then(|value| value.as_str())
                .filter(|value| !value.trim().is_empty())
            {
                dirs.push(PathBuf::from(workspace_dir));
            }
        }
    }
    if dirs.is_empty() {
        let fallback = get_config_path()
            .parent()
            .unwrap_or(&PathBuf::from("."))
            .join("workspace");
        dirs.push(fallback);
    }
    dirs
}

fn collect_markdown_files(dir: &Path, out: &mut Vec<PathBuf>) -> Result<(), String> {
    let entries = match fs::read_dir(dir) {
        Ok(value) => value,
        Err(_) => return Ok(()),
    };
    for entry in entries {
        let entry = entry.map_err(|e| cmd_err_d("OPENCLAW_MEMORY_FILES_READ_FAILED", e))?;
        let path = entry.path();
        let file_type = entry
            .file_type()
            .map_err(|e| cmd_err_d("OPENCLAW_MEMORY_FILES_READ_FAILED", e))?;
        if file_type.is_dir() {
            collect_markdown_files(&path, out)?;
            continue;
        }
        if file_type.is_file()
            && path
                .extension()
                .and_then(|value| value.to_str())
                .map(|value| value.eq_ignore_ascii_case("md"))
                .unwrap_or(false)
        {
            out.push(path);
        }
    }
    Ok(())
}

fn count_occurrences(text: &str, query: &str) -> usize {
    if query.is_empty() {
        return 0;
    }
    let haystack = text.to_ascii_lowercase();
    let needle = query.to_ascii_lowercase();
    let mut offset = 0usize;
    let mut count = 0usize;
    while let Some(index) = haystack[offset..].find(&needle) {
        count += 1;
        offset += index + needle.len();
        if offset >= haystack.len() {
            break;
        }
    }
    count
}

fn extract_search_snippet(text: &str, query: &str) -> String {
    let normalized = text.split_whitespace().collect::<Vec<_>>().join(" ");
    if normalized.is_empty() {
        return String::new();
    }
    let lower = normalized.to_ascii_lowercase();
    let needle = query.to_ascii_lowercase();
    if let Some(index) = lower.find(&needle) {
        let start = index.saturating_sub(80);
        let end = (index + needle.len() + 120).min(normalized.len());
        normalized[start..end].to_string()
    } else {
        normalized.chars().take(240).collect()
    }
}

fn has_fts_unavailable_error(message: &str) -> bool {
    let lower = message.to_ascii_lowercase();
    lower.contains("fts5") && lower.contains("no such module")
}

fn has_unsupported_openclaw_memory_error(message: &str) -> bool {
    let lower = message.to_ascii_lowercase();
    lower.contains("unknown command 'memory'")
        || (lower.contains("requires node >=")
            && lower.contains("upgrade node and re-run openclaw"))
}

fn should_ignore_managed_memory_bridge_reindex_error(message: &str) -> bool {
    has_unsupported_openclaw_memory_error(message)
}

fn has_structured_memory_search_payload(stdout: &str) -> bool {
    let trimmed = stdout.trim();
    if trimmed.is_empty() {
        return false;
    }
    let Ok(value) = serde_json::from_str::<serde_json::Value>(trimmed) else {
        return false;
    };
    if value.is_array() {
        return true;
    }
    value
        .as_object()
        .map(|record| {
            ["hits", "results", "items", "memories", "matches"]
                .iter()
                .any(|key| {
                    record
                        .get(*key)
                        .map(|value| value.is_array())
                        .unwrap_or(false)
                })
        })
        .unwrap_or(false)
}

fn resolve_openclaw_memory_search_capability_from_output(
    code: i32,
    stdout: &str,
    stderr: &str,
) -> OpenclawMemorySearchCapabilityPayload {
    if code == 0 || has_structured_memory_search_payload(stdout) {
        return OpenclawMemorySearchCapabilityPayload {
            mode: "native".to_string(),
            reason: None,
            detail: None,
        };
    }

    let detail = if stderr.trim().is_empty() {
        stdout.trim()
    } else {
        stderr.trim()
    };

    if has_fts_unavailable_error(detail) {
        return OpenclawMemorySearchCapabilityPayload {
            mode: "fallback".to_string(),
            reason: Some("fts5_unavailable".to_string()),
            detail: Some(detail.to_string()),
        };
    }

    if has_unsupported_openclaw_memory_error(detail) {
        return OpenclawMemorySearchCapabilityPayload {
            mode: "unsupported".to_string(),
            reason: Some("command_unavailable".to_string()),
            detail: Some(detail.to_string()),
        };
    }

    OpenclawMemorySearchCapabilityPayload {
        mode: "native".to_string(),
        reason: None,
        detail: if detail.is_empty() {
            None
        } else {
            Some(detail.to_string())
        },
    }
}

const MEMORY_BRIDGE_PLUGIN_ID: &str = "memory-clawmaster-powermem";
const MEMORY_BRIDGE_SLOT_KEY: &str = "memory";

fn resolve_managed_memory_engine_for_desktop(host_platform: &str, host_arch: &str) -> String {
    if host_platform == "linux" && (host_arch == "x64" || host_arch == "arm64") {
        "powermem-seekdb".to_string()
    } else {
        "powermem-sqlite".to_string()
    }
}

#[cfg_attr(not(any(target_os = "windows", test)), allow(dead_code))]
fn windows_path_to_wsl_path(value: &str) -> Option<String> {
    let normalized = value.trim();
    let bytes = normalized.as_bytes();
    if bytes.len() < 3 || bytes[1] != b':' || (bytes[2] != b'\\' && bytes[2] != b'/') {
        return None;
    }
    let drive = (bytes[0] as char).to_ascii_lowercase();
    let tail = normalized[3..].replace('\\', "/");
    if tail.is_empty() {
        Some(format!("/mnt/{drive}"))
    } else {
        Some(format!("/mnt/{drive}/{tail}"))
    }
}

#[cfg_attr(not(any(target_os = "windows", test)), allow(dead_code))]
fn managed_memory_windows_wsl_data_root(
    profile_selection: &OpenclawProfileSelection,
    home_dir: &Path,
) -> String {
    let host_data_root = clawmaster_data_root_native(profile_selection, home_dir)
        .to_string_lossy()
        .to_string();
    windows_path_to_wsl_path(&host_data_root).unwrap_or(host_data_root)
}

fn find_balanced_json_end(raw: &str, start: usize) -> Option<usize> {
    let first = raw.as_bytes().get(start).copied()? as char;
    if first != '{' && first != '[' {
        return None;
    }
    let mut expected_closers = vec![if first == '{' { '}' } else { ']' }];
    let mut in_string = false;
    let mut escaped = false;
    for (index, ch) in raw.char_indices().skip_while(|(index, _)| *index <= start) {
        if in_string {
            if escaped {
                escaped = false;
                continue;
            }
            if ch == '\\' {
                escaped = true;
                continue;
            }
            if ch == '"' {
                in_string = false;
            }
            continue;
        }
        match ch {
            '"' => in_string = true,
            '{' => expected_closers.push('}'),
            '[' => expected_closers.push(']'),
            '}' | ']' => {
                let expected = expected_closers.pop()?;
                if expected != ch {
                    return None;
                }
                if expected_closers.is_empty() {
                    return Some(index);
                }
            }
            _ => {}
        }
    }
    None
}

fn extract_first_json_value(raw: &str) -> Option<serde_json::Value> {
    for (index, ch) in raw.char_indices() {
        if ch != '{' && ch != '[' {
            continue;
        }
        let Some(end) = find_balanced_json_end(raw, index) else {
            continue;
        };
        if let Ok(value) = serde_json::from_str::<serde_json::Value>(&raw[index..=end]) {
            return Some(value);
        }
    }
    None
}

fn parse_json_lenient(raw: &str) -> Option<serde_json::Value> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return None;
    }
    serde_json::from_str::<serde_json::Value>(trimmed)
        .ok()
        .or_else(|| extract_first_json_value(trimmed))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SkillGuardScanPayload {
    skill_key: Option<String>,
    name: Option<String>,
    slug: Option<String>,
}

fn trailing_slug_token(value: Option<&str>) -> String {
    value
        .unwrap_or_default()
        .split('/')
        .filter(|part| !part.is_empty())
        .next_back()
        .unwrap_or_default()
        .to_string()
}

fn push_unique_skill_token(
    tokens: &mut Vec<String>,
    seen: &mut HashSet<String>,
    value: Option<&str>,
) {
    let token = value.unwrap_or_default().trim();
    if token.is_empty() {
        return;
    }
    let key = token.to_ascii_lowercase();
    if seen.insert(key) {
        tokens.push(token.to_string());
    }
}

fn unique_skill_scan_tokens(payload: &SkillGuardScanPayload) -> Vec<String> {
    let mut tokens = Vec::new();
    let mut seen = HashSet::new();
    push_unique_skill_token(&mut tokens, &mut seen, payload.skill_key.as_deref());
    push_unique_skill_token(&mut tokens, &mut seen, payload.name.as_deref());
    push_unique_skill_token(&mut tokens, &mut seen, payload.slug.as_deref());
    let trailing = trailing_slug_token(payload.slug.as_deref());
    push_unique_skill_token(&mut tokens, &mut seen, Some(&trailing));
    tokens
}

fn skill_scan_label(payload: &SkillGuardScanPayload) -> String {
    payload
        .skill_key
        .as_deref()
        .or(payload.name.as_deref())
        .or(payload.slug.as_deref())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or("unknown")
        .to_string()
}

fn resolve_skill_dir_host(payload: &SkillGuardScanPayload) -> Option<PathBuf> {
    let home_dir = dirs::home_dir()?;
    let tokens = unique_skill_scan_tokens(payload);
    if tokens.is_empty() {
        return None;
    }

    for root_suffix in SKILLGUARD_SCAN_ROOTS {
        let root = home_dir.join(root_suffix);
        if !root.is_dir() {
            continue;
        }

        let mut entries: Vec<(String, PathBuf)> = Vec::new();
        if let Ok(read_dir) = fs::read_dir(&root) {
            for entry in read_dir {
                let Ok(entry) = entry else { continue };
                let Ok(file_type) = entry.file_type() else {
                    continue;
                };
                if !file_type.is_dir() {
                    continue;
                }
                let entry_path = entry.path();
                if !entry_path.join("SKILL.md").is_file() {
                    continue;
                }
                entries.push((entry.file_name().to_string_lossy().to_string(), entry_path));
            }
        }

        for token in &tokens {
            let direct = root.join(token);
            if direct.join("SKILL.md").is_file() {
                return Some(direct);
            }

            if let Some((_, matched_dir)) = entries
                .iter()
                .find(|(name, _)| name.eq_ignore_ascii_case(token))
            {
                return Some(matched_dir.clone());
            }
        }
    }

    None
}

#[cfg(target_os = "windows")]
fn resolve_skill_dir_wsl(distro: &str, payload: &SkillGuardScanPayload) -> Option<String> {
    let tokens = unique_skill_scan_tokens(payload);
    if tokens.is_empty() {
        return None;
    }

    let candidate_array = tokens
        .iter()
        .map(|token| shell_escape_posix_arg(token))
        .collect::<Vec<_>>()
        .join(" ");
    let script = format!(
        r#"
set -eu
candidates=({candidate_array})
roots=(
  "$HOME/.openclaw/skills"
  "$HOME/.openclaw/workspace/skills"
  "$HOME/.agents/skills"
  "$HOME/.codex/skills"
  "$HOME/.config/openclaw/skills"
)
lower() {{
  printf '%s' "$1" | tr '[:upper:]' '[:lower:]'
}}
for root in "${{roots[@]}}"; do
  [ -d "$root" ] || continue
  for token in "${{candidates[@]}}"; do
    [ -n "$token" ] || continue
    if [ -f "$root/$token/SKILL.md" ]; then
      printf '%s' "$root/$token"
      exit 0
    fi
    for entry in "$root"/*; do
      [ -d "$entry" ] || continue
      name="$(basename "$entry")"
      if [ "$(lower "$name")" = "$(lower "$token")" ] && [ -f "$entry/SKILL.md" ]; then
        printf '%s' "$entry"
        exit 0
      fi
    done
  done
done
exit 1
"#,
    );
    let output = run_wsl_shell(distro, script.trim(), None).ok()?;
    if output.code != 0 {
        return None;
    }
    let resolved = output.stdout.trim();
    if resolved.is_empty() {
        None
    } else {
        Some(resolved.to_string())
    }
}

fn map_skillguard_finding(raw: &serde_json::Value) -> Option<serde_json::Value> {
    let finding = raw.as_object()?;
    let mut mapped = serde_json::Map::new();
    mapped.insert(
        "dimension".to_string(),
        serde_json::Value::String(
            finding
                .get("dimension")
                .and_then(|value| value.as_str())
                .unwrap_or_default()
                .to_string(),
        ),
    );
    mapped.insert(
        "severity".to_string(),
        serde_json::Value::String(
            finding
                .get("severity")
                .and_then(|value| value.as_str())
                .unwrap_or("INFO")
                .to_string(),
        ),
    );
    mapped.insert(
        "filePath".to_string(),
        serde_json::Value::String(
            finding
                .get("file_path")
                .and_then(|value| value.as_str())
                .unwrap_or_default()
                .to_string(),
        ),
    );
    mapped.insert(
        "lineNumber".to_string(),
        finding
            .get("line_number")
            .cloned()
            .filter(|value| value.is_number())
            .unwrap_or(serde_json::Value::Null),
    );
    mapped.insert(
        "description".to_string(),
        serde_json::Value::String(
            finding
                .get("description")
                .and_then(|value| value.as_str())
                .unwrap_or_default()
                .to_string(),
        ),
    );
    for (source_key, target_key) in [
        ("pattern", "pattern"),
        ("reference", "reference"),
        ("remediation_en", "remediationEn"),
        ("remediation_zh", "remediationZh"),
    ] {
        if let Some(value) = finding.get(source_key).and_then(|value| value.as_str()) {
            mapped.insert(
                target_key.to_string(),
                serde_json::Value::String(value.to_string()),
            );
        }
    }
    Some(serde_json::Value::Object(mapped))
}

fn map_skillguard_report(raw: &serde_json::Value) -> Option<serde_json::Value> {
    let report = raw.as_object()?;
    let findings = report
        .get("findings")
        .and_then(|value| value.as_array())
        .map(|items| {
            items
                .iter()
                .filter_map(map_skillguard_finding)
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    let token_estimate = report
        .get("token_estimate")
        .and_then(|value| value.as_object());

    Some(serde_json::json!({
        "skillName": report.get("skill_name").and_then(|value| value.as_str()).unwrap_or(""),
        "skillPath": report.get("skill_path").and_then(|value| value.as_str()).unwrap_or(""),
        "riskScore": report.get("risk_score").and_then(|value| value.as_f64()).unwrap_or(0.0),
        "riskLevel": report.get("risk_level").and_then(|value| value.as_str()).unwrap_or("A"),
        "findings": findings,
        "tokenEstimate": {
            "l1SkillMd": token_estimate.and_then(|value| value.get("l1_skill_md")).and_then(|value| value.as_f64()).unwrap_or(0.0),
            "l2Eager": token_estimate.and_then(|value| value.get("l2_eager")).and_then(|value| value.as_f64()).unwrap_or(0.0),
            "l2Lazy": token_estimate.and_then(|value| value.get("l2_lazy")).and_then(|value| value.as_f64()).unwrap_or(0.0),
            "l3Total": token_estimate.and_then(|value| value.get("l3_total")).and_then(|value| value.as_f64()).unwrap_or(0.0),
        }
    }))
}

fn normalize_skillguard_scan_output(
    raw_output: &str,
    fallback_target: &str,
) -> Result<serde_json::Value, String> {
    let parsed = parse_json_lenient(raw_output)
        .ok_or_else(|| cmd_err_d("SKILLGUARD_INVALID_JSON", "Invalid SkillGuard JSON"))?;
    let summary = parsed
        .get("summary")
        .and_then(|value| value.as_object())
        .cloned()
        .unwrap_or_default();
    let report = parsed
        .get("reports")
        .and_then(|value| value.as_array())
        .and_then(|reports| reports.first())
        .and_then(map_skillguard_report);
    let findings = report
        .as_ref()
        .and_then(|value| value.get("findings"))
        .and_then(|value| value.as_array())
        .cloned()
        .unwrap_or_default();

    let mut severity_counts = serde_json::Map::new();
    for finding in &findings {
        let level = finding
            .get("severity")
            .and_then(|value| value.as_str())
            .unwrap_or("INFO")
            .to_ascii_uppercase();
        let current = severity_counts
            .get(&level)
            .and_then(|value| value.as_u64())
            .unwrap_or(0);
        severity_counts.insert(
            level,
            serde_json::Value::Number(serde_json::Number::from(current + 1)),
        );
    }

    Ok(serde_json::json!({
        "auditMetadata": {
            "toolVersion": parsed.get("audit_metadata").and_then(|value| value.get("tool_version")).and_then(|value| value.as_str()).unwrap_or(""),
            "timestamp": parsed.get("audit_metadata").and_then(|value| value.get("timestamp")).and_then(|value| value.as_str()).unwrap_or(""),
            "target": parsed.get("audit_metadata").and_then(|value| value.get("target")).and_then(|value| value.as_str()).unwrap_or(fallback_target),
        },
        "summary": {
            "totalSkills": summary.get("total_skills").and_then(|value| value.as_u64()).unwrap_or(0),
            "byLevel": summary.get("by_level").cloned().filter(|value| value.is_object()).unwrap_or_else(|| serde_json::json!({})),
        },
        "report": report.unwrap_or(serde_json::Value::Null),
        "severityCounts": serde_json::Value::Object(severity_counts),
        "totalFindings": findings.len(),
    }))
}

fn run_skillguard_scan_host(skill_dir: &Path) -> Result<serde_json::Value, String> {
    let skill_dir_string = skill_dir.to_string_lossy().to_string();
    let output = Command::new(resolve_system_command_path("npm"))
        .args([
            "exec",
            "--yes",
            "@clawmaster/skillguard-cli",
            "--",
            &skill_dir_string,
            "--json",
        ])
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .map_err(|e| cmd_err_d("SKILLGUARD_SCAN_FAILED", e))?;
    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    if !output.status.success() {
        let message = if !stderr.trim().is_empty() {
            stderr
        } else if !stdout.trim().is_empty() {
            stdout
        } else {
            format!("skillguard exited with code {:?}", output.status.code())
        };
        return Err(cmd_err_d("SKILLGUARD_SCAN_FAILED", message.trim()));
    }
    normalize_skillguard_scan_output(&format!("{stdout}\n{stderr}"), &skill_dir_string)
}

#[cfg(target_os = "windows")]
fn run_skillguard_scan_wsl(distro: &str, skill_dir: &str) -> Result<serde_json::Value, String> {
    let script = format!(
        "npm exec --yes @clawmaster/skillguard-cli -- {} --json",
        shell_escape_posix_arg(skill_dir),
    );
    let output = run_wsl_shell(distro, &script, None)?;
    if output.code != 0 {
        let message = if !output.stderr.trim().is_empty() {
            output.stderr
        } else if !output.stdout.trim().is_empty() {
            output.stdout
        } else {
            format!("skillguard exited with code {}", output.code)
        };
        return Err(cmd_err_d("SKILLGUARD_SCAN_FAILED", message.trim()));
    }
    normalize_skillguard_scan_output(&format!("{}\n{}", output.stdout, output.stderr), skill_dir)
}

fn managed_memory_runtime_data_root(
    profile_selection: &OpenclawProfileSelection,
) -> (
    String,
    String,
    Option<String>,
    String,
    String,
    String,
    String,
) {
    let host_platform = normalize_local_data_target_platform(std::env::consts::OS).to_string();
    let host_arch = normalize_arch_label(std::env::consts::ARCH);

    #[cfg(target_os = "windows")]
    if let Some(distro) = active_wsl_distro() {
        let home_dir = dirs::home_dir().unwrap_or_else(|| PathBuf::from("."));
        let data_root = managed_memory_windows_wsl_data_root(profile_selection, &home_dir);
        return (
            data_root,
            "wsl-managed".to_string(),
            Some(distro),
            "wsl2".to_string(),
            "linux".to_string(),
            host_platform,
            host_arch,
        );
    }

    let home_dir = dirs::home_dir().unwrap_or_else(|| PathBuf::from("."));
    (
        clawmaster_data_root_native(profile_selection, &home_dir)
            .to_string_lossy()
            .to_string(),
        "host-managed".to_string(),
        None,
        "native".to_string(),
        host_platform.clone(),
        host_platform,
        host_arch,
    )
}

fn build_managed_memory_store_context() -> ManagedMemoryStoreContextPayload {
    let profile_selection = get_openclaw_profile_selection();
    let profile_key = local_data_profile_key(&profile_selection);
    let (
        data_root,
        runtime_mode,
        selected_wsl_distro,
        runtime_target,
        target_platform,
        host_platform,
        host_arch,
    ) = managed_memory_runtime_data_root(&profile_selection);
    let engine = resolve_managed_memory_engine_for_desktop(&host_platform, &host_arch);
    let runtime_root = join_posix(&join_posix(&data_root, "memory"), "powermem");
    let legacy_db_path = join_posix(&runtime_root, "powermem.sqlite");
    let storage_path = if engine == "powermem-seekdb" {
        join_posix(&runtime_root, "seekdb")
    } else {
        legacy_db_path.clone()
    };

    ManagedMemoryStoreContextPayload {
        implementation: "powermem".to_string(),
        engine: engine.clone(),
        runtime_mode,
        runtime_target,
        host_platform,
        host_arch: host_arch.clone(),
        target_platform,
        target_arch: host_arch,
        selected_wsl_distro,
        profile_key,
        data_root,
        runtime_root,
        storage_path: storage_path.clone(),
        db_path: if engine == "powermem-sqlite" {
            Some(storage_path)
        } else {
            None
        },
        legacy_db_path,
    }
}

fn resolve_managed_memory_plugin_root_path() -> PathBuf {
    if let Some(packaged_root) = std::env::var_os("CLAWMASTER_PACKAGED_MEMORY_PLUGIN_ROOT") {
        let root = PathBuf::from(packaged_root);
        if root.join("openclaw.plugin.json").exists() {
            return root;
        }
    }
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .join("plugins")
        .join(MEMORY_BRIDGE_PLUGIN_ID)
}

fn normalize_comparable_plugin_path(value: &str) -> String {
    let mut normalized = value.trim().to_string();
    if normalized.is_empty() {
        return String::new();
    }
    for prefix in ["global:", "stock:", "file:"] {
        if normalized.to_ascii_lowercase().starts_with(prefix) {
            normalized = normalized[prefix.len()..].trim().to_string();
            break;
        }
    }
    normalized = normalized.replace('\\', "/");
    let lower_leaf = normalized
        .rsplit('/')
        .next()
        .unwrap_or("")
        .to_ascii_lowercase();
    if lower_leaf == "openclaw.plugin.json"
        || lower_leaf == "index.js"
        || lower_leaf == "index.mjs"
        || lower_leaf == "index.cjs"
        || lower_leaf == "index.ts"
    {
        if let Some(index) = normalized.rfind('/') {
            normalized.truncate(index);
        }
    }
    while normalized.ends_with('/') {
        normalized.pop();
    }
    let bytes = normalized.as_bytes();
    if bytes.len() >= 3 && bytes[1] == b':' && bytes[2] == b'/' {
        let mut chars = normalized.chars();
        if let Some(first) = chars.next() {
            normalized = first.to_ascii_lowercase().to_string() + chars.as_str();
        }
    }
    normalized
}

fn run_openclaw_command_with_stdin(
    args: &[String],
    stdin_payload: &str,
) -> Result<OpenclawCapturedOutput, String> {
    let mut command = openclaw_cmd();
    let mut child = command
        .args(args)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| cmd_err_d("OPENCLAW_CMD_SPAWN_FAILED", e))?;

    if let Some(mut stdin) = child.stdin.take() {
        stdin
            .write_all(stdin_payload.as_bytes())
            .map_err(|e| cmd_err_d("OPENCLAW_CMD_STDIN_WRITE_FAILED", e))?;
    }

    let output = child
        .wait_with_output()
        .map_err(|e| cmd_err_d("OPENCLAW_CMD_WAIT_FAILED", e))?;

    Ok(OpenclawCapturedOutput {
        code: output.status.code().unwrap_or(-1),
        stdout: String::from_utf8_lossy(&output.stdout).to_string(),
        stderr: String::from_utf8_lossy(&output.stderr).to_string(),
    })
}

#[derive(Debug, Clone)]
struct InstalledManagedMemoryPluginStatus {
    installed: bool,
    plugin_status: Option<String>,
    installed_plugin_path: Option<String>,
}

fn parse_openclaw_plugin_rows(raw: &str) -> Vec<serde_json::Value> {
    let Some(value) = parse_json_lenient(raw) else {
        return Vec::new();
    };
    if let Some(items) = value.as_array() {
        return items.clone();
    }
    for key in ["plugins", "items", "list"] {
        if let Some(items) = value.get(key).and_then(|item| item.as_array()) {
            return items.clone();
        }
    }
    Vec::new()
}

fn strip_ansi(raw: &str) -> String {
    let mut out = String::with_capacity(raw.len());
    let mut chars = raw.chars().peekable();
    while let Some(ch) = chars.next() {
        if ch == '\u{1b}' {
            if matches!(chars.peek(), Some('[')) {
                chars.next();
                while let Some(next) = chars.next() {
                    if ('@'..='~').contains(&next) {
                        break;
                    }
                }
                continue;
            }
        }
        out.push(ch);
    }
    out
}

fn line_has_table_pipe(line: &str) -> bool {
    line.contains('|') || line.contains('│') || line.contains('┃')
}

fn is_box_char(ch: char) -> bool {
    matches!(
        ch,
        '│' | '┃'
            | '┌'
            | '┐'
            | '└'
            | '┘'
            | '├'
            | '┤'
            | '┬'
            | '┴'
            | '┼'
            | '─'
            | '═'
            | '╌'
            | '┄'
            | '╔'
            | '╗'
            | '╚'
            | '╝'
            | '╠'
            | '╣'
            | '╦'
            | '╩'
            | '╬'
    )
}

fn split_pipe_row_preserving_cells(line: &str) -> Vec<String> {
    let mut cells = Vec::new();
    let mut current = String::new();
    for ch in line.chars() {
        if ch == '|' || ch == '│' || ch == '┃' {
            cells.push(current.trim().to_string());
            current.clear();
        } else if is_box_char(ch) {
            current.push(' ');
        } else {
            current.push(ch);
        }
    }
    cells.push(current.trim().to_string());
    let has_leading_pipe = line
        .trim_start()
        .chars()
        .next()
        .map(|ch| ch == '|' || ch == '│' || ch == '┃')
        .unwrap_or(false);
    let has_trailing_pipe = line
        .trim_end()
        .chars()
        .last()
        .map(|ch| ch == '|' || ch == '│' || ch == '┃')
        .unwrap_or(false);
    if !has_leading_pipe {
        cells.insert(0, String::new());
    }
    if !has_trailing_pipe {
        cells.push(String::new());
    }
    cells
}

fn looks_like_plugin_id(value: &str) -> bool {
    let trimmed = value.trim();
    if trimmed.is_empty() || trimmed.len() > 80 || trimmed.chars().any(char::is_whitespace) {
        return false;
    }
    trimmed
        .chars()
        .all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '.' | '_' | '-'))
}

fn extract_plugin_id_from_source_cell(source: &str) -> Option<String> {
    let trimmed = source.trim();
    for prefix in ["global:", "stock:"] {
        if let Some(rest) = trimmed.strip_prefix(prefix) {
            let slug = rest.split('/').next().unwrap_or("").trim();
            if looks_like_plugin_id(slug) {
                return Some(slug.to_string());
            }
        }
    }
    None
}

fn resolve_table_row_plugin_id(name: &str, id: &str, source: &str) -> Option<String> {
    let id_trim = id.trim();
    if looks_like_plugin_id(id_trim) {
        return Some(id_trim.to_string());
    }
    if let Some(from_source) = extract_plugin_id_from_source_cell(source) {
        return Some(from_source);
    }
    let name_trim = name.trim();
    if looks_like_plugin_id(name_trim) {
        return Some(name_trim.to_string());
    }
    None
}

fn merge_wrapped_plugin_name(prev: &str, next: &str) -> String {
    let prev_trim = prev.trim_end();
    let next_trim = next.trim();
    if next_trim.is_empty() {
        return prev_trim.to_string();
    }
    if prev_trim.ends_with('/') || prev_trim.ends_with('-') {
        format!("{prev_trim}{next_trim}")
    } else {
        format!("{prev_trim} {next_trim}").trim().to_string()
    }
}

fn row_is_table_separator(cells: &[String]) -> bool {
    let inner = if cells.len() > 2 {
        &cells[1..cells.len() - 1]
    } else {
        cells
    };
    if inner.is_empty() {
        return true;
    }
    inner.iter().all(|cell| {
        let trimmed = cell
            .chars()
            .filter(|ch| !ch.is_whitespace())
            .collect::<String>();
        trimmed.is_empty()
            || trimmed
                .chars()
                .all(|ch| matches!(ch, '-' | '─' | '═' | '┼' | '+'))
    })
}

fn find_openclaw_plugins_table_layout(
    lines: &[String],
) -> Option<(usize, usize, Option<usize>, usize)> {
    for (index, line) in lines.iter().enumerate() {
        if !line_has_table_pipe(line) {
            continue;
        }
        let cells = split_pipe_row_preserving_cells(line);
        if cells.len() < 6 {
            continue;
        }
        let c1 = cells
            .get(1)
            .map(|value| value.to_ascii_lowercase())
            .unwrap_or_default();
        let c2 = cells
            .get(2)
            .map(|value| value.to_ascii_lowercase())
            .unwrap_or_default();
        let c3 = cells
            .get(3)
            .map(|value| value.to_ascii_lowercase())
            .unwrap_or_default();
        let c4 = cells
            .get(4)
            .map(|value| value.to_ascii_lowercase())
            .unwrap_or_default();
        if c1 != "name" || c2 != "id" {
            continue;
        }
        if c3 == "format" && c4.starts_with("status") {
            return Some((index, 4, Some(5), 6));
        }
        if c3.starts_with("status") && c4 == "version" {
            return Some((index, 3, None, 4));
        }
        if c3.starts_with("status") {
            return Some((index, 3, Some(4), 5));
        }
    }
    None
}

fn parse_openclaw_plugin_rows_plain_text(raw: &str) -> Vec<serde_json::Value> {
    let lines = strip_ansi(raw)
        .lines()
        .map(|line| line.trim())
        .filter(|line| !line.is_empty())
        .map(|line| line.to_string())
        .collect::<Vec<_>>();

    let Some((header_idx, status_index, source_index, version_index)) =
        find_openclaw_plugins_table_layout(&lines)
    else {
        return Vec::new();
    };

    let mut rows = Vec::new();
    let mut current_name = String::new();
    let mut current_id = String::new();
    let mut current_status = String::new();
    let mut current_source = String::new();
    let mut current_version: Option<String> = None;
    let mut seen = std::collections::HashSet::new();

    let flush = |rows: &mut Vec<serde_json::Value>,
                 seen: &mut std::collections::HashSet<String>,
                 name: &mut String,
                 id: &mut String,
                 status: &mut String,
                 source: &mut String,
                 version: &mut Option<String>| {
        if id.is_empty() || seen.contains(id) {
            name.clear();
            id.clear();
            status.clear();
            source.clear();
            *version = None;
            return;
        }
        seen.insert(id.clone());
        rows.push(serde_json::json!({
            "id": id.clone(),
            "name": if name.is_empty() { id.clone() } else { name.clone() },
            "status": if status.is_empty() { serde_json::Value::Null } else { serde_json::Value::String(status.clone()) },
            "source": if source.is_empty() { serde_json::Value::Null } else { serde_json::Value::String(source.clone()) },
            "version": version.clone(),
        }));
        name.clear();
        id.clear();
        status.clear();
        source.clear();
        *version = None;
    };

    for line in lines.iter().skip(header_idx + 1) {
        if !line_has_table_pipe(line) {
            continue;
        }
        let cells = split_pipe_row_preserving_cells(line);
        if cells.len() <= status_index
            || cells.len() <= version_index
            || row_is_table_separator(&cells)
        {
            continue;
        }
        if let Some(source_index) = source_index {
            if cells.len() <= source_index {
                continue;
            }
        }

        let name = cells.get(1).map(String::as_str).unwrap_or("").trim();
        let id = cells.get(2).map(String::as_str).unwrap_or("").trim();
        let status_cell = cells
            .get(status_index)
            .map(String::as_str)
            .unwrap_or("")
            .trim();
        let source = source_index
            .and_then(|index| cells.get(index))
            .map(String::as_str)
            .unwrap_or("")
            .trim();
        let version_cell = cells
            .get(version_index)
            .map(String::as_str)
            .unwrap_or("")
            .trim();

        if !current_id.is_empty() && status_cell.is_empty() {
            if !name.is_empty() {
                current_name = merge_wrapped_plugin_name(&current_name, name);
            }
            if !id.is_empty() && current_id.len() + id.len() <= 80 {
                let merged = format!("{current_id}{id}");
                if looks_like_plugin_id(&merged) {
                    current_id = merged;
                }
            }
            if !source.is_empty() {
                if current_source.is_empty() {
                    current_source = source.to_string();
                } else {
                    current_source = merge_wrapped_plugin_name(&current_source, source);
                }
            }
            if current_version.is_none() && !version_cell.is_empty() {
                current_version = Some(version_cell.to_string());
            }
            continue;
        }

        if status_cell.is_empty() {
            continue;
        }

        let Some(resolved_id) = resolve_table_row_plugin_id(name, id, source) else {
            continue;
        };
        if name.is_empty() && id.is_empty() && source.is_empty() {
            continue;
        }

        flush(
            &mut rows,
            &mut seen,
            &mut current_name,
            &mut current_id,
            &mut current_status,
            &mut current_source,
            &mut current_version,
        );
        current_name = if name.is_empty() {
            resolved_id.clone()
        } else {
            name.to_string()
        };
        current_id = resolved_id;
        current_status = status_cell.to_string();
        current_source = source.to_string();
        current_version = if version_cell.is_empty() {
            None
        } else {
            Some(version_cell.to_string())
        };
    }

    flush(
        &mut rows,
        &mut seen,
        &mut current_name,
        &mut current_id,
        &mut current_status,
        &mut current_source,
        &mut current_version,
    );

    rows
}

fn resolve_installed_plugin_path(plugin: &serde_json::Value) -> Option<String> {
    let source_candidate = plugin
        .get("source")
        .or_else(|| plugin.get("sourcePath"))
        .or_else(|| plugin.get("path"))
        .and_then(|value| value.as_str());
    let description_candidate = plugin.get("description").and_then(|value| value.as_str());

    source_candidate
        .or_else(|| {
            let description = description_candidate?.trim();
            let looks_path_like = description.starts_with('/')
                || description.starts_with("./")
                || description.starts_with("../")
                || description.starts_with("~/")
                || description.starts_with("global:")
                || description.starts_with("stock:")
                || description.starts_with("file:")
                || description
                    .as_bytes()
                    .get(1)
                    .copied()
                    .map(|byte| byte == b':')
                    .unwrap_or(false);
            if looks_path_like {
                Some(description)
            } else {
                None
            }
        })
        .map(normalize_comparable_plugin_path)
        .filter(|value| !value.is_empty())
}

fn get_installed_managed_memory_plugin_status() -> InstalledManagedMemoryPluginStatus {
    let captured = match run_openclaw_command_captured(vec![
        "plugins".to_string(),
        "list".to_string(),
        "--json".to_string(),
    ]) {
        Ok(value) => value,
        Err(_) => {
            return InstalledManagedMemoryPluginStatus {
                installed: false,
                plugin_status: None,
                installed_plugin_path: None,
            }
        }
    };

    let mut rows = parse_openclaw_plugin_rows(&captured.stdout);
    if rows.is_empty() {
        rows = parse_openclaw_plugin_rows(&captured.stderr);
    }
    if rows.is_empty() {
        if let Ok(plain_text) =
            run_openclaw_command_captured(vec!["plugins".to_string(), "list".to_string()])
        {
            rows = parse_openclaw_plugin_rows_plain_text(&plain_text.stdout);
            if rows.is_empty() {
                let combined = [plain_text.stdout, plain_text.stderr]
                    .into_iter()
                    .filter(|part| !part.trim().is_empty())
                    .collect::<Vec<_>>()
                    .join("\n");
                rows = parse_openclaw_plugin_rows_plain_text(&combined);
            }
        }
    }
    let plugin = rows.into_iter().find(|row| {
        row.get("id")
            .and_then(|value| value.as_str())
            .map(|value| value.trim() == MEMORY_BRIDGE_PLUGIN_ID)
            .unwrap_or(false)
    });

    InstalledManagedMemoryPluginStatus {
        installed: plugin.is_some(),
        plugin_status: plugin
            .as_ref()
            .and_then(|row| row.get("status"))
            .and_then(|value| value.as_str())
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty()),
        installed_plugin_path: plugin.as_ref().and_then(resolve_installed_plugin_path),
    }
}

fn is_managed_memory_bridge_plugin_ready(plugin_status: Option<&str>) -> bool {
    matches!(
        plugin_status
            .map(|value| value.trim().to_ascii_lowercase())
            .as_deref(),
        Some("loaded") | Some("enabled") | Some("active") | Some("ready") | Some("ok")
    )
}

fn managed_memory_bridge_plugin_issue(
    installed: bool,
    plugin_status: Option<&str>,
) -> Option<String> {
    if !installed {
        return Some(format!(
            "{MEMORY_BRIDGE_PLUGIN_ID} is not installed in OpenClaw yet."
        ));
    }
    if is_managed_memory_bridge_plugin_ready(plugin_status) {
        return None;
    }
    if let Some(status) = plugin_status {
        return Some(format!(
            "{MEMORY_BRIDGE_PLUGIN_ID} is installed but currently {}.",
            status.trim()
        ));
    }
    Some(format!(
        "{MEMORY_BRIDGE_PLUGIN_ID} is installed but its runtime status is unknown."
    ))
}

fn managed_memory_bridge_plugin_path_issue(
    installed: bool,
    installed_plugin_path: Option<&str>,
    runtime_plugin_path: Option<&str>,
) -> Option<String> {
    if !installed {
        return None;
    }
    let runtime = runtime_plugin_path.map(normalize_comparable_plugin_path)?;
    let Some(installed) = installed_plugin_path
        .map(normalize_comparable_plugin_path)
        .filter(|value| !value.is_empty())
    else {
        return Some(format!(
            "{MEMORY_BRIDGE_PLUGIN_ID} is installed but its linked source path is unknown."
        ));
    };
    if installed == runtime {
        None
    } else {
        Some(format!(
            "{MEMORY_BRIDGE_PLUGIN_ID} is linked to {installed} instead of {runtime}."
        ))
    }
}

fn normalize_managed_memory_bridge_entry(
    value: Option<&serde_json::Value>,
) -> Option<ManagedMemoryBridgeEntryPayload> {
    let value = value?.as_object()?;
    let config = value.get("config")?.as_object()?;
    let data_root = config.get("dataRoot")?.as_str()?.trim().to_string();
    if data_root.is_empty() {
        return None;
    }
    Some(ManagedMemoryBridgeEntryPayload {
        enabled: value
            .get("enabled")
            .and_then(|item| item.as_bool())
            .unwrap_or(true),
        config: ManagedMemoryBridgeConfigPayload {
            data_root,
            engine: config
                .get("engine")
                .and_then(|item| item.as_str())
                .map(|item| {
                    if item == "powermem-seekdb" {
                        "powermem-seekdb".to_string()
                    } else {
                        "powermem-sqlite".to_string()
                    }
                })
                .unwrap_or_else(|| "powermem-sqlite".to_string()),
            auto_capture: config
                .get("autoCapture")
                .and_then(|item| item.as_bool())
                .unwrap_or(true),
            auto_recall: config
                .get("autoRecall")
                .and_then(|item| item.as_bool())
                .unwrap_or(true),
            infer_on_add: config
                .get("inferOnAdd")
                .and_then(|item| item.as_bool())
                .unwrap_or(false),
            recall_limit: config
                .get("recallLimit")
                .and_then(|item| item.as_u64())
                .map(|item| item.clamp(1, 100) as u32)
                .unwrap_or(5),
            recall_score_threshold: config
                .get("recallScoreThreshold")
                .and_then(|item| item.as_f64())
                .map(|item| item.clamp(0.0, 1.0))
                .unwrap_or(0.0),
            user_id: config
                .get("userId")
                .and_then(|item| item.as_str())
                .map(|item| item.trim().to_string())
                .filter(|item| !item.is_empty()),
            agent_id: config
                .get("agentId")
                .and_then(|item| item.as_str())
                .map(|item| item.trim().to_string())
                .filter(|item| !item.is_empty()),
        },
    })
}

fn managed_memory_bridge_entries_match(
    left: Option<&ManagedMemoryBridgeEntryPayload>,
    right: &ManagedMemoryBridgeEntryPayload,
) -> bool {
    let Some(left) = left else {
        return false;
    };
    left.enabled == right.enabled
        && left.config.data_root == right.config.data_root
        && left.config.engine == right.config.engine
        && left.config.auto_capture == right.config.auto_capture
        && left.config.auto_recall == right.config.auto_recall
        && left.config.infer_on_add == right.config.infer_on_add
        && left.config.recall_limit == right.config.recall_limit
        && (left.config.recall_score_threshold - right.config.recall_score_threshold).abs()
            < f64::EPSILON
        && left.config.user_id == right.config.user_id
        && left.config.agent_id == right.config.agent_id
}

fn build_managed_memory_bridge_entry() -> ManagedMemoryBridgeEntryPayload {
    let store = build_managed_memory_store_context();
    ManagedMemoryBridgeEntryPayload {
        enabled: true,
        config: ManagedMemoryBridgeConfigPayload {
            data_root: store.data_root,
            engine: store.engine,
            auto_capture: true,
            auto_recall: true,
            infer_on_add: false,
            recall_limit: 5,
            recall_score_threshold: 0.0,
            user_id: None,
            agent_id: None,
        },
    }
}

fn resolve_managed_memory_bridge_runtime_paths(
) -> (String, String, Option<String>, Option<String>, PathBuf) {
    let host_plugin_path = resolve_managed_memory_plugin_root_path();
    let host_plugin_path_string = host_plugin_path.to_string_lossy().to_string();
    let store = build_managed_memory_store_context();

    #[cfg(target_os = "windows")]
    if store.runtime_target == "wsl2" {
        return (
            host_plugin_path_string.clone(),
            host_plugin_path
                .join("openclaw.plugin.json")
                .to_string_lossy()
                .to_string(),
            windows_path_to_wsl_path(&host_plugin_path_string),
            windows_path_to_wsl_path(&store.data_root),
            host_plugin_path,
        );
    }

    (
        host_plugin_path_string.clone(),
        host_plugin_path
            .join("openclaw.plugin.json")
            .to_string_lossy()
            .to_string(),
        Some(host_plugin_path_string),
        Some(store.data_root),
        host_plugin_path,
    )
}

fn read_config_json_or_empty() -> serde_json::Value {
    let config_path = get_config_path();
    let Some(content) = read_active_openclaw_text_file(&config_path).ok().flatten() else {
        return serde_json::json!({});
    };
    serde_json::from_str(&content).unwrap_or_else(|_| serde_json::json!({}))
}

fn write_config_json(config_root: &serde_json::Value) -> Result<(), String> {
    let config_path = get_config_path();
    let content = serde_json::to_string_pretty(config_root)
        .map_err(|e| cmd_err_d("CONFIG_SERIALIZE_FAILED", e))?;
    write_active_openclaw_text_file(&config_path, &content)
}

fn get_current_managed_memory_bridge_state(
    config_root: &serde_json::Value,
) -> (Option<String>, Option<ManagedMemoryBridgeEntryPayload>) {
    let plugins = config_root
        .get("plugins")
        .and_then(|value| value.as_object());
    let slots = plugins
        .and_then(|value| value.get("slots"))
        .and_then(|value| value.as_object());
    let entries = plugins
        .and_then(|value| value.get("entries"))
        .and_then(|value| value.as_object());
    let current_slot_value = slots
        .and_then(|value| value.get(MEMORY_BRIDGE_SLOT_KEY))
        .and_then(|value| value.as_str())
        .map(|value| value.to_string());
    let current_entry = entries
        .and_then(|value| value.get(MEMORY_BRIDGE_PLUGIN_ID))
        .and_then(|value| normalize_managed_memory_bridge_entry(Some(value)));
    (current_slot_value, current_entry)
}

fn set_managed_memory_bridge_config(
    config_root: &mut serde_json::Value,
    desired_entry: &ManagedMemoryBridgeEntryPayload,
) {
    if !config_root.is_object() {
        *config_root = serde_json::json!({});
    }
    let root = config_root.as_object_mut().expect("config object");
    if !root.contains_key("plugins") || !root.get("plugins").is_some_and(|value| value.is_object())
    {
        root.insert("plugins".to_string(), serde_json::json!({}));
    }
    let plugins = root
        .get_mut("plugins")
        .and_then(|value| value.as_object_mut())
        .expect("plugins object");
    if !plugins.contains_key("slots")
        || !plugins.get("slots").is_some_and(|value| value.is_object())
    {
        plugins.insert("slots".to_string(), serde_json::json!({}));
    }
    if !plugins.contains_key("entries")
        || !plugins
            .get("entries")
            .is_some_and(|value| value.is_object())
    {
        plugins.insert("entries".to_string(), serde_json::json!({}));
    }
    let slots = plugins
        .get_mut("slots")
        .and_then(|value| value.as_object_mut())
        .expect("slots object");
    slots.insert(
        MEMORY_BRIDGE_SLOT_KEY.to_string(),
        serde_json::Value::String(MEMORY_BRIDGE_PLUGIN_ID.to_string()),
    );
    let entries = plugins
        .get_mut("entries")
        .and_then(|value| value.as_object_mut())
        .expect("entries object");
    entries.insert(
        MEMORY_BRIDGE_PLUGIN_ID.to_string(),
        serde_json::to_value(desired_entry).unwrap_or_else(|_| serde_json::json!({})),
    );
}

fn get_managed_memory_bridge_status_payload() -> Result<ManagedMemoryBridgeStatusPayload, String> {
    let store = build_managed_memory_store_context();
    let desired_entry = build_managed_memory_bridge_entry();
    let (
        plugin_path,
        plugin_manifest_path,
        runtime_plugin_path,
        runtime_data_root,
        _host_plugin_path,
    ) = resolve_managed_memory_bridge_runtime_paths();
    let plugin_path_exists = PathBuf::from(&plugin_manifest_path).exists();
    let config_root = read_config_json_or_empty();
    let (current_slot_value, current_entry) = get_current_managed_memory_bridge_state(&config_root);
    let installed_status = get_installed_managed_memory_plugin_status();
    let mut desired_entry = desired_entry;
    if let Some(runtime_data_root) = runtime_data_root {
        desired_entry.config.data_root = runtime_data_root;
    }

    let mut issues = Vec::new();
    if !plugin_path_exists {
        issues.push(
            "The managed PowerMem plugin files are missing from the ClawMaster package."
                .to_string(),
        );
    }
    if let Some(plugin_issue) = managed_memory_bridge_plugin_issue(
        installed_status.installed,
        installed_status.plugin_status.as_deref(),
    ) {
        issues.push(plugin_issue);
    }
    let plugin_path_issue = managed_memory_bridge_plugin_path_issue(
        installed_status.installed,
        installed_status.installed_plugin_path.as_deref(),
        runtime_plugin_path.as_deref(),
    );
    if let Some(issue) = plugin_path_issue.clone() {
        issues.push(issue);
    }
    if current_slot_value.as_deref() != Some(MEMORY_BRIDGE_PLUGIN_ID) {
        issues.push(format!(
            "plugins.slots.{MEMORY_BRIDGE_SLOT_KEY} is not set to {MEMORY_BRIDGE_PLUGIN_ID}"
        ));
    }
    if current_entry.is_none() {
        issues.push(format!(
            "plugins.entries.{MEMORY_BRIDGE_PLUGIN_ID} is missing or invalid"
        ));
    } else if !managed_memory_bridge_entries_match(current_entry.as_ref(), &desired_entry) {
        issues.push(format!(
            "plugins.entries.{MEMORY_BRIDGE_PLUGIN_ID} does not match the ClawMaster-managed config"
        ));
    }

    let state = if runtime_plugin_path.is_none() || !plugin_path_exists {
        "unsupported".to_string()
    } else if installed_status.installed
        && is_managed_memory_bridge_plugin_ready(installed_status.plugin_status.as_deref())
        && plugin_path_issue.is_none()
        && current_slot_value.as_deref() == Some(MEMORY_BRIDGE_PLUGIN_ID)
        && managed_memory_bridge_entries_match(current_entry.as_ref(), &desired_entry)
    {
        "ready".to_string()
    } else if current_entry.is_some() || current_slot_value.is_some() || installed_status.installed
    {
        "drifted".to_string()
    } else {
        "missing".to_string()
    };

    Ok(ManagedMemoryBridgeStatusPayload {
        plugin_id: MEMORY_BRIDGE_PLUGIN_ID.to_string(),
        slot_key: MEMORY_BRIDGE_SLOT_KEY.to_string(),
        state,
        issues,
        installed: installed_status.installed,
        plugin_status: installed_status.plugin_status,
        installed_plugin_path: installed_status.installed_plugin_path,
        runtime_plugin_path,
        plugin_path,
        plugin_path_exists,
        store,
        current_slot_value,
        current_entry,
        desired: ManagedMemoryBridgeDesiredPayload {
            slot_value: MEMORY_BRIDGE_PLUGIN_ID.to_string(),
            entry: Some(desired_entry),
        },
    })
}

fn run_openclaw_plugins_command_with_optional_confirm(
    args: Vec<String>,
    require_confirm: bool,
) -> Result<(), String> {
    let captured = if require_confirm {
        run_openclaw_command_with_stdin(&args, "y\n")?
    } else {
        run_openclaw_command_captured(args)?
    };
    if captured.code == 0 {
        Ok(())
    } else {
        Err(cmd_err_d(
            "OPENCLAW_CMD_FAILED",
            captured.stderr.trim().to_string() + captured.stdout.trim(),
        ))
    }
}

fn managed_memory_bridge_post_sync_commands() -> Vec<Vec<String>> {
    vec![
        vec!["ltm".to_string(), "import".to_string()],
        vec![
            "memory".to_string(),
            "index".to_string(),
            "--force".to_string(),
            "--verbose".to_string(),
        ],
    ]
}

fn run_managed_memory_bridge_post_sync_command(args: Vec<String>) -> Result<(), String> {
    match run_openclaw_plugins_command_with_optional_confirm(args.clone(), false) {
        Ok(()) => Ok(()),
        Err(error)
            if args.first().map(String::as_str) == Some("memory")
                && should_ignore_managed_memory_bridge_reindex_error(&error) =>
        {
            Ok(())
        }
        Err(error) => Err(error),
    }
}

#[tauri::command]
fn get_managed_memory_bridge_status() -> Result<ManagedMemoryBridgeStatusPayload, String> {
    get_managed_memory_bridge_status_payload()
}

#[tauri::command]
fn sync_managed_memory_bridge() -> Result<ManagedMemoryBridgeStatusPayload, String> {
    let (
        _plugin_path,
        plugin_manifest_path,
        runtime_plugin_path,
        runtime_data_root,
        _host_plugin_path,
    ) = resolve_managed_memory_bridge_runtime_paths();
    let runtime_plugin_path = runtime_plugin_path.ok_or_else(|| {
        cmd_err_d(
            "MANAGED_MEMORY_BRIDGE_UNSUPPORTED",
            "Runtime plugin path is unavailable",
        )
    })?;
    if !PathBuf::from(&plugin_manifest_path).exists() {
        return Err(cmd_err("MANAGED_MEMORY_BRIDGE_PLUGIN_MISSING"));
    }

    let status = get_managed_memory_bridge_status_payload()?;
    let path_issue = managed_memory_bridge_plugin_path_issue(
        status.installed,
        status.installed_plugin_path.as_deref(),
        Some(&runtime_plugin_path),
    );

    if status.installed && path_issue.is_some() {
        let _ = run_openclaw_plugins_command_with_optional_confirm(
            vec![
                "plugins".to_string(),
                "disable".to_string(),
                MEMORY_BRIDGE_PLUGIN_ID.to_string(),
            ],
            false,
        );
        run_openclaw_plugins_command_with_optional_confirm(
            vec![
                "plugins".to_string(),
                "uninstall".to_string(),
                MEMORY_BRIDGE_PLUGIN_ID.to_string(),
                "--keep-files".to_string(),
            ],
            true,
        )?;
    }

    if !status.installed || path_issue.is_some() {
        run_openclaw_plugins_command_with_optional_confirm(
            vec![
                "plugins".to_string(),
                "install".to_string(),
                "-l".to_string(),
                runtime_plugin_path.clone(),
            ],
            true,
        )?;
    }

    let mut config_root = read_config_json_or_empty();
    let mut desired_entry = build_managed_memory_bridge_entry();
    if let Some(runtime_data_root) = runtime_data_root {
        desired_entry.config.data_root = runtime_data_root;
    }
    set_managed_memory_bridge_config(&mut config_root, &desired_entry);
    write_config_json(&config_root)?;

    if status.installed && path_issue.is_none() {
        let _ = run_openclaw_plugins_command_with_optional_confirm(
            vec![
                "plugins".to_string(),
                "disable".to_string(),
                MEMORY_BRIDGE_PLUGIN_ID.to_string(),
            ],
            false,
        );
    }
    run_openclaw_plugins_command_with_optional_confirm(
        vec![
            "plugins".to_string(),
            "enable".to_string(),
            MEMORY_BRIDGE_PLUGIN_ID.to_string(),
        ],
        false,
    )?;
    for args in managed_memory_bridge_post_sync_commands() {
        run_managed_memory_bridge_post_sync_command(args)?;
    }

    get_managed_memory_bridge_status_payload()
}

#[tauri::command]
fn search_openclaw_memory_fallback(
    query: String,
    agent: Option<String>,
    max_results: Option<usize>,
) -> Result<Vec<OpenclawMemorySearchHit>, String> {
    let trimmed = query.trim();
    if trimmed.is_empty() {
        return Ok(vec![]);
    }

    let status_output = openclaw_cmd()
        .args(["memory", "status", "--json"])
        .output()
        .map_err(|e| cmd_err_d("OPENCLAW_CMD_SPAWN_FAILED", e))?;
    let status_stdout = String::from_utf8_lossy(&status_output.stdout).to_string();
    let workspace_dirs =
        extract_workspace_dirs_from_memory_status(&status_stdout, agent.as_deref());
    let mut markdown_files = Vec::new();
    for workspace_dir in workspace_dirs {
        let root_memory_file = workspace_dir.join("MEMORY.md");
        if root_memory_file.is_file() {
            markdown_files.push(root_memory_file);
        }
        collect_markdown_files(&workspace_dir.join("memory"), &mut markdown_files)?;
    }

    let limit = max_results.unwrap_or(20).clamp(1, 100);
    let mut hits: Vec<(usize, OpenclawMemorySearchHit)> = Vec::new();
    for file in markdown_files {
        let Ok(content) = fs::read_to_string(&file) else {
            continue;
        };
        let path_text = file.to_string_lossy().to_string();
        let total_matches =
            count_occurrences(&content, trimmed) + count_occurrences(&path_text, trimmed);
        if total_matches == 0 {
            continue;
        }
        let snippet = extract_search_snippet(&content, trimmed);
        hits.push((
            total_matches,
            OpenclawMemorySearchHit {
                id: path_text.clone(),
                content: if snippet.is_empty() {
                    path_text.clone()
                } else {
                    snippet
                },
                score: Some(total_matches as f64),
                path: Some(path_text),
            },
        ));
    }

    hits.sort_by(|a, b| b.0.cmp(&a.0).then_with(|| a.1.id.cmp(&b.1.id)));
    Ok(hits.into_iter().take(limit).map(|(_, hit)| hit).collect())
}

#[tauri::command]
fn get_openclaw_memory_search_capability() -> Result<OpenclawMemorySearchCapabilityPayload, String>
{
    let output = openclaw_cmd()
        .args([
            "memory",
            "search",
            "--json",
            "--max-results",
            "1",
            "--query",
            "__clawmaster_probe__",
        ])
        .output()
        .map_err(|e| cmd_err_d("OPENCLAW_CMD_SPAWN_FAILED", e))?;

    Ok(resolve_openclaw_memory_search_capability_from_output(
        output.status.code().unwrap_or(-1),
        &String::from_utf8_lossy(&output.stdout),
        &String::from_utf8_lossy(&output.stderr),
    ))
}

#[tauri::command]
fn reindex_openclaw_memory() -> Result<OpenclawMemoryReindexPayload, String> {
    let output = openclaw_cmd()
        .args(["memory", "index", "--force", "--verbose"])
        .output()
        .map_err(|e| cmd_err_d("OPENCLAW_CMD_SPAWN_FAILED", e))?;
    let exit_code = output.status.code().unwrap_or(-1);
    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    if !output.status.success() {
        if stderr.trim().is_empty() {
            return Err(cmd_err_d("OPENCLAW_MEMORY_REINDEX_FAILED", stdout.trim()));
        }
        return Err(cmd_err_stderr(
            "OPENCLAW_MEMORY_REINDEX_FAILED",
            stderr.trim(),
        ));
    }

    Ok(OpenclawMemoryReindexPayload {
        exit_code,
        stdout,
        stderr: if stderr.trim().is_empty() {
            None
        } else {
            Some(stderr)
        },
    })
}

#[cfg(test)]
mod tests {
    #[cfg(target_os = "windows")]
    use super::build_wsl_clawprobe_command_script;
    use super::{
        build_clawprobe_config_override, build_clawprobe_custom_prices_from_models_dev_catalog,
        build_clawprobe_env_overrides, build_paddleocr_request_json, create_runtime_temp_dir,
        decode_base64_standard, encode_base64_standard, get_config_path_candidates_for,
        get_openclaw_profile_args, get_openclaw_profile_data_dir, install_bundled_skill,
        local_data_profile_key, managed_memory_windows_wsl_data_root,
        normalize_clawmaster_runtime_selection, normalize_local_data_target_platform,
        parse_http_status_output, parse_json_lenient, parse_models_dev_fetched_at,
        parse_node_major, parse_wsl_list_verbose, repo_bundled_skill_root, repo_plugin_root,
        resolve_config_path_from_candidates, resolve_local_data_status, resolve_plugin_root,
        resolve_selected_wsl_distro_from_list, supports_seekdb_embedded,
        sync_installed_bundled_skills, OpenclawProfileSelection,
    };
    use std::fs;
    use std::path::Path;
    use std::path::PathBuf;
    use std::sync::{Mutex, OnceLock};
    use std::time::{SystemTime, UNIX_EPOCH};

    static TEST_ENV_MUTEX: OnceLock<Mutex<()>> = OnceLock::new();

    fn lock_test_env() -> std::sync::MutexGuard<'static, ()> {
        TEST_ENV_MUTEX
            .get_or_init(|| Mutex::new(()))
            .lock()
            .expect("test env mutex should not be poisoned")
    }

    fn unique_test_dir(label: &str) -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock should be after unix epoch")
            .as_nanos();
        std::env::temp_dir().join(format!(
            "clawmaster-config-path-{label}-{}-{nanos}",
            std::process::id()
        ))
    }

    #[test]
    fn decode_base64_standard_round_trips_binary_payloads() {
        assert_eq!(decode_base64_standard("").expect("empty"), Vec::<u8>::new());
        assert_eq!(
            decode_base64_standard("aGVsbG8=").expect("hello"),
            b"hello".to_vec()
        );
        // Bytes that would collide with Windows stdout newline translation
        // (0x0A, 0x0D) must survive the base64 round-trip verbatim.
        let binary: Vec<u8> = (0u8..=255u8).collect();
        let encoded = encode_base64_standard(&binary);
        assert_eq!(
            decode_base64_standard(&encoded).expect("round trip"),
            binary
        );
        // Whitespace from `tr -d '\n'` remnants or stdout framing is tolerated.
        assert_eq!(
            decode_base64_standard("aGVsbG8=\n").expect("trailing newline"),
            b"hello".to_vec()
        );
        assert!(decode_base64_standard("aGVsbG8").is_err());
        assert!(decode_base64_standard("aGVsb@8=").is_err());
    }

    #[test]
    fn paddleocr_request_json_keeps_large_base64_payload_in_json_body() {
        let payload = super::PaddleOcrPayload {
            endpoint: "https://example.com/layout-parsing".to_string(),
            access_token: "token".to_string(),
            file: Some("a".repeat(2 * 1024 * 1024)),
            file_type: Some(0),
            use_doc_orientation_classify: Some(true),
            use_doc_unwarping: None,
            use_layout_detection: None,
            use_chart_recognition: None,
            restructure_pages: None,
            merge_tables: None,
            relevel_titles: None,
            prettify_markdown: None,
            visualize: Some(false),
        };

        let json = build_paddleocr_request_json(&payload, "fallback", false)
            .expect("json body should build");
        assert!(json.len() > 2 * 1024 * 1024);
        assert!(json.contains("\"fileType\":0"));
    }

    #[test]
    fn runtime_temp_dirs_are_unique_across_back_to_back_calls() {
        let first = create_runtime_temp_dir("test").expect("first temp dir should be created");
        let second = create_runtime_temp_dir("test").expect("second temp dir should be created");

        assert_ne!(first, second);
        assert!(first.exists());
        assert!(second.exists());

        let _ = fs::remove_dir_all(first);
        let _ = fs::remove_dir_all(second);
    }

    #[test]
    fn parse_http_status_output_extracts_body_and_status() {
        let (body, status) = parse_http_status_output("{\"ok\":true}\n__CLAWMASTER_STATUS__:200");
        assert_eq!(body, "{\"ok\":true}");
        assert_eq!(status, 200);
    }

    #[test]
    fn windows_candidates_prefer_home_before_roaming() {
        let home_dir = PathBuf::from(r"C:\Users\alice");
        let config_dir = PathBuf::from(r"C:\Users\alice\AppData\Roaming");

        let candidates = get_config_path_candidates_for(true, home_dir.clone(), config_dir.clone());

        assert_eq!(
            candidates,
            vec![
                home_dir.join(".openclaw").join("openclaw.json"),
                config_dir.join("openclaw").join("openclaw.json"),
            ]
        );
    }

    #[test]
    fn windows_resolver_uses_roaming_when_home_config_is_missing() {
        let root = unique_test_dir("roaming-fallback");
        let home_candidate = root.join("home").join(".openclaw").join("openclaw.json");
        let roaming_candidate = root.join("roaming").join("openclaw").join("openclaw.json");

        fs::create_dir_all(
            roaming_candidate
                .parent()
                .expect("roaming parent should exist"),
        )
        .expect("should create roaming dir");
        fs::write(&roaming_candidate, b"{}").expect("should create roaming config");

        let resolved = resolve_config_path_from_candidates(&[
            home_candidate.clone(),
            roaming_candidate.clone(),
        ]);

        assert_eq!(resolved, roaming_candidate);

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn windows_resolver_defaults_to_home_when_nothing_exists() {
        let candidates = get_config_path_candidates_for(
            true,
            PathBuf::from(r"C:\Users\alice"),
            PathBuf::from(r"C:\Users\alice\AppData\Roaming"),
        );

        let resolved = resolve_config_path_from_candidates(&candidates);

        assert_eq!(resolved, candidates[0]);
    }

    #[test]
    fn dev_profile_uses_dev_flag_and_dev_directory() {
        let selection = OpenclawProfileSelection {
            kind: "dev".to_string(),
            name: None,
        };

        assert_eq!(
            get_openclaw_profile_args(&selection),
            vec!["--dev".to_string()]
        );
        assert_eq!(
            get_openclaw_profile_data_dir(&selection, Path::new("/Users/alice"))
                .expect("dev dir should resolve"),
            PathBuf::from("/Users/alice/.openclaw-dev")
        );
    }

    #[test]
    fn named_profile_uses_profile_flag_and_named_directory() {
        let selection = OpenclawProfileSelection {
            kind: "named".to_string(),
            name: Some("team-a".to_string()),
        };

        assert_eq!(
            get_openclaw_profile_args(&selection),
            vec!["--profile".to_string(), "team-a".to_string()]
        );
        assert_eq!(
            get_openclaw_profile_data_dir(&selection, Path::new("/home/alice"))
                .expect("named dir should resolve"),
            PathBuf::from("/home/alice/.openclaw-team-a")
        );
    }

    #[test]
    fn local_data_profile_key_is_stable_for_profile_scopes() {
        assert_eq!(
            local_data_profile_key(&OpenclawProfileSelection {
                kind: "default".to_string(),
                name: None,
            }),
            "default"
        );
        assert_eq!(
            local_data_profile_key(&OpenclawProfileSelection {
                kind: "named".to_string(),
                name: Some("team-a".to_string()),
            }),
            "named:team-a"
        );
    }

    #[test]
    fn seekdb_embedded_support_matrix_matches_upstream_bindings() {
        assert!(supports_seekdb_embedded("linux", "x64"));
        assert!(supports_seekdb_embedded("linux", "arm64"));
        assert!(supports_seekdb_embedded("darwin", "arm64"));
        assert!(supports_seekdb_embedded("macos", "arm64"));
        assert_eq!(normalize_local_data_target_platform("macos"), "darwin");
        assert!(!supports_seekdb_embedded("darwin", "x64"));
        assert!(!supports_seekdb_embedded("windows", "x64"));
    }

    #[test]
    fn parse_node_major_supports_standard_node_versions() {
        assert_eq!(parse_node_major("v20.11.1"), Some(20));
        assert_eq!(parse_node_major("18.19.0"), Some(18));
        assert_eq!(parse_node_major(""), None);
    }

    #[test]
    fn local_data_status_falls_back_when_node_is_too_old() {
        let runtime = normalize_clawmaster_runtime_selection(None, None, None, None);
        let profile = OpenclawProfileSelection {
            kind: "dev".to_string(),
            name: None,
        };

        let status = resolve_local_data_status(&runtime, &profile, true, "v18.19.0", None, None);

        assert_eq!(status.state, "degraded");
        assert_eq!(status.engine, "fallback");
        assert_eq!(status.reason_code.as_deref(), Some("node_too_old"));
        assert!(status.engine_root.unwrap().contains(".clawmaster"));
    }

    #[test]
    fn runtime_selection_defaults_to_native_and_trims_wsl_distro() {
        let selection = normalize_clawmaster_runtime_selection(
            Some("wsl2".to_string()),
            Some(" Ubuntu-24.04 ".to_string()),
            Some(3001),
            Some(true),
        );

        assert_eq!(selection.mode, "wsl2");
        assert_eq!(selection.wsl_distro.as_deref(), Some("Ubuntu-24.04"));
        assert_eq!(selection.backend_port, Some(3001));
        assert_eq!(selection.auto_start_backend, Some(true));

        let native = normalize_clawmaster_runtime_selection(
            Some("native".to_string()),
            Some("ignored".to_string()),
            None,
            None,
        );
        assert_eq!(native.mode, "native");
        assert_eq!(native.wsl_distro, None);
    }

    #[test]
    fn parse_wsl_verbose_output_reads_default_distro() {
        let parsed = parse_wsl_list_verbose(
            "  NAME                   STATE           VERSION\r\n* Ubuntu-24.04           Running         2\r\n  Debian                 Stopped         2\r\n",
        );

        assert_eq!(parsed.len(), 2);
        assert_eq!(parsed[0].name, "Ubuntu-24.04");
        assert_eq!(parsed[0].state, "Running");
        assert_eq!(parsed[0].version, Some(2));
        assert!(parsed[0].is_default);
        assert_eq!(parsed[1].name, "Debian");
        assert_eq!(parsed[1].version, Some(2));
        assert!(!parsed[1].is_default);
    }

    #[test]
    fn selected_wsl_distro_returns_none_when_saved_distro_is_missing() {
        let distros = parse_wsl_list_verbose(
            "  NAME                   STATE           VERSION\r\n* Ubuntu-24.04           Running         2\r\n  Debian                 Stopped         2\r\n",
        );
        let selection = normalize_clawmaster_runtime_selection(
            Some("wsl2".to_string()),
            Some("Renamed-Ubuntu".to_string()),
            None,
            None,
        );

        assert_eq!(
            resolve_selected_wsl_distro_from_list(&distros, &selection),
            None
        );
    }

    #[test]
    fn selected_wsl_distro_falls_back_only_without_saved_distro() {
        let distros = parse_wsl_list_verbose(
            "  NAME                   STATE           VERSION\r\n* Ubuntu-24.04           Running         2\r\n  Debian                 Stopped         2\r\n",
        );
        let selection =
            normalize_clawmaster_runtime_selection(Some("wsl2".to_string()), None, None, None);

        assert_eq!(
            resolve_selected_wsl_distro_from_list(&distros, &selection),
            Some("Ubuntu-24.04".to_string())
        );
    }

    #[test]
    fn parse_json_lenient_skips_unbalanced_log_preambles_before_valid_json() {
        let raw = "[plugins memory-clawmaster-powermem: plugin registered\n[{\"id\":\"memory-clawmaster-powermem\",\"status\":\"loaded\"}]";

        let parsed = parse_json_lenient(raw).expect("should extract the later valid JSON payload");
        let items = parsed.as_array().expect("payload should be an array");
        assert_eq!(items.len(), 1);
        assert_eq!(items[0]["id"], "memory-clawmaster-powermem");
    }

    #[test]
    fn parse_openclaw_plugin_rows_plain_text_reads_table_output() {
        let raw = "
        [plugins] warning: falling back to plain text
        | Name | ID | Status | Source | Version |
        | ClawMaster PowerMem | memory-clawmaster-powermem | loaded | global:/tmp/plugins/memory-clawmaster-powermem/index.ts | 0.1.0 |
        ";

        let rows = super::parse_openclaw_plugin_rows_plain_text(raw);
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0]["id"], "memory-clawmaster-powermem");
        assert_eq!(rows[0]["status"], "loaded");
        assert_eq!(
            rows[0]["source"],
            "global:/tmp/plugins/memory-clawmaster-powermem/index.ts"
        );
    }

    #[test]
    fn parse_openclaw_plugin_rows_plain_text_reads_four_column_status_version_table() {
        let raw = "
        [plugins] warning: falling back to plain text
        | Name | ID | Status | Version |
        | ClawMaster PowerMem | memory-clawmaster-powermem | loaded | 0.1.0 |
        ";

        let rows = super::parse_openclaw_plugin_rows_plain_text(raw);
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0]["id"], "memory-clawmaster-powermem");
        assert_eq!(rows[0]["status"], "loaded");
        assert!(rows[0]["source"].is_null());
        assert_eq!(rows[0]["version"], "0.1.0");
    }

    #[test]
    fn parse_openclaw_plugin_rows_plain_text_preserves_wrapped_source_paths() {
        let raw = "
        [plugins] warning: falling back to plain text
        | Name | ID | Status | Source | Version |
        | ClawMaster PowerMem | memory-clawmaster-powermem | loaded | global:/tmp/plugins/memory-clawmaster- | 0.1.0 |
        |  |  |  | powermem/index.ts |  |
        ";

        let rows = super::parse_openclaw_plugin_rows_plain_text(raw);
        assert_eq!(rows.len(), 1);
        assert_eq!(
            rows[0]["source"],
            "global:/tmp/plugins/memory-clawmaster-powermem/index.ts"
        );
    }

    #[test]
    fn parse_openclaw_plugin_rows_plain_text_reads_unfenced_four_column_table() {
        let raw = "
        [plugins] warning: falling back to plain text
        Name | ID | Status | Version
        ClawMaster PowerMem | memory-clawmaster-powermem | loaded | 0.1.0
        ";

        let rows = super::parse_openclaw_plugin_rows_plain_text(raw);
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0]["id"], "memory-clawmaster-powermem");
        assert_eq!(rows[0]["status"], "loaded");
        assert!(rows[0]["source"].is_null());
        assert_eq!(rows[0]["version"], "0.1.0");
    }

    #[test]
    fn parse_openclaw_plugin_rows_plain_text_reads_unfenced_five_column_table() {
        let raw = "
        [plugins] warning: falling back to plain text
        Name | ID | Status | Source | Version
        ClawMaster PowerMem | memory-clawmaster-powermem | loaded | global:/tmp/plugins/memory-clawmaster-powermem/index.ts | 0.1.0
        ";

        let rows = super::parse_openclaw_plugin_rows_plain_text(raw);
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0]["id"], "memory-clawmaster-powermem");
        assert_eq!(rows[0]["status"], "loaded");
        assert_eq!(
            rows[0]["source"],
            "global:/tmp/plugins/memory-clawmaster-powermem/index.ts"
        );
        assert_eq!(rows[0]["version"], "0.1.0");
    }

    #[test]
    fn managed_memory_bridge_plugin_path_issue_flags_unknown_link_source() {
        assert_eq!(
            super::managed_memory_bridge_plugin_path_issue(
                true,
                None,
                Some("/tmp/plugins/memory-clawmaster-powermem"),
            ),
            Some(
                "memory-clawmaster-powermem is installed but its linked source path is unknown."
                    .to_string()
            )
        );
    }

    #[test]
    fn resolve_installed_plugin_path_accepts_description_only_link_paths() {
        let plugin = serde_json::json!({
            "id": "memory-clawmaster-powermem",
            "description": "/opt/clawmaster/plugins/memory-clawmaster-powermem",
        });

        assert_eq!(
            super::resolve_installed_plugin_path(&plugin),
            Some("/opt/clawmaster/plugins/memory-clawmaster-powermem".to_string())
        );
    }

    #[test]
    fn managed_memory_bridge_post_sync_commands_import_then_reindex() {
        assert_eq!(
            super::managed_memory_bridge_post_sync_commands(),
            vec![
                vec!["ltm".to_string(), "import".to_string()],
                vec![
                    "memory".to_string(),
                    "index".to_string(),
                    "--force".to_string(),
                    "--verbose".to_string(),
                ],
            ]
        );
    }

    #[test]
    fn managed_memory_bridge_reindex_errors_ignore_unsupported_legacy_memory_commands() {
        assert!(super::should_ignore_managed_memory_bridge_reindex_error(
            "error: unknown command 'memory'"
        ));
        assert!(super::should_ignore_managed_memory_bridge_reindex_error(
            "OpenClaw requires Node >= 20. Upgrade Node and re-run OpenClaw."
        ));
        assert!(!super::should_ignore_managed_memory_bridge_reindex_error(
            "permission denied"
        ));
    }

    #[test]
    fn openclaw_memory_search_capability_reports_unsupported_for_missing_memory_command() {
        let payload = super::resolve_openclaw_memory_search_capability_from_output(
            1,
            "",
            "error: unknown command 'memory'",
        );

        assert_eq!(payload.mode, "unsupported");
        assert_eq!(payload.reason.as_deref(), Some("command_unavailable"));
        assert_eq!(
            payload.detail.as_deref(),
            Some("error: unknown command 'memory'")
        );
    }

    #[test]
    fn managed_memory_wsl_root_reuses_host_profile_data_root() {
        let selection = OpenclawProfileSelection {
            kind: "named".to_string(),
            name: Some("team-a".to_string()),
        };

        let root = managed_memory_windows_wsl_data_root(&selection, Path::new(r"C:\Users\alice"));

        assert_eq!(root, "/mnt/c/Users/alice/.clawmaster/data/named/team-a");
    }

    #[test]
    fn resolve_plugin_root_falls_back_to_repo_plugin_in_unbundled_dev_runs() {
        let _guard = lock_test_env();
        std::env::remove_var("CLAWMASTER_PACKAGED_ERNIE_IMAGE_PLUGIN_ROOT");

        let resolved = resolve_plugin_root("openclaw-ernie-image".to_string(), vec![])
            .expect("resolve_plugin_root should succeed");

        let expected =
            repo_plugin_root("openclaw-ernie-image").expect("repo plugin root should resolve");
        assert_eq!(resolved, Some(expected.to_string_lossy().to_string()));
        assert!(expected.join("openclaw.plugin.json").exists());
    }

    #[test]
    fn resolve_plugin_root_ignores_candidates_with_the_wrong_manifest_id() {
        let _guard = lock_test_env();
        let temp_root = unique_test_dir("ernie-plugin-root");
        fs::create_dir_all(&temp_root).expect("should create temp root");
        let stale_candidate = temp_root.join("wrong-plugin");
        fs::create_dir_all(&stale_candidate).expect("should create stale candidate");
        fs::write(
            stale_candidate.join("openclaw.plugin.json"),
            r#"{"id":"some-other-plugin"}"#,
        )
        .expect("should write manifest");

        std::env::remove_var("CLAWMASTER_PACKAGED_ERNIE_IMAGE_PLUGIN_ROOT");

        let resolved = resolve_plugin_root(
            "openclaw-ernie-image".to_string(),
            vec![stale_candidate.to_string_lossy().to_string()],
        )
        .expect("resolve_plugin_root should succeed");

        let expected =
            repo_plugin_root("openclaw-ernie-image").expect("repo plugin root should resolve");
        assert_eq!(resolved, Some(expected.to_string_lossy().to_string()));
    }

    #[test]
    fn install_bundled_skill_falls_back_to_repo_skill_in_unbundled_dev_runs() {
        let _guard = lock_test_env();
        let previous_skill_root = std::env::var_os("CLAWMASTER_BUNDLED_ERNIE_IMAGE_SKILL_ROOT");
        let previous_xdg_config_home = std::env::var_os("XDG_CONFIG_HOME");
        let previous_home = std::env::var_os("HOME");
        let temp_root = unique_test_dir("ernie-skill-install");
        fs::create_dir_all(&temp_root).expect("should create temp root");

        std::env::remove_var("CLAWMASTER_BUNDLED_ERNIE_IMAGE_SKILL_ROOT");
        std::env::set_var("XDG_CONFIG_HOME", &temp_root);
        std::env::set_var("HOME", &temp_root);

        let install_result = install_bundled_skill("ernie-image".to_string());

        if let Some(value) = previous_skill_root {
            std::env::set_var("CLAWMASTER_BUNDLED_ERNIE_IMAGE_SKILL_ROOT", value);
        } else {
            std::env::remove_var("CLAWMASTER_BUNDLED_ERNIE_IMAGE_SKILL_ROOT");
        }
        if let Some(value) = previous_xdg_config_home {
            std::env::set_var("XDG_CONFIG_HOME", value);
        } else {
            std::env::remove_var("XDG_CONFIG_HOME");
        }
        if let Some(value) = previous_home {
            std::env::set_var("HOME", value);
        } else {
            std::env::remove_var("HOME");
        }

        install_result.expect("repo bundled skill fallback should install successfully");

        let installed_skill = temp_root
            .join(".openclaw")
            .join("workspace")
            .join("skills")
            .join("ernie-image")
            .join("SKILL.md");
        assert!(installed_skill.exists());
        assert!(repo_bundled_skill_root("ernie-image")
            .expect("repo bundled skill root should resolve")
            .join("SKILL.md")
            .exists());

        let _ = fs::remove_dir_all(temp_root);
    }

    #[test]
    fn install_content_draft_bundled_skill_falls_back_to_repo_skill_in_unbundled_dev_runs() {
        let _guard = lock_test_env();
        let previous_skill_root = std::env::var_os("CLAWMASTER_BUNDLED_CONTENT_DRAFT_SKILL_ROOT");
        let previous_xdg_config_home = std::env::var_os("XDG_CONFIG_HOME");
        let previous_home = std::env::var_os("HOME");
        let temp_root = unique_test_dir("content-draft-skill-install");
        fs::create_dir_all(&temp_root).expect("should create temp root");

        std::env::remove_var("CLAWMASTER_BUNDLED_CONTENT_DRAFT_SKILL_ROOT");
        std::env::set_var("XDG_CONFIG_HOME", &temp_root);
        std::env::set_var("HOME", &temp_root);

        let install_result = install_bundled_skill("content-draft".to_string());

        if let Some(value) = previous_skill_root {
            std::env::set_var("CLAWMASTER_BUNDLED_CONTENT_DRAFT_SKILL_ROOT", value);
        } else {
            std::env::remove_var("CLAWMASTER_BUNDLED_CONTENT_DRAFT_SKILL_ROOT");
        }
        if let Some(value) = previous_xdg_config_home {
            std::env::set_var("XDG_CONFIG_HOME", value);
        } else {
            std::env::remove_var("XDG_CONFIG_HOME");
        }
        if let Some(value) = previous_home {
            std::env::set_var("HOME", value);
        } else {
            std::env::remove_var("HOME");
        }

        install_result.expect("repo bundled skill fallback should install successfully");

        let installed_skill = temp_root
            .join(".openclaw")
            .join("workspace")
            .join("skills")
            .join("content-draft")
            .join("SKILL.md");
        assert!(installed_skill.exists());
        assert!(repo_bundled_skill_root("content-draft")
            .expect("repo bundled skill root should resolve")
            .join("SKILL.md")
            .exists());

        let _ = fs::remove_dir_all(temp_root);
    }

    #[test]
    fn content_drafts_roots_include_openclaw_workspace_dir_override() {
        let _guard = lock_test_env();
        let previous_workspace_dir = std::env::var_os("OPENCLAW_WORKSPACE_DIR");
        let temp_workspace = unique_test_dir("content-drafts-workspace-root");
        fs::create_dir_all(&temp_workspace).expect("should create temp workspace");

        std::env::set_var("OPENCLAW_WORKSPACE_DIR", &temp_workspace);

        let roots = super::content_drafts_roots();

        if let Some(value) = previous_workspace_dir {
            std::env::set_var("OPENCLAW_WORKSPACE_DIR", value);
        } else {
            std::env::remove_var("OPENCLAW_WORKSPACE_DIR");
        }

        assert!(roots
            .iter()
            .any(|root| root == &temp_workspace.join("content-drafts")));

        let _ = fs::remove_dir_all(temp_workspace);
    }

    #[test]
    fn content_drafts_roots_include_openclaw_data_dir_override() {
        let _guard = lock_test_env();
        let previous_data_dir = std::env::var_os("OPENCLAW_DATA_DIR");
        let temp_data_dir = unique_test_dir("content-drafts-data-root");
        fs::create_dir_all(&temp_data_dir).expect("should create temp data dir");

        std::env::set_var("OPENCLAW_DATA_DIR", &temp_data_dir);

        let roots = super::content_drafts_roots();

        if let Some(value) = previous_data_dir {
            std::env::set_var("OPENCLAW_DATA_DIR", value);
        } else {
            std::env::remove_var("OPENCLAW_DATA_DIR");
        }

        assert!(roots
            .iter()
            .any(|root| root == &temp_data_dir.join("workspace").join("content-drafts")));

        let _ = fs::remove_dir_all(temp_data_dir);
    }

    #[test]
    fn content_drafts_roots_include_openclaw_config_path_override() {
        let _guard = lock_test_env();
        let previous_config_path = std::env::var_os("OPENCLAW_CONFIG_PATH");
        let temp_config_dir = unique_test_dir("content-drafts-config-root");
        fs::create_dir_all(&temp_config_dir).expect("should create temp config dir");
        let temp_config_path = temp_config_dir.join("openclaw.json");

        std::env::set_var("OPENCLAW_CONFIG_PATH", &temp_config_path);

        let roots = super::content_drafts_roots();

        if let Some(value) = previous_config_path {
            std::env::set_var("OPENCLAW_CONFIG_PATH", value);
        } else {
            std::env::remove_var("OPENCLAW_CONFIG_PATH");
        }

        assert!(roots
            .iter()
            .any(|root| root == &temp_config_dir.join("workspace").join("content-drafts")));

        let _ = fs::remove_dir_all(temp_config_dir);
    }

    #[test]
    fn install_paddleocr_bundled_skill_falls_back_to_repo_skill_in_unbundled_dev_runs() {
        let _guard = lock_test_env();
        let previous_skill_root =
            std::env::var_os("CLAWMASTER_BUNDLED_PADDLEOCR_DOC_PARSING_SKILL_ROOT");
        let previous_xdg_config_home = std::env::var_os("XDG_CONFIG_HOME");
        let previous_home = std::env::var_os("HOME");
        let temp_root = unique_test_dir("paddleocr-skill-install");
        fs::create_dir_all(&temp_root).expect("should create temp root");

        std::env::remove_var("CLAWMASTER_BUNDLED_PADDLEOCR_DOC_PARSING_SKILL_ROOT");
        std::env::set_var("XDG_CONFIG_HOME", &temp_root);
        std::env::set_var("HOME", &temp_root);

        let install_result = install_bundled_skill("paddleocr-doc-parsing".to_string());

        if let Some(value) = previous_skill_root {
            std::env::set_var("CLAWMASTER_BUNDLED_PADDLEOCR_DOC_PARSING_SKILL_ROOT", value);
        } else {
            std::env::remove_var("CLAWMASTER_BUNDLED_PADDLEOCR_DOC_PARSING_SKILL_ROOT");
        }
        if let Some(value) = previous_xdg_config_home {
            std::env::set_var("XDG_CONFIG_HOME", value);
        } else {
            std::env::remove_var("XDG_CONFIG_HOME");
        }
        if let Some(value) = previous_home {
            std::env::set_var("HOME", value);
        } else {
            std::env::remove_var("HOME");
        }

        install_result.expect("repo bundled skill fallback should install successfully");

        let installed_skill = temp_root
            .join(".openclaw")
            .join("workspace")
            .join("skills")
            .join("paddleocr-doc-parsing")
            .join("SKILL.md");
        assert!(installed_skill.exists());
        assert!(repo_bundled_skill_root("paddleocr-doc-parsing")
            .expect("repo bundled skill root should resolve")
            .join("SKILL.md")
            .exists());

        let _ = fs::remove_dir_all(temp_root);
    }

    #[test]
    fn install_models_dev_bundled_skill_falls_back_to_repo_skill_in_unbundled_dev_runs() {
        let _guard = lock_test_env();
        let previous_skill_root = std::env::var_os("CLAWMASTER_BUNDLED_MODELS_DEV_SKILL_ROOT");
        let previous_xdg_config_home = std::env::var_os("XDG_CONFIG_HOME");
        let previous_home = std::env::var_os("HOME");
        let temp_root = unique_test_dir("models-dev-skill-install");
        fs::create_dir_all(&temp_root).expect("should create temp root");

        std::env::remove_var("CLAWMASTER_BUNDLED_MODELS_DEV_SKILL_ROOT");
        std::env::set_var("XDG_CONFIG_HOME", &temp_root);
        std::env::set_var("HOME", &temp_root);

        let install_result = install_bundled_skill("models-dev".to_string());

        if let Some(value) = previous_skill_root {
            std::env::set_var("CLAWMASTER_BUNDLED_MODELS_DEV_SKILL_ROOT", value);
        } else {
            std::env::remove_var("CLAWMASTER_BUNDLED_MODELS_DEV_SKILL_ROOT");
        }
        if let Some(value) = previous_xdg_config_home {
            std::env::set_var("XDG_CONFIG_HOME", value);
        } else {
            std::env::remove_var("XDG_CONFIG_HOME");
        }
        if let Some(value) = previous_home {
            std::env::set_var("HOME", value);
        } else {
            std::env::remove_var("HOME");
        }

        install_result.expect("repo bundled skill fallback should install successfully");

        let installed_skill = temp_root
            .join(".openclaw")
            .join("workspace")
            .join("skills")
            .join("models-dev")
            .join("SKILL.md");
        assert!(installed_skill.exists());
        assert!(repo_bundled_skill_root("models-dev")
            .expect("repo bundled skill root should resolve")
            .join("SKILL.md")
            .exists());

        let _ = fs::remove_dir_all(temp_root);
    }

    #[test]
    fn install_clawprobe_cost_digest_bundled_skill_falls_back_to_repo_skill_in_unbundled_dev_runs()
    {
        let _guard = lock_test_env();
        let previous_skill_root =
            std::env::var_os("CLAWMASTER_BUNDLED_CLAWPROBE_COST_DIGEST_SKILL_ROOT");
        let previous_xdg_config_home = std::env::var_os("XDG_CONFIG_HOME");
        let previous_home = std::env::var_os("HOME");
        let temp_root = unique_test_dir("clawprobe-cost-digest-skill-install");
        fs::create_dir_all(&temp_root).expect("should create temp root");

        std::env::remove_var("CLAWMASTER_BUNDLED_CLAWPROBE_COST_DIGEST_SKILL_ROOT");
        std::env::set_var("XDG_CONFIG_HOME", &temp_root);
        std::env::set_var("HOME", &temp_root);

        let install_result = install_bundled_skill("clawprobe-cost-digest".to_string());

        if let Some(value) = previous_skill_root {
            std::env::set_var("CLAWMASTER_BUNDLED_CLAWPROBE_COST_DIGEST_SKILL_ROOT", value);
        } else {
            std::env::remove_var("CLAWMASTER_BUNDLED_CLAWPROBE_COST_DIGEST_SKILL_ROOT");
        }
        if let Some(value) = previous_xdg_config_home {
            std::env::set_var("XDG_CONFIG_HOME", value);
        } else {
            std::env::remove_var("XDG_CONFIG_HOME");
        }
        if let Some(value) = previous_home {
            std::env::set_var("HOME", value);
        } else {
            std::env::remove_var("HOME");
        }

        install_result.expect("repo bundled skill fallback should install successfully");

        let installed_skill = temp_root
            .join(".openclaw")
            .join("workspace")
            .join("skills")
            .join("clawprobe-cost-digest")
            .join("SKILL.md");
        assert!(installed_skill.exists());
        assert!(repo_bundled_skill_root("clawprobe-cost-digest")
            .expect("repo bundled skill root should resolve")
            .join("SKILL.md")
            .exists());

        let _ = fs::remove_dir_all(temp_root);
    }

    #[test]
    fn sync_installed_bundled_skills_skips_matching_dirs_without_bundled_meta() {
        let _guard = lock_test_env();
        let previous_skill_root = std::env::var_os("CLAWMASTER_BUNDLED_CONTENT_DRAFT_SKILL_ROOT");
        let previous_xdg_config_home = std::env::var_os("XDG_CONFIG_HOME");
        let previous_home = std::env::var_os("HOME");
        let temp_root = unique_test_dir("bundled-skill-sync-skip-custom");
        let source_root = temp_root.join("bundled-source");
        let install_dir = temp_root
            .join(".openclaw")
            .join("workspace")
            .join("skills")
            .join("content-draft");

        fs::create_dir_all(source_root.join("scripts")).expect("should create bundled source");
        fs::write(source_root.join("SKILL.md"), "# Bundled Content Draft\n")
            .expect("should write bundled skill");
        fs::write(
            source_root.join("_meta.json"),
            "{\"slug\":\"content-draft\",\"bundled\":true}\n",
        )
        .expect("should write bundled meta");
        fs::write(
            source_root.join("scripts").join("save-draft-artifacts.mjs"),
            "console.log('bundled')\n",
        )
        .expect("should write bundled script");

        fs::create_dir_all(install_dir.join("scripts")).expect("should create installed dir");
        fs::write(install_dir.join("SKILL.md"), "# Custom Content Draft\n")
            .expect("should write custom skill");
        fs::write(
            install_dir.join("_meta.json"),
            "{\"slug\":\"content-draft\",\"bundled\":false}\n",
        )
        .expect("should write custom meta");
        fs::write(
            install_dir.join("scripts").join("save-draft-artifacts.mjs"),
            "console.log('custom')\n",
        )
        .expect("should write custom script");

        std::env::set_var("CLAWMASTER_BUNDLED_CONTENT_DRAFT_SKILL_ROOT", &source_root);
        std::env::set_var("XDG_CONFIG_HOME", &temp_root);
        std::env::set_var("HOME", &temp_root);

        let sync_result = sync_installed_bundled_skills();

        if let Some(value) = previous_skill_root {
            std::env::set_var("CLAWMASTER_BUNDLED_CONTENT_DRAFT_SKILL_ROOT", value);
        } else {
            std::env::remove_var("CLAWMASTER_BUNDLED_CONTENT_DRAFT_SKILL_ROOT");
        }
        if let Some(value) = previous_xdg_config_home {
            std::env::set_var("XDG_CONFIG_HOME", value);
        } else {
            std::env::remove_var("XDG_CONFIG_HOME");
        }
        if let Some(value) = previous_home {
            std::env::set_var("HOME", value);
        } else {
            std::env::remove_var("HOME");
        }

        let synced = sync_result.expect("sync should succeed");
        assert!(synced.is_empty());
        assert_eq!(
            fs::read_to_string(install_dir.join("SKILL.md")).expect("should keep custom skill"),
            "# Custom Content Draft\n"
        );
        assert_eq!(
            fs::read_to_string(install_dir.join("scripts").join("save-draft-artifacts.mjs"))
                .expect("should keep custom script"),
            "console.log('custom')\n"
        );

        let _ = fs::remove_dir_all(temp_root);
    }

    #[test]
    fn models_dev_catalog_maps_reseller_aliases_for_clawprobe_pricing() {
        let catalog = serde_json::json!({
            "deepseek": {
                "models": {
                    "DeepSeek-R1": {
                        "id": "DeepSeek-R1",
                        "cost": {
                            "input": 0.55,
                            "output": 2.19
                        }
                    }
                }
            },
            "zhipuai": {
                "models": {
                    "GLM-5.1": {
                        "id": "GLM-5.1",
                        "cost": {
                            "input": 0.7,
                            "output": 0.7
                        }
                    }
                }
            }
        });

        let prices = build_clawprobe_custom_prices_from_models_dev_catalog(&catalog);

        assert_eq!(
            prices.get("deepseek-ai/DeepSeek-R1"),
            Some(&serde_json::json!({
                "input": 0.55,
                "output": 2.19
            }))
        );
        assert_eq!(
            prices.get("siliconflow/deepseek-ai/DeepSeek-R1"),
            prices.get("deepseek-ai/DeepSeek-R1")
        );
        assert_eq!(
            prices.get("zai-org/GLM-5.1"),
            Some(&serde_json::json!({
                "input": 0.7,
                "output": 0.7
            }))
        );
        assert_eq!(
            prices.get("siliconflow/Pro/zai-org/GLM-5.1"),
            prices.get("zai-org/GLM-5.1")
        );
    }

    #[test]
    fn models_dev_fetched_at_parser_accepts_iso_utc_timestamps_with_millis() {
        assert_eq!(
            parse_models_dev_fetched_at("2026-04-18T00:00:00.000Z"),
            Some(1_776_470_400_000)
        );
        assert_eq!(
            parse_models_dev_fetched_at("2026-02-29T09:00:00.000Z"),
            None
        );
    }

    #[test]
    fn clawprobe_config_override_preserves_existing_user_prices_over_models_dev_defaults() {
        let merged = build_clawprobe_config_override(
            &serde_json::json!({
                "timezone": "Asia/Shanghai",
                "cost": {
                    "customPrices": {
                        "openai/gpt-4o": { "input": 1.0, "output": 2.0 }
                    }
                }
            }),
            &serde_json::Map::from_iter([
                (
                    "openai/gpt-4o".to_string(),
                    serde_json::json!({ "input": 2.5, "output": 10.0 }),
                ),
                (
                    "deepseek-ai/deepseek-r1".to_string(),
                    serde_json::json!({ "input": 0.55, "output": 2.19 }),
                ),
            ]),
        );

        assert_eq!(
            merged,
            serde_json::json!({
                "timezone": "Asia/Shanghai",
                "cost": {
                    "customPrices": {
                        "openai/gpt-4o": { "input": 1.0, "output": 2.0 },
                        "deepseek-ai/deepseek-r1": { "input": 0.55, "output": 2.19 }
                    }
                }
            })
        );
    }

    #[test]
    fn clawprobe_env_overrides_include_userprofile_on_windows() {
        let overrides = build_clawprobe_env_overrides(
            Path::new("/tmp/clawmaster-home"),
            Path::new("/tmp/openclaw"),
        );

        assert!(overrides
            .iter()
            .any(|(key, value)| { *key == "HOME" && value == "/tmp/clawmaster-home" }));
        assert!(overrides
            .iter()
            .any(|(key, value)| { *key == "OPENCLAW_DIR" && value == "/tmp/openclaw" }));

        #[cfg(target_os = "windows")]
        assert!(overrides
            .iter()
            .any(|(key, value)| { *key == "USERPROFILE" && value == "/tmp/clawmaster-home" }));

        #[cfg(not(target_os = "windows"))]
        assert!(!overrides.iter().any(|(key, _)| *key == "USERPROFILE"));
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn wsl_clawprobe_command_script_preserves_openclaw_dir() {
        let script = build_wsl_clawprobe_command_script(
            "/tmp/clawprobe-home",
            "/home/tester/.openclaw-dev",
            &["status".to_string(), "--json".to_string()],
        );

        assert!(script.contains("HOME='/tmp/clawprobe-home'"));
        assert!(script.contains("OPENCLAW_DIR='/home/tester/.openclaw-dev'"));
        assert!(script.contains("clawprobe 'status' '--json'"));
    }
}

// Run command with --version-style arg; return stdout if success
fn check_command(cmd: &str, version_arg: &str) -> Option<String> {
    #[cfg(target_os = "windows")]
    if let Some(distro) = active_wsl_distro() {
        let output = exec_wsl_command(&distro, cmd, &[version_arg]).ok()?;
        if output.code == 0 {
            return Some(output.stdout.trim().to_string());
        }
        return None;
    }

    let output = Command::new(cmd).arg(version_arg).output().ok()?;

    if output.status.success() {
        let version = String::from_utf8_lossy(&output.stdout).trim().to_string();
        Some(version)
    } else {
        None
    }
}

// Detect Node / npm / OpenClaw for the UI
#[tauri::command]
fn detect_system() -> Result<SystemInfo, String> {
    let runtime_selection = get_clawmaster_runtime_selection();
    let distros = list_wsl_distros();
    #[cfg(target_os = "windows")]
    let mut distros = distros;
    let selected_distro = if should_use_wsl_runtime(&runtime_selection) {
        resolve_selected_wsl_distro(&runtime_selection)
    } else {
        None
    };

    // Node.js
    let nodejs_version = check_command("node", "--version");
    let nodejs = NodejsInfo {
        installed: nodejs_version.is_some(),
        version: nodejs_version.unwrap_or_default(),
    };

    // npm
    let npm_version = check_command("npm", "--version");
    let npm = NpmInfo {
        installed: npm_version.is_some(),
        version: npm_version
            .map(|v| v.lines().next().unwrap_or("").trim().to_string())
            .unwrap_or_default(),
    };

    // OpenClaw (same resolution as gateway start so GUI PATH misses do not break detection)
    let openclaw_version = openclaw_cmd()
        .arg("--version")
        .output()
        .ok()
        .filter(|o| o.status.success())
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string());
    let resolution = get_config_resolution();
    let config_path = resolution.config_path.clone();
    let storage_profile_selection = resolution.profile_selection.clone();
    #[cfg(target_os = "windows")]
    let storage_wsl_home = if should_use_wsl_runtime(&runtime_selection) {
        selected_distro.as_deref().map(get_wsl_home_dir)
    } else {
        None
    };
    #[cfg(not(target_os = "windows"))]
    let storage_wsl_home: Option<String> = None;
    let storage = resolve_local_data_status(
        &runtime_selection,
        &storage_profile_selection,
        nodejs.installed,
        &nodejs.version,
        selected_distro.as_deref(),
        storage_wsl_home.as_deref(),
    );

    let openclaw = OpenClawInfo {
        installed: openclaw_version.is_some() || config_path.exists(),
        version: openclaw_version
            .map(|v| v.trim().replace("openclaw ", "").replace("v", ""))
            .unwrap_or_default(),
        config_path: config_path.to_string_lossy().to_string(),
        data_dir: resolution.data_dir.to_string_lossy().to_string(),
        path_source: resolution.source,
        profile_mode: resolution.profile_selection.kind,
        profile_name: resolution.profile_selection.name,
        override_active: resolution.override_active,
        config_path_candidates: resolution
            .config_path_candidates
            .into_iter()
            .map(|item| item.to_string_lossy().to_string())
            .collect(),
        existing_config_paths: resolution
            .existing_config_paths
            .into_iter()
            .map(|item| item.to_string_lossy().to_string())
            .collect(),
    };

    #[cfg(target_os = "windows")]
    if let Some(selected_name) = selected_distro.as_ref() {
        for distro in distros.iter_mut() {
            if distro.name != *selected_name {
                continue;
            }
            let probe = exec_wsl_command(&distro.name, "openclaw", &["--version"]).ok();
            distro.has_openclaw = Some(probe.as_ref().map(|item| item.code == 0).unwrap_or(false));
            distro.openclaw_version = probe
                .filter(|item| item.code == 0)
                .map(|item| item.stdout.trim().replace("openclaw ", "").replace("v", ""));
        }
    }

    #[cfg(not(target_os = "windows"))]
    let _ = &selected_distro;

    Ok(SystemInfo {
        nodejs,
        npm,
        openclaw,
        storage,
        runtime: RuntimeInfo {
            mode: runtime_selection.mode.clone(),
            host_platform: std::env::consts::OS.to_string(),
            wsl_available: !distros.is_empty(),
            selected_distro: if runtime_selection.mode == "wsl2" {
                runtime_selection
                    .wsl_distro
                    .clone()
                    .or_else(|| selected_distro.clone())
            } else {
                None
            },
            selected_distro_exists: if runtime_selection.mode == "wsl2" {
                Some(selected_distro.is_some())
            } else {
                None
            },
            backend_port: runtime_selection.backend_port,
            auto_start_backend: runtime_selection.auto_start_backend,
            distros,
        },
    })
}

fn default_gateway_port_from_config() -> u16 {
    let p = get_config_path();
    let Ok(Some(s)) = read_active_openclaw_text_file(&p) else {
        return 18789;
    };
    let Ok(v) = serde_json::from_str::<serde_json::Value>(&s) else {
        return 18789;
    };
    v.get("gateway")
        .and_then(|g| g.get("port"))
        .and_then(|x| x.as_u64())
        .map(|n| (n.min(65535)) as u16)
        .unwrap_or(18789)
}

fn parse_gateway_running_from_json(v: &serde_json::Value) -> bool {
    if v["running"].as_bool() == Some(true) {
        return true;
    }
    if let Some(s) = v["state"].as_str() {
        if s.eq_ignore_ascii_case("running") {
            return true;
        }
    }
    if let Some(s) = v["status"].as_str() {
        if s.eq_ignore_ascii_case("running") {
            return true;
        }
    }
    false
}

fn probe_local_tcp(port: u16) -> bool {
    let addr = SocketAddr::from(([127, 0, 0, 1], port));
    TcpStream::connect_timeout(&addr, Duration::from_millis(2000)).is_ok()
}

// Gateway status (CLI + optional TCP probe)
#[tauri::command]
fn get_gateway_status() -> Result<GatewayStatus, String> {
    let port_default = default_gateway_port_from_config();
    // Fast path when something is listening (avoids spawning openclaw when gateway is already up).
    if probe_local_tcp(port_default) {
        return Ok(GatewayStatus {
            running: true,
            port: port_default,
        });
    }
    let output = openclaw_cmd()
        .args(&["gateway", "status", "--json"])
        .output();

    let mut status = match output {
        Ok(o) if o.status.success() => {
            let json: serde_json::Value = serde_json::from_slice(&o.stdout)
                .unwrap_or(serde_json::json!({"running": false, "port": port_default}));
            let port = json["port"]
                .as_u64()
                .map(|n| (n.min(65535)) as u16)
                .unwrap_or(port_default);
            GatewayStatus {
                running: parse_gateway_running_from_json(&json),
                port,
            }
        }
        Ok(o) => {
            let stdout = String::from_utf8_lossy(&o.stdout);
            let stderr = String::from_utf8_lossy(&o.stderr);
            let combined = format!("{stdout}\n{stderr}");
            let low = combined.to_ascii_lowercase();
            let running = low.contains("running") || low.contains("active");
            if running {
                GatewayStatus {
                    running: true,
                    port: port_default,
                }
            } else if let Ok(plain) = openclaw_cmd().args(&["gateway", "status"]).output() {
                let text = String::from_utf8_lossy(&plain.stdout);
                let low = text.to_ascii_lowercase();
                let running_plain = low.contains("running") || low.contains("active");
                GatewayStatus {
                    running: running_plain,
                    port: port_default,
                }
            } else {
                GatewayStatus {
                    running: false,
                    port: port_default,
                }
            }
        }
        Err(_) => GatewayStatus {
            running: false,
            port: port_default,
        },
    };

    if !status.running && probe_local_tcp(status.port) {
        status.running = true;
    }
    Ok(status)
}

/// On macOS `gateway start` goes through LaunchAgent; must run to completion in a login shell like Terminal.
/// Spawning a detached child and returning immediately breaks launchctl / environment.
#[cfg(target_os = "macos")]
fn start_gateway_impl() -> Result<(), String> {
    let output = Command::new("/bin/zsh")
        .args(["-ilc", "openclaw gateway start"])
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .map_err(|e| cmd_err_d("GATEWAY_START_SPAWN_FAILED", e))?;
    if output.status.success() {
        Ok(())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        let msg = if !stderr.is_empty() {
            stderr
        } else if !stdout.is_empty() {
            stdout
        } else {
            format!("exit {:?}", output.status.code())
        };
        Err(cmd_err_d("GATEWAY_START_CLI_FAILED", msg))
    }
}

#[cfg(not(target_os = "macos"))]
fn start_gateway_impl() -> Result<(), String> {
    let output = openclaw_cmd()
        .args(&["gateway", "start"])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .map_err(|e| cmd_err_d("GATEWAY_START_SPAWN_FAILED", e))?;
    if output.status.success() {
        Ok(())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        let msg = if !stderr.is_empty() {
            stderr
        } else if !stdout.is_empty() {
            stdout
        } else {
            format!("exit {:?}", output.status.code())
        };
        Err(cmd_err_d("GATEWAY_START_CLI_FAILED", msg))
    }
}

// Start gateway
#[tauri::command]
fn start_gateway() -> Result<(), String> {
    start_gateway_impl()
}

/// After install/reinstall: write `{}` if config missing, run `doctor --fix`, then try gateway start.
#[tauri::command]
fn bootstrap_openclaw_after_install() -> Result<BootstrapAfterInstallDto, String> {
    let config_path = get_config_path();
    if read_active_openclaw_text_file(&config_path)?.is_none() {
        write_active_openclaw_text_file(&config_path, "{}\n")?;
    }

    let doc = openclaw_cmd()
        .args(["doctor", "--fix"])
        .output()
        .map_err(|e| cmd_err_d("OPENCLAW_DOCTOR_SPAWN_FAILED", e))?;

    let doc_ok = doc.status.success();
    let code = doc.status.code().unwrap_or(-1) as i32;
    let stdout = String::from_utf8_lossy(&doc.stdout).to_string();
    let stderr = String::from_utf8_lossy(&doc.stderr).to_string();

    let (gw_ok, gw_err) = match start_gateway() {
        Ok(()) => (true, None),
        Err(e) => (false, Some(e)),
    };

    Ok(BootstrapAfterInstallDto {
        doctor_fix: DoctorFixDto {
            ok: doc_ok,
            code,
            stdout,
            stderr,
        },
        gateway_start: GatewayStartBootstrapDto {
            ok: gw_ok,
            error: gw_err,
        },
    })
}

// Stop gateway
#[tauri::command]
fn stop_gateway() -> Result<(), String> {
    openclaw_cmd()
        .args(&["gateway", "stop"])
        .status()
        .map_err(|e| cmd_err_d("GATEWAY_STOP_FAILED", e))?;
    Ok(())
}

// Restart gateway
#[tauri::command]
fn restart_gateway() -> Result<(), String> {
    stop_gateway().ok();
    std::thread::sleep(std::time::Duration::from_secs(1));
    start_gateway()
}

// Read openclaw.json
#[tauri::command]
fn get_config() -> Result<OpenClawConfig, String> {
    let config_path = get_config_path();

    let Some(content) = read_active_openclaw_text_file(&config_path)? else {
        return Ok(OpenClawConfig {
            data: serde_json::json!({}),
        });
    };

    let data: serde_json::Value =
        serde_json::from_str(&content).map_err(|e| cmd_err_d("CONFIG_PARSE_FAILED", e))?;

    Ok(OpenClawConfig { data })
}

fn repo_root_path() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("..")
}

fn repo_plugin_root(plugin_id: &str) -> Option<PathBuf> {
    let dir_name = match plugin_id.trim() {
        "memory-clawmaster-powermem" => "memory-clawmaster-powermem",
        "openclaw-ernie-image" => "openclaw-ernie-image",
        _ => return None,
    };

    Some(repo_root_path().join("plugins").join(dir_name))
}

fn plugin_manifest_matches_id(plugin_root: &Path, plugin_id: &str) -> bool {
    let manifest_path = plugin_root.join("openclaw.plugin.json");
    let Ok(raw) = fs::read_to_string(manifest_path) else {
        return false;
    };
    let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&raw) else {
        return false;
    };
    parsed
        .get("id")
        .and_then(|value| value.as_str())
        .map(|value| value.trim() == plugin_id)
        .unwrap_or(false)
}

#[tauri::command]
fn resolve_plugin_root(
    plugin_id: String,
    candidates: Vec<String>,
) -> Result<Option<String>, String> {
    let trimmed_plugin_id = plugin_id.trim();
    let env_key = match trimmed_plugin_id {
        "memory-clawmaster-powermem" => "CLAWMASTER_PACKAGED_MEMORY_PLUGIN_ROOT",
        "openclaw-ernie-image" => "CLAWMASTER_PACKAGED_ERNIE_IMAGE_PLUGIN_ROOT",
        other => {
            return Err(cmd_err_p(
                "PLUGIN_ID_UNSUPPORTED",
                serde_json::json!({ "pluginId": other }),
            ))
        }
    };

    let mut search_roots = candidates
        .into_iter()
        .map(|candidate| candidate.trim().to_string())
        .filter(|candidate| !candidate.is_empty())
        .collect::<Vec<_>>();
    if let Ok(env_root) = std::env::var(env_key) {
        let trimmed = env_root.trim();
        if !trimmed.is_empty() {
            search_roots.push(trimmed.to_string());
        }
    }
    if let Some(repo_root) = repo_plugin_root(trimmed_plugin_id) {
        search_roots.push(repo_root.to_string_lossy().to_string());
    }

    for candidate in search_roots {
        if plugin_manifest_matches_id(Path::new(&candidate), trimmed_plugin_id) {
            return Ok(Some(candidate));
        }
    }

    Ok(None)
}

fn bundled_skill_dir_name(skill_id: &str) -> Option<&'static str> {
    match skill_id.trim().to_ascii_lowercase().as_str() {
        "content-draft" => Some("content-draft"),
        "clawprobe-cost-digest" => Some("clawprobe-cost-digest"),
        "ernie-image" => Some("ernie-image"),
        "models-dev" => Some("models-dev"),
        "paddleocr-doc-parsing" => Some("paddleocr-doc-parsing"),
        _ => None,
    }
}

fn bundled_skill_env_key(skill_id: &str) -> Option<&'static str> {
    match skill_id.trim().to_ascii_lowercase().as_str() {
        "content-draft" => Some("CLAWMASTER_BUNDLED_CONTENT_DRAFT_SKILL_ROOT"),
        "clawprobe-cost-digest" => Some("CLAWMASTER_BUNDLED_CLAWPROBE_COST_DIGEST_SKILL_ROOT"),
        "ernie-image" => Some("CLAWMASTER_BUNDLED_ERNIE_IMAGE_SKILL_ROOT"),
        "models-dev" => Some("CLAWMASTER_BUNDLED_MODELS_DEV_SKILL_ROOT"),
        "paddleocr-doc-parsing" => Some("CLAWMASTER_BUNDLED_PADDLEOCR_DOC_PARSING_SKILL_ROOT"),
        _ => None,
    }
}

fn bundled_skill_ids() -> [&'static str; 5] {
    [
        "content-draft",
        "clawprobe-cost-digest",
        "ernie-image",
        "models-dev",
        "paddleocr-doc-parsing",
    ]
}

fn repo_bundled_skill_root(skill_id: &str) -> Option<PathBuf> {
    let dir_name = bundled_skill_dir_name(skill_id)?;
    Some(repo_root_path().join("bundled-skills").join(dir_name))
}

#[derive(Debug, Default, Deserialize)]
struct BundledSkillInstallMeta {
    bundled: Option<bool>,
}

#[cfg(target_os = "windows")]
fn copy_bundled_skill_into_wsl(
    distro: &str,
    source_path: &Path,
    target_dir: &str,
) -> Result<(), String> {
    let source_wsl_path = windows_path_to_wsl_path(&source_path.to_string_lossy())
        .or_else(|| {
            let raw = source_path.to_string_lossy();
            if raw.starts_with('/') {
                Some(raw.to_string())
            } else {
                None
            }
        })
        .ok_or_else(|| {
            cmd_err_d(
                "SKILL_SOURCE_INVALID",
                format!(
                    "Bundled skill source is not reachable from WSL: {}",
                    source_path.display()
                ),
            )
        })?;
    let target_parent = dirname_posix(target_dir);
    let script = format!(
        "mkdir -p {target_parent} && rm -rf {target_dir} && mkdir -p {target_dir} && cp -a {source_dot} {target_dot}",
        target_parent = shell_escape_posix_arg(&target_parent),
        target_dir = shell_escape_posix_arg(target_dir),
        source_dot = shell_escape_posix_arg(&join_posix(&source_wsl_path, ".")),
        target_dot = shell_escape_posix_arg(&join_posix(target_dir, "")),
    );
    let output = run_wsl_shell(distro, &script, None)?;
    if output.code == 0 {
        Ok(())
    } else {
        Err(cmd_err_d(
            "WSL_SKILL_INSTALL_FAILED",
            output.stderr.trim().to_string(),
        ))
    }
}

fn bundled_skill_install_dir(
    config_resolution: &OpenclawConfigResolution,
    dir_name: &str,
) -> PathBuf {
    #[cfg(target_os = "windows")]
    if active_wsl_distro().is_some() {
        return PathBuf::from(join_posix(
            &join_posix(&config_resolution.data_dir.to_string_lossy(), "workspace"),
            &join_posix("skills", dir_name),
        ));
    }

    config_resolution
        .data_dir
        .join("workspace")
        .join("skills")
        .join(dir_name)
}

fn bundled_skill_install_dir_exists(install_dir: &Path) -> bool {
    #[cfg(target_os = "windows")]
    if let Some(distro) = active_wsl_distro() {
        return wsl_is_dir(&distro, &install_dir.to_string_lossy());
    }

    install_dir.exists()
}

fn read_bundled_skill_install_meta(install_dir: &Path) -> Option<BundledSkillInstallMeta> {
    #[cfg(target_os = "windows")]
    if let Some(distro) = active_wsl_distro() {
        let meta_path = join_posix(&install_dir.to_string_lossy(), "_meta.json");
        let raw = read_text_file_in_wsl(&distro, &meta_path).ok().flatten()?;
        return serde_json::from_str(&raw).ok();
    }

    let raw = fs::read_to_string(install_dir.join("_meta.json")).ok()?;
    serde_json::from_str(&raw).ok()
}

fn is_safe_bundled_skill_refresh_install(install_dir: &Path) -> bool {
    read_bundled_skill_install_meta(install_dir)
        .and_then(|meta| meta.bundled)
        .unwrap_or(false)
}

#[tauri::command]
fn install_bundled_skill(skill_id: String) -> Result<(), String> {
    let normalized = skill_id.trim().to_ascii_lowercase();
    let Some(dir_name) = bundled_skill_dir_name(&normalized) else {
        return Err(cmd_err_p(
            "SKILL_ID_UNSUPPORTED",
            serde_json::json!({ "skillId": skill_id.trim() }),
        ));
    };
    let Some(env_key) = bundled_skill_env_key(&normalized) else {
        return Err(cmd_err_p(
            "SKILL_ID_UNSUPPORTED",
            serde_json::json!({ "skillId": skill_id.trim() }),
        ));
    };

    let source_path = match std::env::var(env_key) {
        Ok(source_root) => PathBuf::from(source_root.trim()),
        Err(_) => repo_bundled_skill_root(&normalized)
            .ok_or_else(|| cmd_err_d("SKILL_SOURCE_MISSING", format!("Missing env {}", env_key)))?,
    };
    if !source_path.join("SKILL.md").exists() {
        return Err(cmd_err_d(
            "SKILL_SOURCE_INVALID",
            format!(
                "Bundled skill source missing SKILL.md: {}",
                source_path.display()
            ),
        ));
    }

    let config_resolution = get_config_resolution();
    #[cfg(target_os = "windows")]
    if let Some(distro) = active_wsl_distro() {
        let target_dir = bundled_skill_install_dir(&config_resolution, dir_name)
            .to_string_lossy()
            .to_string();
        return copy_bundled_skill_into_wsl(&distro, &source_path, &target_dir);
    }

    let target_dir = bundled_skill_install_dir(&config_resolution, dir_name);
    let _ = fs::remove_dir_all(&target_dir);
    copy_dir_all(&source_path, &target_dir)?;
    Ok(())
}

fn sync_installed_bundled_skills() -> Result<Vec<String>, String> {
    let config_resolution = get_config_resolution();
    let mut synced = Vec::new();

    for skill_id in bundled_skill_ids() {
        let Some(dir_name) = bundled_skill_dir_name(skill_id) else {
            continue;
        };
        let install_dir = bundled_skill_install_dir(&config_resolution, dir_name);
        if !bundled_skill_install_dir_exists(&install_dir) {
            continue;
        }
        if !is_safe_bundled_skill_refresh_install(&install_dir) {
            continue;
        }
        install_bundled_skill(skill_id.to_string())?;
        synced.push(skill_id.to_string());
    }

    Ok(synced)
}

#[tauri::command]
fn scan_installed_skill(
    skill_key: Option<String>,
    name: Option<String>,
    slug: Option<String>,
) -> Result<serde_json::Value, String> {
    let payload = SkillGuardScanPayload {
        skill_key,
        name,
        slug,
    };

    #[cfg(target_os = "windows")]
    if let Some(distro) = active_wsl_distro() {
        let skill_dir = resolve_skill_dir_wsl(&distro, &payload).ok_or_else(|| {
            cmd_err_d(
                "SKILL_SCAN_TARGET_MISSING",
                format!(
                    "Installed skill directory not found for: {}",
                    skill_scan_label(&payload)
                ),
            )
        })?;
        return run_skillguard_scan_wsl(&distro, &skill_dir);
    }

    let skill_dir = resolve_skill_dir_host(&payload).ok_or_else(|| {
        cmd_err_d(
            "SKILL_SCAN_TARGET_MISSING",
            format!(
                "Installed skill directory not found for: {}",
                skill_scan_label(&payload)
            ),
        )
    })?;
    run_skillguard_scan_host(&skill_dir)
}

#[tauri::command]
fn desktop_smoke_diagnostics() -> Result<serde_json::Value, String> {
    let config_path = get_config_path();
    let cwd = std::env::current_dir()
        .unwrap_or_else(|_| PathBuf::from("."))
        .to_string_lossy()
        .to_string();
    let home_dir = dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .to_string_lossy()
        .to_string();
    let openclaw_bin = openclaw_executable_path().to_string_lossy().to_string();
    let env_path = std::env::var("PATH").unwrap_or_default();
    let path_head = env_path
        .split(if cfg!(target_os = "windows") {
            ';'
        } else {
            ':'
        })
        .take(12)
        .map(str::to_string)
        .collect::<Vec<_>>();

    Ok(serde_json::json!({
        "cwd": cwd,
        "homeDir": home_dir,
        "envHome": std::env::var("HOME").unwrap_or_default(),
        "envUserProfile": std::env::var("USERPROFILE").unwrap_or_default(),
        "pathHead": path_head,
        "openclawBin": openclaw_bin,
        "configPath": config_path.to_string_lossy().to_string(),
        "configExists": config_path.exists(),
    }))
}

// Save openclaw.json
#[tauri::command]
fn save_config(config: serde_json::Value) -> Result<(), String> {
    let config_path = get_config_path();
    let content = serde_json::to_string_pretty(&config)
        .map_err(|e| cmd_err_d("CONFIG_SERIALIZE_FAILED", e))?;
    write_active_openclaw_text_file(&config_path, &content).map_err(|e| {
        if e.starts_with(CMD_ERR_PREFIX) {
            e
        } else {
            cmd_err_d("CONFIG_WRITE_FAILED", e)
        }
    })?;

    Ok(())
}

#[derive(Debug, Clone, Serialize)]
pub struct NpmUninstallOutput {
    pub ok: bool,
    pub code: i32,
    pub stdout: String,
    pub stderr: String,
}

/// Reset openclaw.json to `{}` (clear settings); keep file — same as Web POST /api/settings/reset-config
#[tauri::command]
fn reset_openclaw_config() -> Result<(), String> {
    let config_path = get_config_path();
    let content = serde_json::to_string_pretty(&serde_json::json!({}))
        .map_err(|e| cmd_err_d("RESET_SERIALIZE_FAILED", e))?;
    write_active_openclaw_text_file(&config_path, &content).map_err(|e| {
        if e.starts_with(CMD_ERR_PREFIX) {
            e
        } else {
            cmd_err_d("RESET_WRITE_FAILED", e)
        }
    })?;
    Ok(())
}

#[tauri::command]
fn save_openclaw_profile(
    kind: Option<String>,
    name: Option<String>,
    seed_mode: Option<String>,
    seed_path: Option<String>,
) -> Result<(), String> {
    let normalized = normalize_openclaw_profile_selection(kind, name)?;
    let (normalized_seed_mode, normalized_seed_path) =
        normalize_openclaw_profile_seed(seed_mode, seed_path)?;
    seed_named_openclaw_profile_config(
        &normalized,
        &normalized_seed_mode,
        normalized_seed_path.as_deref(),
    )?;
    set_openclaw_profile_selection(Some(normalized.kind), normalized.name).map(|_| ())
}

#[tauri::command]
fn clear_openclaw_profile() -> Result<(), String> {
    clear_openclaw_profile_selection()
}

#[tauri::command]
fn save_clawmaster_runtime(
    mode: Option<String>,
    wsl_distro: Option<String>,
    backend_port: Option<u16>,
    auto_start_backend: Option<bool>,
) -> Result<(), String> {
    set_clawmaster_runtime_selection(mode, wsl_distro, backend_port, auto_start_backend).map(|_| ())
}

#[tauri::command]
fn get_clawmaster_npm_proxy() -> Result<ClawmasterNpmProxyInfo, String> {
    Ok(clawmaster_npm_proxy_info_from_selection(
        get_clawmaster_npm_proxy_selection(),
    ))
}

#[tauri::command]
fn save_clawmaster_npm_proxy(enabled: Option<bool>) -> Result<ClawmasterNpmProxyInfo, String> {
    set_clawmaster_npm_proxy_selection(enabled).map(clawmaster_npm_proxy_info_from_selection)
}

fn npm_root_g() -> Result<String, String> {
    let output = Command::new("npm")
        .args(["root", "-g"])
        .output()
        .map_err(|e| cmd_err_d("NPM_ROOT_SPAWN_FAILED", e))?;
    if !output.status.success() {
        return Err(cmd_err_stderr(
            "NPM_ROOT_COMMAND_FAILED",
            &String::from_utf8_lossy(&output.stderr),
        ));
    }
    let s = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if s.is_empty() {
        return Err(cmd_err("NPM_ROOT_OUTPUT_EMPTY"));
    }
    Ok(s)
}

/// Global npm uninstall with ENOTEMPTY/rename fallback: uninstall → --force → rm $(npm root -g)/pkg
fn npm_uninstall_global_robust(pkg: &str) -> (bool, i32, String, String) {
    if pkg != "openclaw" && pkg != "clawhub" {
        return (
            false,
            1,
            String::new(),
            "unsupported package for robust uninstall".into(),
        );
    }

    fn run_npm(args: &[&str]) -> (bool, i32, String, String) {
        match Command::new("npm").args(args).output() {
            Ok(output) => {
                let stdout = String::from_utf8_lossy(&output.stdout).to_string();
                let stderr = String::from_utf8_lossy(&output.stderr).to_string();
                let code = output.status.code().unwrap_or(-1);
                (output.status.success(), code, stdout, stderr)
            }
            Err(e) => (false, -1, String::new(), format!("npm spawn failed: {}", e)),
        }
    }

    let (ok1, c1, mut out, mut err) = run_npm(&["uninstall", "-g", pkg]);
    if ok1 {
        return (true, c1, out, err);
    }

    let combined = format!("{} {}", err, out);
    let nasty = combined.contains("ENOTEMPTY")
        || combined.contains("rename")
        || combined.contains("EPERM")
        || combined.contains("EACCES")
        || combined.contains("EEXIST");
    if nasty {
        let (ok2, c2, o2, e2) = run_npm(&["uninstall", "-g", pkg, "--force"]);
        out.push_str(&o2);
        err.push_str(&e2);
        if ok2 {
            return (true, c2, out, err);
        }
    }

    let root = match npm_root_g() {
        Ok(r) => PathBuf::from(r),
        Err(e) => {
            err.push_str(&format!("\nnpm root -g: {}", e));
            return (false, c1, out, err);
        }
    };
    let pkg_dir = root.join(pkg);
    let safe = match pkg_dir.strip_prefix(&root) {
        Ok(rel) => rel.as_os_str() == std::ffi::OsStr::new(pkg),
        Err(_) => false,
    };
    if !safe {
        return (false, c1, out, err);
    }

    if !pkg_dir.exists() {
        return (true, 0, format!("{}\n(全局目录已不存在)", out), err);
    }

    match fs::remove_dir_all(&pkg_dir) {
        Ok(()) => (
            true,
            0,
            format!("{}\n已手动删除: {}", out, pkg_dir.display()),
            err,
        ),
        Err(e) => (false, c1, out, format!("{}\n删除目录失败: {}", err, e)),
    }
}

/// Uninstall openclaw + clawhub via npm (matches web backend)
#[tauri::command]
fn uninstall_openclaw_cli() -> Result<NpmUninstallOutput, String> {
    let a = npm_uninstall_global_robust("openclaw");
    let b = npm_uninstall_global_robust("clawhub");
    let ok = a.0 && b.0;
    let code = if ok {
        0
    } else {
        std::cmp::max(a.1, b.1).max(1)
    };
    Ok(NpmUninstallOutput {
        ok,
        code,
        stdout: format!("{}\n{}", a.2, b.2),
        stderr: format!("{}\n{}", a.3, b.3),
    })
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenclawNpmVersionsDto {
    pub versions: Vec<String>,
    pub dist_tags: HashMap<String, String>,
}

fn validate_npm_openclaw_spec(s: &str) -> Result<(), String> {
    let t = s.trim();
    if t.is_empty() || t == "latest" {
        return Ok(());
    }
    if t.len() > 128 {
        return Err(cmd_err("INVALID_OPENCLAW_VERSION_SPEC"));
    }
    if !t
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-'))
    {
        return Err(cmd_err("INVALID_OPENCLAW_VERSION_SPEC"));
    }
    Ok(())
}

fn cmp_openclaw_version_desc(a: &str, b: &str) -> std::cmp::Ordering {
    fn key(v: &str) -> [i64; 3] {
        let core = v
            .split('-')
            .next()
            .unwrap_or("")
            .split('+')
            .next()
            .unwrap_or("");
        let mut parts = core
            .split('.')
            .map(|p| p.parse::<i64>().unwrap_or(0))
            .collect::<Vec<_>>();
        while parts.len() < 3 {
            parts.push(0);
        }
        [
            parts[0],
            *parts.get(1).unwrap_or(&0),
            *parts.get(2).unwrap_or(&0),
        ]
    }
    let ka = key(a);
    let kb = key(b);
    for i in 0..3 {
        match kb[i].cmp(&ka[i]) {
            std::cmp::Ordering::Equal => {}
            o => return o,
        }
    }
    b.cmp(a)
}

/// List openclaw dist-tags and up to 120 versions from npm (newest first)
#[tauri::command]
fn list_openclaw_npm_versions() -> Result<OpenclawNpmVersionsDto, String> {
    fn npm_stdout(args: &[&str]) -> Result<String, String> {
        let output = Command::new("npm")
            .args(args)
            .output()
            .map_err(|e| cmd_err_d("NPM_SPAWN_FAILED", e))?;
        if !output.status.success() {
            return Err(cmd_err_stderr(
                "NPM_COMMAND_FAILED",
                &String::from_utf8_lossy(&output.stderr),
            ));
        }
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    }

    let v_raw = npm_stdout(&["view", "openclaw", "versions", "--json"])?;
    let parsed: serde_json::Value = serde_json::from_str(v_raw.trim())
        .map_err(|e| cmd_err_d("NPM_VERSIONS_JSON_PARSE_FAILED", e))?;
    let mut versions: Vec<String> = match parsed {
        serde_json::Value::Array(a) => a
            .into_iter()
            .filter_map(|x| x.as_str().map(|s| s.to_string()))
            .collect(),
        serde_json::Value::String(s) => vec![s],
        _ => vec![],
    };
    versions.sort_by(|a, b| cmp_openclaw_version_desc(a, b));
    versions.dedup();
    const MAX: usize = 120;
    if versions.len() > MAX {
        versions.truncate(MAX);
    }

    let dist_tags = match npm_stdout(&["view", "openclaw", "dist-tags", "--json"]) {
        Ok(t_raw) => {
            let t: serde_json::Value =
                serde_json::from_str(t_raw.trim()).unwrap_or(serde_json::json!({}));
            if let serde_json::Value::Object(map) = t {
                map.into_iter()
                    .filter_map(|(k, v)| v.as_str().map(|s| (k, s.to_string())))
                    .collect()
            } else {
                HashMap::new()
            }
        }
        Err(_) => HashMap::new(),
    };

    Ok(OpenclawNpmVersionsDto {
        versions,
        dist_tags,
    })
}

fn run_npm_install_openclaw_global(spec: &str) -> Result<NpmUninstallOutput, String> {
    validate_npm_openclaw_spec(spec)?;
    let pkg = if spec == "latest" {
        "openclaw".to_string()
    } else {
        format!("openclaw@{}", spec)
    };
    let args =
        with_configured_npm_registry_args(&["install".to_string(), "-g".to_string(), pkg.clone()]);
    let output = Command::new("npm")
        .args(&args)
        .output()
        .map_err(|e| cmd_err_d("NPM_SPAWN_FAILED", e))?;
    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    let code = output.status.code().unwrap_or(-1);
    Ok(NpmUninstallOutput {
        ok: output.status.success(),
        code,
        stdout,
        stderr,
    })
}

/// Global install openclaw; `version_spec` is `latest`, empty, or a version / dist-tag
#[tauri::command]
fn npm_install_openclaw_global(version_spec: Option<String>) -> Result<NpmUninstallOutput, String> {
    let spec = version_spec
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .unwrap_or("latest");
    run_npm_install_openclaw_global(spec)
}

/// Global install from local .tgz / .tar.gz (offline-friendly)
#[tauri::command]
fn npm_install_openclaw_from_file(file_path: String) -> Result<NpmUninstallOutput, String> {
    let p = PathBuf::from(file_path.trim());
    if !p.is_file() {
        return Err(cmd_err("INSTALL_FILE_NOT_FILE"));
    }
    let name = p
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_lowercase();
    if !name.ends_with(".tgz") && !name.ends_with(".tar.gz") {
        return Err(cmd_err("INSTALL_FILE_BAD_EXTENSION"));
    }
    let canon = fs::canonicalize(&p).map_err(|e| cmd_err_d("PATH_CANONICALIZE_FAILED", e))?;
    let s = canon.to_string_lossy().to_string();
    let args =
        with_configured_npm_registry_args(&["install".to_string(), "-g".to_string(), s.clone()]);
    let output = Command::new("npm")
        .args(&args)
        .output()
        .map_err(|e| cmd_err_d("NPM_SPAWN_FAILED", e))?;
    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    let code = output.status.code().unwrap_or(-1);
    Ok(NpmUninstallOutput {
        ok: output.status.success(),
        code,
        stdout,
        stderr,
    })
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReinstallStepDto {
    pub id: String,
    pub ok: bool,
    pub message: String,
    pub stdout: String,
    pub stderr: String,
    pub backup_path: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReinstallOpenclawDto {
    pub ok: bool,
    pub steps: Vec<ReinstallStepDto>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReinstallBackupStepDto {
    pub skipped: bool,
    pub path: Option<String>,
    pub message: String,
}

fn internal_reinstall_backup_step() -> Result<ReinstallBackupStepDto, String> {
    let defs = get_backup_defaults()?;
    let data_dir = PathBuf::from(&defs.data_dir);
    if !data_dir.exists() {
        return Ok(ReinstallBackupStepDto {
            skipped: true,
            path: None,
            message: "未找到 OpenClaw 数据目录，已跳过备份".into(),
        });
    }
    match create_openclaw_backup("snapshots".into(), None) {
        Ok(b) => Ok(ReinstallBackupStepDto {
            skipped: false,
            path: Some(b.path.clone()),
            message: format!("已备份: {}", b.path),
        }),
        Err(e) => Err(e),
    }
}

fn internal_reinstall_uninstall_openclaw_step() -> NpmUninstallOutput {
    let (u_ok, u_code, u_stdout, u_stderr) = npm_uninstall_global_robust("openclaw");
    NpmUninstallOutput {
        ok: u_ok,
        code: u_code,
        stdout: u_stdout,
        stderr: u_stderr,
    }
}

/// Phased reinstall: backup only (for progress UI)
#[tauri::command]
fn reinstall_step_backup_openclaw() -> Result<ReinstallBackupStepDto, String> {
    internal_reinstall_backup_step()
}

/// Phased reinstall: uninstall global openclaw only
#[tauri::command]
fn reinstall_step_uninstall_openclaw_cli() -> Result<NpmUninstallOutput, String> {
    Ok(internal_reinstall_uninstall_openclaw_step())
}

/// Backup data dir → uninstall openclaw only → install version (keep clawhub)
#[tauri::command]
fn reinstall_openclaw_global(version_spec: Option<String>) -> Result<ReinstallOpenclawDto, String> {
    let mut steps: Vec<ReinstallStepDto> = Vec::new();

    match internal_reinstall_backup_step() {
        Ok(dto) => {
            steps.push(ReinstallStepDto {
                id: "backup".into(),
                ok: true,
                message: dto.message.clone(),
                stdout: dto.path.clone().unwrap_or_default(),
                stderr: String::new(),
                backup_path: dto.path.clone(),
            });
        }
        Err(e) => {
            steps.push(ReinstallStepDto {
                id: "backup".into(),
                ok: false,
                message: "备份失败，已中止重装".into(),
                stdout: String::new(),
                stderr: e.clone(),
                backup_path: None,
            });
            return Ok(ReinstallOpenclawDto { ok: false, steps });
        }
    }

    let u = internal_reinstall_uninstall_openclaw_step();
    steps.push(ReinstallStepDto {
        id: "uninstall".into(),
        ok: u.ok,
        message: if u.ok {
            "已卸载全局 openclaw（必要时 --force 或清理 node_modules/openclaw）".into()
        } else {
            "卸载 openclaw 仍失败，将继续尝试安装".into()
        },
        stdout: u.stdout,
        stderr: u.stderr,
        backup_path: None,
    });

    let spec = version_spec
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .unwrap_or("latest");
    let install_result = run_npm_install_openclaw_global(spec)?;
    let install_ok = install_result.ok;
    steps.push(ReinstallStepDto {
        id: "install".into(),
        ok: install_ok,
        message: if install_ok {
            "安装完成".into()
        } else {
            "安装失败".into()
        },
        stdout: install_result.stdout,
        stderr: install_result.stderr,
        backup_path: None,
    });

    let backup_ok = steps
        .iter()
        .find(|s| s.id == "backup")
        .map(|s| s.ok)
        .unwrap_or(false);
    let ok = backup_ok && install_ok;
    Ok(ReinstallOpenclawDto { ok, steps })
}

fn format_backup_ts() -> String {
    match Command::new("date").args(["+%Y%m%d_%H%M%S"]).output() {
        Ok(o) if o.status.success() => {
            let s = String::from_utf8_lossy(&o.stdout).trim().to_string();
            if !s.is_empty() {
                return s;
            }
        }
        _ => {}
    }
    format!(
        "{}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0)
    )
}

fn copy_dir_all(src: &Path, dst: &Path) -> Result<(), String> {
    fs::create_dir_all(dst).map_err(|e| cmd_err_d("IO_ERROR", e))?;
    for entry in fs::read_dir(src).map_err(|e| cmd_err_d("IO_ERROR", e))? {
        let entry = entry.map_err(|e| cmd_err_d("IO_ERROR", e))?;
        let ty = entry.file_type().map_err(|e| cmd_err_d("IO_ERROR", e))?;
        let from = entry.path();
        let to = dst.join(entry.file_name());
        if ty.is_dir() {
            copy_dir_all(&from, &to)?;
        } else {
            fs::copy(&from, &to).map_err(|e| cmd_err_d("IO_ERROR", e))?;
        }
    }
    Ok(())
}

fn expand_home_path(p: &str) -> PathBuf {
    let t = p.trim();
    if let Some(rest) = t.strip_prefix("~/") {
        return dirs::home_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join(rest);
    }
    PathBuf::from(t)
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupDefaultsDto {
    pub desktop_dir: String,
    pub snapshots_dir: String,
    pub data_dir: String,
    pub default_backup_path: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateBackupDto {
    pub path: String,
    pub snapshot_id: String,
    pub size: u64,
    pub checksum: String,
    pub export_dir: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupListDto {
    pub files: Vec<String>,
}

#[tauri::command]
fn get_backup_defaults() -> Result<BackupDefaultsDto, String> {
    let home = dirs::home_dir().ok_or_else(|| cmd_err("HOME_DIR_UNRESOLVED"))?;
    let desktop = home.join("Desktop");
    let desktop_dir = if desktop.is_dir() {
        desktop.to_string_lossy().to_string()
    } else {
        home.to_string_lossy().to_string()
    };
    let snapshots_dir = home
        .join(".openclaw_snapshots")
        .to_string_lossy()
        .to_string();
    let data_dir = get_config_path()
        .parent()
        .ok_or_else(|| cmd_err("CONFIG_PARENT_INVALID"))?
        .to_string_lossy()
        .to_string();
    Ok(BackupDefaultsDto {
        desktop_dir,
        default_backup_path: snapshots_dir.clone(),
        snapshots_dir,
        data_dir,
    })
}

#[tauri::command]
fn create_openclaw_backup(
    mode: String,
    export_dir: Option<String>,
) -> Result<CreateBackupDto, String> {
    let defs = get_backup_defaults()?;
    let out_parent = match mode.as_str() {
        "snapshots" => PathBuf::from(&defs.snapshots_dir),
        "desktop" => PathBuf::from(&defs.desktop_dir),
        "custom" => {
            let s = export_dir
                .filter(|x| !x.trim().is_empty())
                .ok_or_else(|| cmd_err("BACKUP_CUSTOM_EXPORT_DIR_REQUIRED"))?;
            expand_home_path(&s)
        }
        _ => return Err(cmd_err("BACKUP_MODE_INVALID")),
    };
    let data_dir = PathBuf::from(&defs.data_dir);
    if !data_dir.exists() {
        return Err(cmd_err("BACKUP_DATA_DIR_NOT_FOUND"));
    }
    fs::create_dir_all(&out_parent).map_err(|e| cmd_err_d("IO_ERROR", e))?;
    let ts = format_backup_ts();
    let snap_id = format!("openclaw_backup_{}", ts);
    let tmp = std::env::temp_dir().join(format!("ocb-{}", ts));
    let snap_root = tmp.join(&snap_id);
    let data_target = snap_root.join("openclaw_data");
    fs::create_dir_all(&data_target).map_err(|e| cmd_err_d("IO_ERROR", e))?;
    copy_dir_all(&data_dir, &data_target)?;
    let created = format!("{:?}", std::time::SystemTime::now());
    let meta = serde_json::json!({
        "id": snap_id,
        "name": "pre_uninstall_backup",
        "description": "卸载前备份（龙虾管家）",
        "type": "clawmaster",
        "timestamp": ts,
        "created_at": created,
        "version": "1.0"
    });
    let meta_str = serde_json::to_string_pretty(&meta).map_err(|e| cmd_err_d("IO_ERROR", e))?;
    fs::write(snap_root.join("snapshot.json"), meta_str).map_err(|e| cmd_err_d("IO_ERROR", e))?;
    let tar_path = out_parent.join(format!("{}.tar.gz", snap_id));
    let st = Command::new("tar")
        .arg("-czf")
        .arg(&tar_path)
        .arg("-C")
        .arg(&tmp)
        .arg(&snap_id)
        .status()
        .map_err(|e| cmd_err_d("TAR_SPAWN_FAILED", e))?;
    if !st.success() {
        let _ = fs::remove_dir_all(&tmp);
        return Err(cmd_err("TAR_PACK_FAILED"));
    }
    let _ = fs::remove_dir_all(&tmp);
    let size = fs::metadata(&tar_path)
        .map_err(|e| cmd_err_d("IO_ERROR", e))?
        .len();
    Ok(CreateBackupDto {
        path: tar_path.to_string_lossy().to_string(),
        snapshot_id: snap_id,
        size,
        checksum: "n/a".to_string(),
        export_dir: out_parent.to_string_lossy().to_string(),
    })
}

#[tauri::command]
fn list_openclaw_backups() -> Result<BackupListDto, String> {
    let defs = get_backup_defaults()?;
    let dir = PathBuf::from(defs.snapshots_dir);
    if !dir.exists() {
        return Ok(BackupListDto { files: vec![] });
    }
    let mut files: Vec<String> = fs::read_dir(&dir)
        .map_err(|e| cmd_err_d("IO_ERROR", e))?
        .filter_map(|e| e.ok())
        .map(|e| e.path())
        .filter(|p| p.to_string_lossy().ends_with(".tar.gz"))
        .map(|p| p.to_string_lossy().to_string())
        .collect();
    files.sort_by(|a, b| b.cmp(a));
    Ok(BackupListDto { files })
}

#[tauri::command]
fn restore_openclaw_backup(tar_path: String) -> Result<(), String> {
    let tar = expand_home_path(tar_path.trim());
    if !tar.exists() || !tar.to_string_lossy().ends_with(".gz") {
        return Err(cmd_err("RESTORE_BACKUP_INVALID"));
    }
    let tmp = std::env::temp_dir().join(format!("ocr-{}", format_backup_ts()));
    fs::create_dir_all(&tmp).map_err(|e| cmd_err_d("IO_ERROR", e))?;
    let st = Command::new("tar")
        .arg("-xzf")
        .arg(&tar)
        .arg("-C")
        .arg(&tmp)
        .status()
        .map_err(|e| cmd_err_d("TAR_SPAWN_FAILED", e))?;
    if !st.success() {
        let _ = fs::remove_dir_all(&tmp);
        return Err(cmd_err("RESTORE_TAR_EXTRACT_FAILED"));
    }
    let mut data_src: Option<PathBuf> = None;
    for entry in fs::read_dir(&tmp).map_err(|e| cmd_err_d("IO_ERROR", e))? {
        let entry = entry.map_err(|e| cmd_err_d("IO_ERROR", e))?;
        if entry
            .file_type()
            .map_err(|e| cmd_err_d("IO_ERROR", e))?
            .is_dir()
        {
            let p = entry.path().join("openclaw_data");
            if p.is_dir() {
                data_src = Some(p);
                break;
            }
        }
    }
    let data_src = data_src.ok_or_else(|| cmd_err("RESTORE_NO_DATA_IN_ARCHIVE"))?;
    let target = get_config_path()
        .parent()
        .ok_or_else(|| cmd_err("CONFIG_PARENT_INVALID"))?
        .to_path_buf();
    if target.exists() {
        let bak = format!(
            "{}.bak.{}",
            target.to_string_lossy(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_millis())
                .unwrap_or(0)
        );
        fs::rename(&target, &bak).map_err(|e| cmd_err_d("IO_ERROR", e))?;
    }
    fs::create_dir_all(&target).map_err(|e| cmd_err_d("IO_ERROR", e))?;
    copy_dir_all(&data_src, &target)?;
    let _ = fs::remove_dir_all(&tmp);
    Ok(())
}

#[tauri::command]
fn remove_openclaw_data(confirm: String) -> Result<(), String> {
    if confirm != "DELETE" {
        return Err(cmd_err("REMOVE_DATA_CONFIRM_INVALID"));
    }
    let target = get_config_path()
        .parent()
        .ok_or_else(|| cmd_err("CONFIG_PARENT_INVALID"))?
        .to_path_buf();
    if target.exists() {
        fs::remove_dir_all(&target).map_err(|e| cmd_err_d("IO_ERROR", e))?;
    }
    Ok(())
}

#[tauri::command]
fn read_runtime_text_file(path_input: String) -> Result<RuntimeTextFileDto, String> {
    let path = resolve_runtime_input_path(&path_input)?;
    let content = read_active_openclaw_text_file(&path)?;
    Ok(RuntimeTextFileDto {
        path: path.to_string_lossy().to_string(),
        exists: content.is_some(),
        content: content.unwrap_or_default(),
    })
}

#[tauri::command]
fn list_content_draft_variants() -> Result<Vec<ContentDraftVariantSummaryDto>, String> {
    list_content_draft_variants_state()
}

#[tauri::command]
fn read_content_draft_text_file(path_input: String) -> Result<RequiredRuntimeTextFileDto, String> {
    let path = resolve_allowed_content_draft_path(&path_input)?;
    let content = read_active_openclaw_text_file(&path)?.ok_or_else(|| {
        cmd_err_p(
            "CONTENT_DRAFT_FILE_NOT_FOUND",
            serde_json::json!({ "path": path.to_string_lossy() }),
        )
    })?;
    Ok(RequiredRuntimeTextFileDto {
        path: path.to_string_lossy().to_string(),
        content,
    })
}

#[tauri::command]
fn read_content_draft_image_file(path_input: String) -> Result<RuntimeBinaryFileDto, String> {
    let path = resolve_allowed_content_draft_path(&path_input)?;
    let bytes = read_active_openclaw_binary_file(&path)?.ok_or_else(|| {
        cmd_err_p(
            "CONTENT_DRAFT_FILE_NOT_FOUND",
            serde_json::json!({ "path": path.to_string_lossy() }),
        )
    })?;
    Ok(RuntimeBinaryFileDto {
        path: path.to_string_lossy().to_string(),
        mime_type: content_draft_mime_type(&path),
        base64: encode_base64_standard(&bytes),
    })
}

#[tauri::command]
fn delete_content_draft_variant(path_input: String) -> Result<ContentDraftDeleteResultDto, String> {
    let manifest_path = resolve_allowed_content_draft_path(&path_input)?;
    if manifest_path.file_name().and_then(|value| value.to_str()) != Some("manifest.json") {
        return Err(cmd_err_p(
            "CONTENT_DRAFT_INVALID_MANIFEST_PATH",
            serde_json::json!({ "path": manifest_path.to_string_lossy() }),
        ));
    }

    let platform_dir = manifest_path.parent().ok_or_else(|| {
        cmd_err_p(
            "CONTENT_DRAFT_INVALID_MANIFEST_PATH",
            serde_json::json!({ "path": manifest_path.to_string_lossy() }),
        )
    })?;
    let run_dir = platform_dir.parent().ok_or_else(|| {
        cmd_err_p(
            "CONTENT_DRAFT_INVALID_MANIFEST_PATH",
            serde_json::json!({ "path": manifest_path.to_string_lossy() }),
        )
    })?;

    if !content_draft_path_allowed(platform_dir) {
        return Err(cmd_err_p(
            "CONTENT_DRAFT_PATH_NOT_ALLOWED",
            serde_json::json!({ "path": platform_dir.to_string_lossy() }),
        ));
    }

    #[cfg(target_os = "windows")]
    if let Some(distro) = active_wsl_distro() {
        let remove_output = run_wsl_shell(
            &distro,
            &format!(
                "rm -rf {}",
                shell_escape_posix_arg(&platform_dir.to_string_lossy())
            ),
            None,
        )?;
        if remove_output.code != 0 {
            return Err(cmd_err_d(
                "CONTENT_DRAFT_DELETE_FAILED",
                remove_output.stderr.trim(),
            ));
        }

        let prune_output = run_wsl_shell(
            &distro,
            &format!(
                "[ -d {run_dir} ] && rmdir {run_dir} 2>/dev/null || true",
                run_dir = shell_escape_posix_arg(&run_dir.to_string_lossy())
            ),
            None,
        )?;
        if prune_output.code != 0 {
            return Err(cmd_err_d(
                "CONTENT_DRAFT_DELETE_FAILED",
                prune_output.stderr.trim(),
            ));
        }

        return Ok(ContentDraftDeleteResultDto {
            removed_path: platform_dir.to_string_lossy().to_string(),
        });
    }

    fs::remove_dir_all(platform_dir).map_err(|error| {
        cmd_err_p(
            "CONTENT_DRAFT_DELETE_FAILED",
            serde_json::json!({
                "path": platform_dir.to_string_lossy(),
                "detail": error.to_string(),
            }),
        )
    })?;

    if run_dir.is_dir() {
        let mut entries = fs::read_dir(run_dir).map_err(|error| {
            cmd_err_p(
                "CONTENT_DRAFT_DELETE_FAILED",
                serde_json::json!({
                    "path": run_dir.to_string_lossy(),
                    "detail": error.to_string(),
                }),
            )
        })?;
        if entries.next().is_none() {
            fs::remove_dir(run_dir).map_err(|error| {
                cmd_err_p(
                    "CONTENT_DRAFT_DELETE_FAILED",
                    serde_json::json!({
                        "path": run_dir.to_string_lossy(),
                        "detail": error.to_string(),
                    }),
                )
            })?;
        }
    }

    Ok(ContentDraftDeleteResultDto {
        removed_path: platform_dir.to_string_lossy().to_string(),
    })
}

#[tauri::command]
fn read_required_runtime_text_file(
    path_input: String,
) -> Result<RequiredRuntimeTextFileDto, String> {
    let path = resolve_runtime_input_path(&path_input)?;
    let content = read_active_openclaw_text_file(&path)?.ok_or_else(|| {
        cmd_err_p(
            "RUNTIME_FILE_NOT_FOUND",
            serde_json::json!({ "path": path.to_string_lossy() }),
        )
    })?;
    Ok(RequiredRuntimeTextFileDto {
        path: path.to_string_lossy().to_string(),
        content,
    })
}

#[tauri::command]
fn write_runtime_text_file(path_input: String, content: String) -> Result<String, String> {
    let path = resolve_runtime_input_path(&path_input)?;
    write_active_openclaw_text_file(&path, &content)?;
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
fn list_mcp_import_candidates() -> Result<Vec<McpImportCandidateDto>, String> {
    let definitions = vec![
        ("project-mcp", "json", Some(".mcp.json"), None),
        ("cursor", "json", Some(".cursor/mcp.json"), None),
        ("vscode", "json", Some(".vscode/mcp.json"), None),
        ("claude-user", "json", None, Some(".claude.json")),
        ("codex-user", "toml", None, Some(".codex/config.toml")),
        (
            "copilot-user",
            "json",
            None,
            Some(".copilot/mcp-config.json"),
        ),
    ];

    let mut out = Vec::new();
    for (id, format, relative_path, home_path) in definitions {
        let input = if let Some(relative_path) = relative_path {
            relative_path.to_string()
        } else {
            format!("~/{}", home_path.unwrap_or_default())
        };
        let path = resolve_runtime_input_path(&input)?;
        let exists = read_active_openclaw_text_file(&path)?.is_some();
        out.push(McpImportCandidateDto {
            id: id.to_string(),
            format: format.to_string(),
            path: path.to_string_lossy().to_string(),
            exists,
        });
    }
    Ok(out)
}

fn expand_log_file_path(f: &str) -> PathBuf {
    let t = f.trim();
    if let Some(rest) = t.strip_prefix("~/") {
        return dirs::home_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join(rest);
    }
    PathBuf::from(t)
}

/// Same order as packages/backend/src/paths.ts getOpenclawLogReadPaths: logging.file → gateway.log → openclaw.log
fn openclaw_log_read_paths() -> Vec<PathBuf> {
    let mut paths = Vec::new();
    let config_path = get_config_path();
    if let Ok(Some(raw)) = read_active_openclaw_text_file(&config_path) {
        if let Ok(v) = serde_json::from_str::<serde_json::Value>(&raw) {
            if let Some(file) = v
                .get("logging")
                .and_then(|l| l.get("file"))
                .and_then(|x| x.as_str())
            {
                paths.push(expand_log_file_path(file));
            }
        }
    }
    #[cfg(target_os = "windows")]
    if active_wsl_distro().is_some() {
        let logs_dir = join_posix(&dirname_posix(&config_path.to_string_lossy()), "logs");
        for name in ["gateway.log", "openclaw.log"] {
            let p = PathBuf::from(join_posix(&logs_dir, name));
            if !paths.contains(&p) {
                paths.push(p);
            }
        }
        return paths;
    }

    let logs_dir = config_path
        .parent()
        .unwrap_or(&PathBuf::from("."))
        .join("logs");
    for name in ["gateway.log", "openclaw.log"] {
        let p = logs_dir.join(name);
        if !paths.contains(&p) {
            paths.push(p);
        }
    }
    paths
}

// Tail log files
#[tauri::command]
fn get_logs(lines: usize) -> Result<Vec<String>, String> {
    for log_path in openclaw_log_read_paths() {
        let content = {
            #[cfg(target_os = "windows")]
            if let Some(distro) = active_wsl_distro() {
                match read_text_file_in_wsl(&distro, &log_path.to_string_lossy())? {
                    Some(content) => content,
                    None => continue,
                }
            } else {
                if !log_path.exists() {
                    continue;
                }
                fs::read_to_string(&log_path).map_err(|e| cmd_err_d("LOG_READ_FAILED", e))?
            }

            #[cfg(not(target_os = "windows"))]
            {
                if !log_path.exists() {
                    continue;
                }
                fs::read_to_string(&log_path).map_err(|e| cmd_err_d("LOG_READ_FAILED", e))?
            }
        };
        let non_empty: Vec<&str> = content.lines().filter(|l| !l.is_empty()).collect();
        if non_empty.is_empty() {
            continue;
        }
        let start = non_empty.len().saturating_sub(lines);
        let logs: Vec<String> = non_empty[start..]
            .iter()
            .map(|s| (*s).to_string())
            .collect();
        return Ok(logs);
    }
    Ok(vec![])
}

// Run arbitrary openclaw CLI args
#[tauri::command]
fn run_openclaw_command(args: Vec<String>) -> Result<String, String> {
    let output = openclaw_cmd()
        .args(&args)
        .output()
        .map_err(|e| cmd_err_d("OPENCLAW_CMD_SPAWN_FAILED", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    if output.status.success() {
        Ok(stdout)
    } else {
        Err(cmd_err_stderr("OPENCLAW_CMD_FAILED", &stderr))
    }
}

/// Same as `run_openclaw_command` but always returns stdout/stderr/exit code (for probes, diagnostics).
#[derive(Debug, Clone, Serialize)]
pub struct OpenclawCapturedOutput {
    pub code: i32,
    pub stdout: String,
    pub stderr: String,
}

#[tauri::command]
fn run_openclaw_command_captured(args: Vec<String>) -> Result<OpenclawCapturedOutput, String> {
    let output = openclaw_cmd()
        .args(&args)
        .output()
        .map_err(|e| cmd_err_d("OPENCLAW_CMD_SPAWN_FAILED", e))?;
    Ok(OpenclawCapturedOutput {
        code: output.status.code().unwrap_or(-1),
        stdout: String::from_utf8_lossy(&output.stdout).to_string(),
        stderr: String::from_utf8_lossy(&output.stderr).to_string(),
    })
}

#[tauri::command]
fn list_openclaw_memory_files() -> Result<OpenclawMemoryFilesPayload, String> {
    let root = get_openclaw_memory_dir();

    #[cfg(target_os = "windows")]
    if let Some(distro) = active_wsl_distro() {
        let mut files = collect_openclaw_memory_files_wsl(&distro, &root.to_string_lossy())?;
        files.sort_by(|a, b| a.relative_path.cmp(&b.relative_path));
        return Ok(OpenclawMemoryFilesPayload {
            root: root.to_string_lossy().to_string(),
            files,
        });
    }

    if !root.is_dir() {
        return Ok(OpenclawMemoryFilesPayload {
            root: root.to_string_lossy().to_string(),
            files: vec![],
        });
    }
    let mut files = Vec::new();
    collect_openclaw_memory_files(&root, &root, &mut files)?;
    files.sort_by(|a, b| a.relative_path.cmp(&b.relative_path));
    Ok(OpenclawMemoryFilesPayload {
        root: root.to_string_lossy().to_string(),
        files,
    })
}

#[tauri::command]
fn delete_openclaw_memory_file(relative_path: String) -> Result<(), String> {
    let target = resolve_openclaw_memory_relative_path(&relative_path)?;

    #[cfg(target_os = "windows")]
    if let Some(distro) = active_wsl_distro() {
        let output = run_wsl_shell(
            &distro,
            &format!(
                "rm -f {}",
                shell_escape_posix_arg(&target.to_string_lossy())
            ),
            None,
        )?;
        if output.code == 0 {
            return Ok(());
        }
        return Err(cmd_err_d(
            "OPENCLAW_MEMORY_FILE_DELETE_FAILED",
            output.stderr.trim(),
        ));
    }

    fs::remove_file(target).map_err(|e| cmd_err_d("OPENCLAW_MEMORY_FILE_DELETE_FAILED", e))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RunOpenclawStdinPayload {
    args: Vec<String>,
    stdin_payload: String,
}

/// Pipe stdin (e.g. `y\\n` for `plugins uninstall` when `--yes` is not a valid flag).
#[tauri::command]
fn run_openclaw_command_stdin(payload: RunOpenclawStdinPayload) -> Result<String, String> {
    let mut command = openclaw_cmd();
    let mut child = command
        .args(&payload.args)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| cmd_err_d("OPENCLAW_CMD_SPAWN_FAILED", e))?;

    if let Some(mut stdin) = child.stdin.take() {
        stdin
            .write_all(payload.stdin_payload.as_bytes())
            .map_err(|e| cmd_err_d("OPENCLAW_CMD_STDIN_WRITE_FAILED", e))?;
    }

    let output = child
        .wait_with_output()
        .map_err(|e| cmd_err_d("OPENCLAW_CMD_WAIT_FAILED", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    if output.status.success() {
        Ok(stdout)
    } else {
        Err(cmd_err_stderr("OPENCLAW_CMD_FAILED", &stderr))
    }
}

fn models_dev_provider_aliases(provider_id: &str) -> &'static [&'static str] {
    match provider_id {
        "alibaba" => &["alibaba", "qwen"],
        "deepseek" => &["deepseek", "deepseek-ai"],
        "moonshotai" => &["moonshotai", "moonshot", "kimi-coding"],
        "zhipuai" => &["zhipuai", "zhipu", "zai-org"],
        _ => &[],
    }
}

fn routed_model_prefixes() -> &'static [&'static [&'static str]] {
    &[&["openrouter"], &["siliconflow"], &["siliconflow", "Pro"]]
}

fn build_models_dev_lookup_keys(
    provider_aliases: &[&str],
    model_id: &str,
    model_key: &str,
) -> Vec<String> {
    let mut keys = Vec::new();
    let mut seen = std::collections::HashSet::new();
    let model_variants = [model_id.trim(), model_key.trim()]
        .into_iter()
        .filter(|value| !value.is_empty())
        .collect::<Vec<_>>();

    for provider_alias in provider_aliases {
        for model_variant in &model_variants {
            let direct = format!("{provider_alias}/{model_variant}");
            if seen.insert(direct.clone()) {
                keys.push(direct);
            }
            for prefix_parts in routed_model_prefixes() {
                let routed = prefix_parts
                    .iter()
                    .copied()
                    .chain([*provider_alias, *model_variant])
                    .collect::<Vec<_>>()
                    .join("/");
                if seen.insert(routed.clone()) {
                    keys.push(routed);
                }
            }
        }
    }

    keys
}

fn value_as_object(
    value: &serde_json::Value,
) -> Option<&serde_json::Map<String, serde_json::Value>> {
    value.as_object()
}

fn value_to_non_negative_f64(value: Option<&serde_json::Value>) -> Option<f64> {
    value
        .and_then(|item| item.as_f64())
        .filter(|item| item.is_finite() && *item >= 0.0)
}

fn normalize_multiplier(value: f64, input: f64) -> f64 {
    ((value / input) * 1_000_000.0).round() / 1_000_000.0
}

fn build_models_dev_custom_price(raw_cost: &serde_json::Value) -> Option<serde_json::Value> {
    let cost = value_as_object(raw_cost)?;
    let input = value_to_non_negative_f64(cost.get("input"))?;
    let output = value_to_non_negative_f64(cost.get("output"))?;
    let mut custom_price = serde_json::Map::new();
    custom_price.insert("input".to_string(), serde_json::json!(input));
    custom_price.insert("output".to_string(), serde_json::json!(output));

    if input > 0.0 {
        if let Some(cache_read) = value_to_non_negative_f64(cost.get("cache_read")) {
            custom_price.insert(
                "cacheReadMultiplier".to_string(),
                serde_json::json!(normalize_multiplier(cache_read, input)),
            );
        }
        if let Some(cache_write) = value_to_non_negative_f64(cost.get("cache_write")) {
            custom_price.insert(
                "cacheWriteMultiplier".to_string(),
                serde_json::json!(normalize_multiplier(cache_write, input)),
            );
        }
    }

    Some(serde_json::Value::Object(custom_price))
}

fn build_clawprobe_custom_prices_from_models_dev_catalog(
    raw_catalog: &serde_json::Value,
) -> serde_json::Map<String, serde_json::Value> {
    let Some(catalog) = value_as_object(raw_catalog) else {
        return serde_json::Map::new();
    };

    let mut prices = serde_json::Map::new();
    for (provider_id, raw_provider) in catalog {
        let Some(provider) = value_as_object(raw_provider) else {
            continue;
        };
        let Some(models) = provider.get("models").and_then(value_as_object) else {
            continue;
        };

        let aliases = models_dev_provider_aliases(provider_id);
        let alias_values: Vec<&str> = if aliases.is_empty() {
            vec![provider_id.as_str()]
        } else {
            aliases.to_vec()
        };

        for (model_key, raw_model) in models {
            let Some(model) = value_as_object(raw_model) else {
                continue;
            };
            let model_id = model
                .get("id")
                .and_then(|value| value.as_str())
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .unwrap_or(model_key.as_str());
            let Some(custom_price) = model.get("cost").and_then(build_models_dev_custom_price)
            else {
                continue;
            };
            for lookup_key in build_models_dev_lookup_keys(&alias_values, model_id, model_key) {
                prices.insert(lookup_key, custom_price.clone());
            }
        }
    }

    prices
}

fn is_leap_year(year: i32) -> bool {
    (year % 4 == 0 && year % 100 != 0) || year % 400 == 0
}

fn days_in_month(year: i32, month: u32) -> Option<u32> {
    match month {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => Some(31),
        4 | 6 | 9 | 11 => Some(30),
        2 => Some(if is_leap_year(year) { 29 } else { 28 }),
        _ => None,
    }
}

fn days_from_civil(year: i32, month: u32, day: u32) -> i64 {
    let year = year - i32::from(month <= 2);
    let era = if year >= 0 { year } else { year - 399 } / 400;
    let yoe = year - era * 400;
    let month = month as i32;
    let day = day as i32;
    let doy = (153 * (month + if month > 2 { -3 } else { 9 }) + 2) / 5 + day - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era as i64 * 146_097 + doe as i64 - 719_468
}

fn parse_models_dev_fetched_at(value: &str) -> Option<u64> {
    let trimmed = value.trim();
    let (date_part, time_part) = trimmed.split_once('T')?;
    let time_part = time_part.strip_suffix('Z')?;

    let mut date_iter = date_part.split('-');
    let year = date_iter.next()?.parse::<i32>().ok()?;
    let month = date_iter.next()?.parse::<u32>().ok()?;
    let day = date_iter.next()?.parse::<u32>().ok()?;
    if date_iter.next().is_some() {
        return None;
    }
    if !(1..=12).contains(&month) || day == 0 || day > days_in_month(year, month)? {
        return None;
    }

    let (clock_part, fraction_part) = match time_part.split_once('.') {
        Some((clock, fraction)) => (clock, Some(fraction)),
        None => (time_part, None),
    };
    let mut time_iter = clock_part.split(':');
    let hour = time_iter.next()?.parse::<u32>().ok()?;
    let minute = time_iter.next()?.parse::<u32>().ok()?;
    let second = time_iter.next()?.parse::<u32>().ok()?;
    if time_iter.next().is_some() || hour > 23 || minute > 59 || second > 59 {
        return None;
    }

    let millis = match fraction_part {
        Some(raw) => {
            if raw.is_empty() || raw.len() > 9 || !raw.chars().all(|ch| ch.is_ascii_digit()) {
                return None;
            }
            let digits = raw
                .chars()
                .take(3)
                .collect::<String>()
                .parse::<u32>()
                .ok()?;
            match raw.len() {
                1 => digits * 100,
                2 => digits * 10,
                _ => digits,
            }
        }
        None => 0,
    };

    let days = days_from_civil(year, month, day);
    if days < 0 {
        return None;
    }

    Some(
        (((days as u64 * 24 + hour as u64) * 60 + minute as u64) * 60 + second as u64) * 1000
            + millis as u64,
    )
}

fn current_time_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0)
}

fn models_dev_cache_path_for_runtime() -> Option<String> {
    #[cfg(target_os = "windows")]
    if let Some(distro) = active_wsl_distro() {
        return Some(join_posix(
            &get_wsl_home_dir(&distro),
            ".openclaw/cache/models-dev.json",
        ));
    }

    let home_dir = dirs::home_dir()?;
    Some(
        home_dir
            .join(".openclaw")
            .join("cache")
            .join("models-dev.json")
            .to_string_lossy()
            .to_string(),
    )
}

fn read_fresh_models_dev_custom_prices() -> Option<serde_json::Map<String, serde_json::Value>> {
    let cache_path = models_dev_cache_path_for_runtime()?;

    #[cfg(target_os = "windows")]
    let payload_raw = if let Some(distro) = active_wsl_distro() {
        read_text_file_in_wsl(&distro, &cache_path).ok().flatten()
    } else {
        fs::read_to_string(&cache_path).ok()
    };

    #[cfg(not(target_os = "windows"))]
    let payload_raw = fs::read_to_string(&cache_path).ok();

    let payload = serde_json::from_str::<serde_json::Value>(&payload_raw?).ok()?;
    let fetched_at = payload
        .get("fetchedAt")
        .and_then(|value| value.as_str())
        .and_then(parse_models_dev_fetched_at)?;
    let now = current_time_millis();
    if now.saturating_sub(fetched_at) > MODELS_DEV_CACHE_MAX_AGE_MS {
        return None;
    }

    let catalog = payload.get("catalog")?;
    let prices = build_clawprobe_custom_prices_from_models_dev_catalog(catalog);
    if prices.is_empty() {
        None
    } else {
        Some(prices)
    }
}

fn build_clawprobe_config_override(
    base_config: &serde_json::Value,
    custom_prices: &serde_json::Map<String, serde_json::Value>,
) -> serde_json::Value {
    let mut merged = base_config
        .as_object()
        .cloned()
        .unwrap_or_else(serde_json::Map::new);
    let mut cost = merged
        .get("cost")
        .and_then(|value| value.as_object())
        .cloned()
        .unwrap_or_else(serde_json::Map::new);
    let mut current_prices = cost
        .get("customPrices")
        .and_then(|value| value.as_object())
        .cloned()
        .unwrap_or_else(serde_json::Map::new);
    for (key, value) in custom_prices {
        current_prices
            .entry(key.clone())
            .or_insert_with(|| value.clone());
    }
    cost.insert(
        "customPrices".to_string(),
        serde_json::Value::Object(current_prices),
    );
    merged.insert("cost".to_string(), serde_json::Value::Object(cost));
    serde_json::Value::Object(merged)
}

fn mirror_clawprobe_files_for_override(
    source_probe_dir: &Path,
    target_probe_dir: &Path,
) -> Result<(), String> {
    if !source_probe_dir.exists() {
        return Ok(());
    }
    fs::create_dir_all(target_probe_dir).map_err(|e| cmd_err_d("IO_ERROR", e))?;
    for entry in fs::read_dir(source_probe_dir).map_err(|e| cmd_err_d("IO_ERROR", e))? {
        let entry = entry.map_err(|e| cmd_err_d("IO_ERROR", e))?;
        let from = entry.path();
        let to = target_probe_dir.join(entry.file_name());
        if entry
            .file_name()
            .to_str()
            .map(|value| value == "config.json")
            .unwrap_or(false)
        {
            continue;
        }
        let file_type = entry.file_type().map_err(|e| cmd_err_d("IO_ERROR", e))?;
        if file_type.is_dir() {
            fs::create_dir_all(&to).map_err(|e| cmd_err_d("IO_ERROR", e))?;
            mirror_clawprobe_files_for_override(&from, &to)?;
        } else {
            if let Err(link_error) = fs::hard_link(&from, &to) {
                if to.exists() {
                    fs::remove_file(&to).map_err(|e| cmd_err_d("IO_ERROR", e))?;
                }
                fs::copy(&from, &to).map_err(|copy_error| {
                    cmd_err_d(
                        "IO_ERROR",
                        format!("hard link failed: {link_error}; copy failed: {copy_error}"),
                    )
                })?;
            }
        }
    }
    Ok(())
}

struct TempDirCleanupGuard {
    path: PathBuf,
}

impl TempDirCleanupGuard {
    fn new(path: PathBuf) -> Self {
        Self { path }
    }

    fn path(&self) -> &Path {
        &self.path
    }
}

impl Drop for TempDirCleanupGuard {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.path);
    }
}

#[cfg(target_os = "windows")]
struct WslTempDirCleanupGuard {
    distro: String,
    path: String,
}

#[cfg(target_os = "windows")]
impl WslTempDirCleanupGuard {
    fn new(distro: String, path: String) -> Self {
        Self { distro, path }
    }
}

#[cfg(target_os = "windows")]
impl Drop for WslTempDirCleanupGuard {
    fn drop(&mut self) {
        let _ = run_wsl_shell(
            &self.distro,
            &format!("rm -rf {}", shell_escape_posix_arg(&self.path)),
            None,
        );
    }
}

fn create_runtime_temp_dir(prefix: &str) -> Result<PathBuf, String> {
    let temp_root = std::env::temp_dir();
    for _ in 0..64 {
        let dir = temp_root.join(format!(
            "clawmaster-{prefix}-{}-{}-{}",
            std::process::id(),
            current_time_millis(),
            RUNTIME_TEMP_DIR_COUNTER.fetch_add(1, Ordering::Relaxed)
        ));
        match fs::create_dir(&dir) {
            Ok(()) => return Ok(dir),
            Err(error) if error.kind() == ErrorKind::AlreadyExists => continue,
            Err(error) => return Err(cmd_err_d("IO_ERROR", error)),
        }
    }
    Err(cmd_err_d(
        "IO_ERROR",
        format!("failed to allocate unique temp dir for {prefix}"),
    ))
}

fn build_clawprobe_env_overrides(
    temp_home: &Path,
    openclaw_dir: &Path,
) -> Vec<(&'static str, String)> {
    #[cfg(target_os = "windows")]
    {
        return vec![
            ("HOME", temp_home.to_string_lossy().to_string()),
            ("OPENCLAW_DIR", openclaw_dir.to_string_lossy().to_string()),
            ("USERPROFILE", temp_home.to_string_lossy().to_string()),
        ];
    }

    #[cfg(not(target_os = "windows"))]
    {
        vec![
            ("HOME", temp_home.to_string_lossy().to_string()),
            ("OPENCLAW_DIR", openclaw_dir.to_string_lossy().to_string()),
        ]
    }
}

#[cfg(target_os = "windows")]
fn build_wsl_clawprobe_command_script(
    temp_home: &str,
    openclaw_dir: &str,
    args: &[String],
) -> String {
    let escaped_args = args
        .iter()
        .map(|arg| shell_escape_posix_arg(arg))
        .collect::<Vec<_>>()
        .join(" ");
    format!(
        "HOME={home} OPENCLAW_DIR={openclaw_dir} clawprobe {args}",
        home = shell_escape_posix_arg(temp_home),
        openclaw_dir = shell_escape_posix_arg(openclaw_dir),
        args = escaped_args,
    )
}

fn run_clawprobe_command_with_models_dev_pricing_local(
    args: &[String],
    custom_prices: &serde_json::Map<String, serde_json::Value>,
) -> Result<String, String> {
    let real_probe_dir = dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".clawprobe");
    let temp_home = TempDirCleanupGuard::new(create_runtime_temp_dir("clawprobe-home")?);
    let temp_probe_dir = temp_home.path().join(".clawprobe");
    fs::create_dir_all(&temp_probe_dir).map_err(|e| cmd_err_d("IO_ERROR", e))?;
    mirror_clawprobe_files_for_override(&real_probe_dir, &temp_probe_dir)?;

    let base_config = fs::read_to_string(real_probe_dir.join("config.json"))
        .ok()
        .and_then(|raw| serde_json::from_str::<serde_json::Value>(&raw).ok())
        .unwrap_or_else(|| serde_json::json!({}));
    let merged_config = build_clawprobe_config_override(&base_config, custom_prices);
    let config_raw = serde_json::to_string_pretty(&merged_config)
        .map_err(|e| cmd_err_d("CLAWPROBE_CONFIG_SERIALIZE_FAILED", e))?;
    fs::write(
        temp_probe_dir.join("config.json"),
        format!("{config_raw}\n"),
    )
    .map_err(|e| cmd_err_d("CLAWPROBE_CONFIG_WRITE_FAILED", e))?;

    let output = {
        let mut command = clawprobe_cmd();
        let config_resolution = get_config_resolution();
        for (key, value) in
            build_clawprobe_env_overrides(temp_home.path(), &config_resolution.data_dir)
        {
            command.env(key, value);
        }
        command
            .args(args)
            .output()
            .map_err(|e| cmd_err_d("CLAWPROBE_CMD_SPAWN_FAILED", e))?
    };

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    if output.status.success() || !stdout.trim().is_empty() {
        Ok(stdout)
    } else {
        Err(cmd_err_stderr("CLAWPROBE_CMD_FAILED", &stderr))
    }
}

#[cfg(target_os = "windows")]
fn run_clawprobe_command_with_models_dev_pricing_wsl(
    distro: &str,
    args: &[String],
    custom_prices: &serde_json::Map<String, serde_json::Value>,
) -> Result<String, String> {
    let home_dir = get_wsl_home_dir(distro);
    let real_probe_dir = join_posix(&home_dir, ".clawprobe");
    let temp_home_output = run_wsl_shell(
        distro,
        "mktemp -d /tmp/clawmaster-clawprobe-home-XXXXXX",
        None,
    )?;
    if temp_home_output.code != 0 || temp_home_output.stdout.trim().is_empty() {
        return Err(cmd_err_d(
            "WSL_TEMP_DIR_FAILED",
            temp_home_output.stderr.trim().to_string(),
        ));
    }
    let temp_home = temp_home_output.stdout.trim().to_string();
    let _temp_home_guard = WslTempDirCleanupGuard::new(distro.to_string(), temp_home.clone());
    let temp_probe_dir = join_posix(&temp_home, ".clawprobe");

    let mirror_script = format!(
        "mkdir -p {target} && if [ -d {source} ]; then cp -al {source_dot} {target_dot} 2>/dev/null || cp -a {source_dot} {target_dot}; fi && rm -f {config}",
        target = shell_escape_posix_arg(&temp_probe_dir),
        source = shell_escape_posix_arg(&real_probe_dir),
        source_dot = shell_escape_posix_arg(&join_posix(&real_probe_dir, ".")),
        target_dot = shell_escape_posix_arg(&join_posix(&temp_probe_dir, "")),
        config = shell_escape_posix_arg(&join_posix(&temp_probe_dir, "config.json")),
    );
    let mirror_output = run_wsl_shell(distro, &mirror_script, None)?;
    if mirror_output.code != 0 {
        return Err(cmd_err_d(
            "WSL_CLAWPROBE_MIRROR_FAILED",
            mirror_output.stderr.trim().to_string(),
        ));
    }

    let base_config = read_text_file_in_wsl(distro, &join_posix(&real_probe_dir, "config.json"))
        .ok()
        .flatten()
        .and_then(|raw| serde_json::from_str::<serde_json::Value>(&raw).ok())
        .unwrap_or_else(|| serde_json::json!({}));
    let merged_config = build_clawprobe_config_override(&base_config, custom_prices);
    let config_raw = serde_json::to_string_pretty(&merged_config)
        .map_err(|e| cmd_err_d("CLAWPROBE_CONFIG_SERIALIZE_FAILED", e))?;
    write_text_file_in_wsl(
        distro,
        &join_posix(&temp_probe_dir, "config.json"),
        &format!("{config_raw}\n"),
    )?;

    let command_script = build_wsl_clawprobe_command_script(
        &temp_home,
        &get_config_resolution().data_dir.to_string_lossy(),
        args,
    );
    let output = run_wsl_shell(distro, &command_script, None)?;

    if output.code == 0 || !output.stdout.trim().is_empty() {
        Ok(output.stdout)
    } else {
        Err(cmd_err_stderr("CLAWPROBE_CMD_FAILED", &output.stderr))
    }
}

// ClawProbe CLI (`clawprobe` on PATH, same resolution strategy as openclaw).
// Non-zero exit with JSON on stdout (e.g. `outputJsonError` in --json mode) still returns Ok for UI parsing.
#[tauri::command]
fn run_clawprobe_command(
    args: Vec<String>,
    use_models_dev_pricing: Option<bool>,
) -> Result<String, String> {
    if use_models_dev_pricing.unwrap_or(false) {
        if let Some(custom_prices) = read_fresh_models_dev_custom_prices() {
            #[cfg(target_os = "windows")]
            if let Some(distro) = active_wsl_distro() {
                return run_clawprobe_command_with_models_dev_pricing_wsl(
                    &distro,
                    &args,
                    &custom_prices,
                );
            }

            return run_clawprobe_command_with_models_dev_pricing_local(&args, &custom_prices);
        }
    }

    let output = clawprobe_cmd()
        .args(&args)
        .output()
        .map_err(|e| cmd_err_d("CLAWPROBE_CMD_SPAWN_FAILED", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    if output.status.success() || !stdout.trim().is_empty() {
        Ok(stdout)
    } else {
        Err(cmd_err_stderr("CLAWPROBE_CMD_FAILED", &stderr))
    }
}

fn resolve_ollama_installation() -> Result<(String, String), String> {
    #[cfg(target_os = "windows")]
    if let Some(distro) = active_wsl_distro() {
        return resolve_ollama_installation_wsl(&distro);
    }

    let (path, version) = resolve_ollama_installation_host()?;
    Ok((path.to_string_lossy().to_string(), version))
}

fn install_ollama_host() -> Result<String, String> {
    #[cfg(target_os = "windows")]
    {
        let installer_path = std::env::temp_dir().join("OllamaSetup.exe");
        download_file_via_curl(
            "https://ollama.com/download/OllamaSetup.exe",
            &installer_path,
        )?;
        let output = Command::new(&installer_path)
            .args(["/SILENT", "/NORESTART"])
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .output()
            .map_err(|e| cmd_err_d("OLLAMA_INSTALL_FAILED", e))?;
        if output.status.success() {
            return Ok("Ollama installed on Windows".to_string());
        }
        return Err(cmd_err_stderr(
            "OLLAMA_INSTALL_FAILED",
            &String::from_utf8_lossy(&output.stderr),
        ));
    }

    #[cfg(not(target_os = "windows"))]
    {
        let script = download_text_via_curl("https://ollama.com/install.sh")?;
        let output = run_host_command_with_input("/bin/sh", &["-s"], &script)?;
        if output.status.success() {
            return Ok(String::from_utf8_lossy(&output.stdout).trim().to_string());
        }

        #[cfg(target_os = "macos")]
        {
            let stderr = String::from_utf8_lossy(&output.stderr).to_string();
            if stderr.trim().is_empty() {
                return Err(cmd_err("OLLAMA_INSTALL_FAILED"));
            }
            return Err(cmd_err_stderr("OLLAMA_INSTALL_FAILED", &stderr));
        }

        #[cfg(not(target_os = "macos"))]
        {
            match run_host_ollama_fallback_install() {
                Ok(status) => Ok(status),
                Err(fallback_error) => {
                    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
                    if stderr.trim().is_empty() {
                        Err(fallback_error)
                    } else {
                        Err(cmd_err_stderr("OLLAMA_INSTALL_FAILED", &stderr))
                    }
                }
            }
        }
    }
}

#[cfg(target_os = "windows")]
fn install_ollama_wsl(distro: &str) -> Result<String, String> {
    let script = download_text_via_curl("https://ollama.com/install.sh")?;
    let primary = run_wsl_shell(distro, "sh -s", Some(&script))?;
    if primary.code == 0 {
        return Ok(primary.stdout.trim().to_string());
    }

    let fallback = run_wsl_shell(distro, OLLAMA_USER_LOCAL_INSTALL_SCRIPT, None)?;
    if fallback.code == 0 {
        return Ok(fallback.stdout.trim().to_string());
    }

    if !fallback.stderr.trim().is_empty() {
        Err(cmd_err_stderr("OLLAMA_INSTALL_FAILED", &fallback.stderr))
    } else {
        Err(cmd_err_stderr("OLLAMA_INSTALL_FAILED", &primary.stderr))
    }
}

#[tauri::command]
fn detect_ollama_installation() -> Result<OllamaInstallationInfo, String> {
    match resolve_ollama_installation() {
        Ok((_path, version)) => Ok(OllamaInstallationInfo {
            installed: true,
            version: Some(version),
        }),
        Err(_) => Ok(OllamaInstallationInfo {
            installed: false,
            version: None,
        }),
    }
}

#[tauri::command]
fn run_ollama_command(args: Vec<String>) -> Result<String, String> {
    #[cfg(target_os = "windows")]
    if let Some(distro) = active_wsl_distro() {
        let (bin, _version) = resolve_ollama_installation_wsl(&distro)?;
        let arg_refs = args.iter().map(String::as_str).collect::<Vec<_>>();
        let output = exec_wsl_command(&distro, &bin, &arg_refs)?;
        if output.code == 0 {
            return Ok(output.stdout);
        }
        return Err(cmd_err_stderr("OLLAMA_CMD_FAILED", &output.stderr));
    }

    let (bin, _version) = resolve_ollama_installation()?;
    let output = Command::new(&bin)
        .args(&args)
        .stdin(Stdio::null())
        .output()
        .map_err(|e| cmd_err_d("OLLAMA_CMD_SPAWN_FAILED", e))?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        Err(cmd_err_stderr(
            "OLLAMA_CMD_FAILED",
            &String::from_utf8_lossy(&output.stderr),
        ))
    }
}

#[tauri::command]
fn install_ollama() -> Result<String, String> {
    #[cfg(target_os = "windows")]
    if let Some(distro) = active_wsl_distro() {
        return install_ollama_wsl(&distro);
    }

    install_ollama_host()
}

#[tauri::command]
fn start_ollama() -> Result<String, String> {
    #[cfg(target_os = "windows")]
    if let Some(distro) = active_wsl_distro() {
        let (bin, _version) = resolve_ollama_installation_wsl(&distro)?;
        let output = run_wsl_shell(
            &distro,
            &format!(
                "nohup {} serve >/dev/null 2>&1 &",
                shell_escape_posix_arg(&bin)
            ),
            None,
        )?;
        if output.code == 0 {
            return Ok("starting".to_string());
        }
        return Err(cmd_err_stderr("OLLAMA_CMD_FAILED", &output.stderr));
    }

    let (bin, _version) = resolve_ollama_installation()?;
    Command::new(&bin)
        .arg("serve")
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| cmd_err_d("OLLAMA_CMD_SPAWN_FAILED", e))?;
    Ok("starting".to_string())
}

fn is_allowed_system_command(cmd: &str) -> bool {
    matches!(
        cmd,
        "bash" | "clawhub" | "curl" | "mkdir" | "nohup" | "npm" | "ollama"
    )
}

fn expand_exec_arg_home(arg: &str) -> String {
    if arg.trim().starts_with("~/") {
        expand_home_path(arg).to_string_lossy().to_string()
    } else {
        arg.to_string()
    }
}

#[cfg(target_os = "windows")]
fn resolve_bash_command_path() -> PathBuf {
    let candidates = [
        std::env::var_os("ProgramFiles")
            .map(PathBuf::from)
            .unwrap_or_else(|| PathBuf::from(r"C:\Program Files"))
            .join("Git")
            .join("bin")
            .join("bash.exe"),
        std::env::var_os("ProgramFiles(x86)")
            .map(PathBuf::from)
            .unwrap_or_else(|| PathBuf::from(r"C:\Program Files (x86)"))
            .join("Git")
            .join("bin")
            .join("bash.exe"),
        std::env::var_os("LOCALAPPDATA")
            .map(PathBuf::from)
            .unwrap_or_default()
            .join("Programs")
            .join("Git")
            .join("bin")
            .join("bash.exe"),
    ];
    for candidate in candidates {
        if candidate.exists() {
            return candidate;
        }
    }
    PathBuf::from("bash")
}

#[cfg(not(target_os = "windows"))]
fn resolve_bash_command_path() -> PathBuf {
    PathBuf::from("/bin/bash")
}

#[tauri::command]
fn run_system_command(cmd: String, args: Vec<String>) -> Result<String, String> {
    let trimmed = cmd.trim();
    if trimmed.is_empty() {
        return Err(cmd_err("SYSTEM_CMD_EMPTY"));
    }
    if trimmed.contains('/') || trimmed.contains('\\') {
        return Err(cmd_err_p(
            "SYSTEM_CMD_PATH_NOT_ALLOWED",
            serde_json::json!({ "cmd": trimmed }),
        ));
    }
    if !is_allowed_system_command(trimmed) {
        return Err(cmd_err_p(
            "SYSTEM_CMD_NOT_ALLOWED",
            serde_json::json!({ "cmd": trimmed }),
        ));
    }

    let program = resolve_system_command_path(trimmed);
    let expanded_args: Vec<String> = args.iter().map(|arg| expand_exec_arg_home(arg)).collect();
    let normalized_args = if trimmed == "npm" {
        with_configured_npm_registry_args(&expanded_args)
    } else {
        expanded_args
    };

    #[cfg(target_os = "windows")]
    if let Some(distro) = active_wsl_distro() {
        let arg_refs = normalized_args
            .iter()
            .map(String::as_str)
            .collect::<Vec<_>>();
        let output = exec_wsl_command(&distro, trimmed, &arg_refs)?;
        if output.code == 0 {
            return Ok(output.stdout);
        }
        let msg = if !output.stderr.trim().is_empty() {
            output.stderr
        } else if !output.stdout.trim().is_empty() {
            output.stdout
        } else {
            format!("exit {}", output.code)
        };
        return Err(cmd_err_d("SYSTEM_CMD_FAILED", msg.trim()));
    }

    let output = Command::new(program)
        .args(&normalized_args)
        .stdin(Stdio::null())
        .output()
        .map_err(|e| cmd_err_d("SYSTEM_CMD_SPAWN_FAILED", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    if output.status.success() {
        Ok(stdout)
    } else {
        let msg = if !stderr.trim().is_empty() {
            stderr
        } else if !stdout.trim().is_empty() {
            stdout
        } else {
            format!("exit {:?}", output.status.code())
        };
        Err(cmd_err_d("SYSTEM_CMD_FAILED", msg.trim()))
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct FetchProviderCatalogPayload {
    url: String,
    headers: std::collections::HashMap<String, String>,
}

fn run_curl_config(curl_config: &str) -> Result<String, String> {
    #[cfg(target_os = "windows")]
    if let Some(distro) = active_wsl_distro() {
        let output = run_wsl_shell(&distro, "curl --config -", Some(curl_config))?;
        if output.code == 0 {
            return Ok(output.stdout);
        }
        let msg = if !output.stderr.trim().is_empty() {
            output.stderr
        } else if !output.stdout.trim().is_empty() {
            output.stdout
        } else {
            format!("exit {}", output.code)
        };
        return Err(cmd_err_d("SYSTEM_CMD_FAILED", msg.trim()));
    }

    let program = resolve_system_command_path("curl");
    let mut child = Command::new(program)
        .args(["--config", "-"])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| cmd_err_d("SYSTEM_CMD_SPAWN_FAILED", e))?;

    if let Some(mut stdin) = child.stdin.take() {
        stdin
            .write_all(curl_config.as_bytes())
            .map_err(|e| cmd_err_d("SYSTEM_CMD_STDIN_WRITE_FAILED", e))?;
    }

    let output = child
        .wait_with_output()
        .map_err(|e| cmd_err_d("SYSTEM_CMD_WAIT_FAILED", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    if output.status.success() {
        Ok(stdout)
    } else {
        let msg = if !stderr.trim().is_empty() {
            stderr
        } else if !stdout.trim().is_empty() {
            stdout
        } else {
            format!("exit {:?}", output.status.code())
        };
        Err(cmd_err_d("SYSTEM_CMD_FAILED", msg.trim()))
    }
}

#[tauri::command]
fn fetch_provider_catalog(payload: FetchProviderCatalogPayload) -> Result<String, String> {
    let mut curl_config = String::from("silent\nshow-error\nlocation\nmax-time = 10\n");
    for (key, value) in payload.headers {
        curl_config.push_str("header = ");
        curl_config.push_str(
            &serde_json::to_string(&format!("{key}: {value}"))
                .map_err(|e| cmd_err_d("SYSTEM_CMD_CONFIG_ENCODE_FAILED", e))?,
        );
        curl_config.push('\n');
    }
    curl_config.push_str("write-out = \"\\n__CLAWMASTER_STATUS__:%{http_code}\"\n");
    curl_config.push_str("url = ");
    curl_config.push_str(
        &serde_json::to_string(&payload.url)
            .map_err(|e| cmd_err_d("SYSTEM_CMD_CONFIG_ENCODE_FAILED", e))?,
    );
    curl_config.push('\n');

    run_curl_config(&curl_config)
}

const DEFAULT_PADDLEOCR_TEST_FILE: &str =
    "https://raw.githubusercontent.com/PaddlePaddle/PaddleOCR/release/3.3/docs/datasets/images/ch_doc1.jpg";

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PaddleOcrPayload {
    endpoint: String,
    access_token: String,
    file: Option<String>,
    file_type: Option<u8>,
    use_doc_orientation_classify: Option<bool>,
    use_doc_unwarping: Option<bool>,
    use_layout_detection: Option<bool>,
    use_chart_recognition: Option<bool>,
    restructure_pages: Option<bool>,
    merge_tables: Option<bool>,
    relevel_titles: Option<bool>,
    prettify_markdown: Option<bool>,
    visualize: Option<bool>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct PaddleOcrTestResultDto {
    ok: bool,
    sample_file: String,
    page_count: usize,
}

fn paddleocr_required_text(value: &str, code: &'static str) -> Result<String, String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Err(cmd_err(code));
    }
    Ok(trimmed.to_string())
}

fn paddleocr_endpoint(value: &str) -> Result<String, String> {
    let endpoint = paddleocr_required_text(value, "PADDLEOCR_ENDPOINT_REQUIRED")?;
    if !endpoint.starts_with("https://") && !endpoint.starts_with("http://") {
        return Err(cmd_err("PADDLEOCR_ENDPOINT_INVALID"));
    }
    Ok(endpoint)
}

fn paddleocr_file_type(value: Option<u8>) -> Result<Option<u8>, String> {
    match value {
        Some(file_type) if file_type == 0 || file_type == 1 => Ok(Some(file_type)),
        Some(_) => Err(cmd_err("PADDLEOCR_FILE_TYPE_INVALID")),
        None => Ok(None),
    }
}

fn build_paddleocr_request_json(
    payload: &PaddleOcrPayload,
    fallback_file: &str,
    force_visualize_false: bool,
) -> Result<String, String> {
    let file = payload
        .file
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or(fallback_file)
        .to_string();

    let mut body = serde_json::Map::new();
    body.insert("file".to_string(), serde_json::Value::String(file));

    if let Some(file_type) = paddleocr_file_type(payload.file_type)? {
        body.insert(
            "fileType".to_string(),
            serde_json::Value::Number(serde_json::Number::from(file_type)),
        );
    }

    let option_pairs = [
        (
            "useDocOrientationClassify",
            payload.use_doc_orientation_classify,
        ),
        ("useDocUnwarping", payload.use_doc_unwarping),
        ("useLayoutDetection", payload.use_layout_detection),
        ("useChartRecognition", payload.use_chart_recognition),
        ("restructurePages", payload.restructure_pages),
        ("mergeTables", payload.merge_tables),
        ("relevelTitles", payload.relevel_titles),
        ("prettifyMarkdown", payload.prettify_markdown),
        (
            "visualize",
            if force_visualize_false {
                Some(false)
            } else {
                payload.visualize
            },
        ),
    ];
    for (key, value) in option_pairs {
        if let Some(enabled) = value {
            body.insert(key.to_string(), serde_json::Value::Bool(enabled));
        }
    }

    serde_json::to_string(&serde_json::Value::Object(body))
        .map_err(|e| cmd_err_d("SYSTEM_CMD_CONFIG_ENCODE_FAILED", e))
}

fn parse_http_status_output(raw: &str) -> (String, u16) {
    let marker = "\n__CLAWMASTER_STATUS__:";
    if let Some(index) = raw.rfind(marker) {
        let body = raw[..index].to_string();
        let status_text = raw[index + marker.len()..].trim();
        let status = status_text.parse::<u16>().unwrap_or(0);
        (body, status)
    } else {
        (raw.to_string(), 0)
    }
}

fn paddleocr_request(
    payload: &PaddleOcrPayload,
    fallback_file: &str,
) -> Result<serde_json::Value, String> {
    let endpoint = paddleocr_endpoint(&payload.endpoint)?;
    let access_token = paddleocr_required_text(&payload.access_token, "PADDLEOCR_TOKEN_REQUIRED")?;
    let body_json = build_paddleocr_request_json(payload, fallback_file, false)?;

    let body_path = std::env::temp_dir().join(format!(
        "clawmaster-paddleocr-body-{}-{}.json",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|value| value.as_nanos())
            .unwrap_or(0)
    ));
    fs::write(&body_path, body_json.as_bytes())
        .map_err(|e| cmd_err_d("SYSTEM_CMD_TEMPFILE_WRITE_FAILED", e))?;

    let mut curl_config = String::from(
        "silent
show-error
location
max-time = 60
request = POST
",
    );
    for header in [
        format!("Authorization: token {}", access_token),
        "Content-Type: application/json".to_string(),
    ] {
        curl_config.push_str("header = ");
        curl_config.push_str(
            &serde_json::to_string(&header)
                .map_err(|e| cmd_err_d("SYSTEM_CMD_CONFIG_ENCODE_FAILED", e))?,
        );
        curl_config.push('\n');
    }
    curl_config.push_str("data-binary = ");
    curl_config.push_str(
        &serde_json::to_string(&format!("@{}", body_path.display()))
            .map_err(|e| cmd_err_d("SYSTEM_CMD_CONFIG_ENCODE_FAILED", e))?,
    );
    curl_config.push('\n');
    curl_config.push_str("write-out = \"\\n__CLAWMASTER_STATUS__:%{http_code}\"\n");
    curl_config.push_str("url = ");
    curl_config.push_str(
        &serde_json::to_string(&endpoint)
            .map_err(|e| cmd_err_d("SYSTEM_CMD_CONFIG_ENCODE_FAILED", e))?,
    );
    curl_config.push('\n');

    let raw = run_curl_config(&curl_config);
    let _ = fs::remove_file(&body_path);
    let raw = raw?;
    let (body, status) = parse_http_status_output(&raw);
    if !(200..300).contains(&status) {
        let message = serde_json::from_str::<serde_json::Value>(&body)
            .ok()
            .and_then(|parsed| {
                parsed
                    .get("errorMsg")
                    .and_then(|value| value.as_str())
                    .map(|value| value.to_string())
            })
            .unwrap_or_else(|| shorten_chars(body.trim(), 240));
        return Err(cmd_err_d(
            "PADDLEOCR_REQUEST_FAILED",
            format!("status {}: {}", status, message),
        ));
    }

    let parsed = serde_json::from_str::<serde_json::Value>(&body)
        .map_err(|e| cmd_err_d("PADDLEOCR_RESPONSE_INVALID", e))?;
    if let Some(error_code) = parsed.get("errorCode").and_then(|value| value.as_i64()) {
        if error_code != 0 {
            let error_message = parsed
                .get("errorMsg")
                .and_then(|value| value.as_str())
                .unwrap_or("Unknown error");
            return Err(cmd_err_d(
                "PADDLEOCR_RESPONSE_ERROR",
                format!("{}: {}", error_code, error_message),
            ));
        }
    }

    parsed
        .get("result")
        .cloned()
        .ok_or_else(|| cmd_err("PADDLEOCR_RESULT_MISSING"))
}

#[tauri::command]
fn paddleocr_test_connection(payload: PaddleOcrPayload) -> Result<PaddleOcrTestResultDto, String> {
    let sample_file = payload
        .file
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or(DEFAULT_PADDLEOCR_TEST_FILE)
        .to_string();
    let request_payload = PaddleOcrPayload {
        endpoint: payload.endpoint,
        access_token: payload.access_token,
        file: Some(sample_file.clone()),
        file_type: Some(payload.file_type.unwrap_or(1)),
        use_doc_orientation_classify: payload.use_doc_orientation_classify,
        use_doc_unwarping: payload.use_doc_unwarping,
        use_layout_detection: payload.use_layout_detection,
        use_chart_recognition: payload.use_chart_recognition,
        restructure_pages: payload.restructure_pages,
        merge_tables: payload.merge_tables,
        relevel_titles: payload.relevel_titles,
        prettify_markdown: payload.prettify_markdown,
        visualize: Some(false),
    };
    let result = paddleocr_request(&request_payload, &sample_file)?;
    let page_count = result
        .get("layoutParsingResults")
        .and_then(|value| value.as_array())
        .map(|pages| pages.len())
        .unwrap_or(0);
    Ok(PaddleOcrTestResultDto {
        ok: true,
        sample_file,
        page_count,
    })
}

#[tauri::command]
fn paddleocr_parse_document(payload: PaddleOcrPayload) -> Result<serde_json::Value, String> {
    let fallback_file = payload
        .file
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| cmd_err("PADDLEOCR_FILE_REQUIRED"))?
        .to_string();
    paddleocr_request(&payload, &fallback_file)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            detect_system,
            get_gateway_status,
            start_gateway,
            bootstrap_openclaw_after_install,
            stop_gateway,
            restart_gateway,
            get_config,
            resolve_plugin_root,
            desktop_smoke_diagnostics,
            save_config,
            reset_openclaw_config,
            install_bundled_skill,
            scan_installed_skill,
            save_openclaw_profile,
            clear_openclaw_profile,
            save_clawmaster_runtime,
            get_clawmaster_npm_proxy,
            save_clawmaster_npm_proxy,
            uninstall_openclaw_cli,
            list_openclaw_npm_versions,
            npm_install_openclaw_global,
            npm_install_openclaw_from_file,
            reinstall_openclaw_global,
            reinstall_step_backup_openclaw,
            reinstall_step_uninstall_openclaw_cli,
            get_backup_defaults,
            create_openclaw_backup,
            list_openclaw_backups,
            restore_openclaw_backup,
            remove_openclaw_data,
            list_content_draft_variants,
            read_content_draft_text_file,
            read_content_draft_image_file,
            delete_content_draft_variant,
            read_runtime_text_file,
            read_required_runtime_text_file,
            write_runtime_text_file,
            list_mcp_import_candidates,
            get_logs,
            run_openclaw_command,
            run_openclaw_command_captured,
            get_managed_memory_bridge_status,
            sync_managed_memory_bridge,
            list_openclaw_memory_files,
            delete_openclaw_memory_file,
            get_openclaw_memory_search_capability,
            reindex_openclaw_memory,
            search_openclaw_memory_fallback,
            run_openclaw_command_stdin,
            run_clawprobe_command,
            detect_ollama_installation,
            run_ollama_command,
            install_ollama,
            start_ollama,
            run_system_command,
            fetch_provider_catalog,
            paddleocr_test_connection,
            paddleocr_parse_document,
        ])
        .setup(|app| {
            if let Ok(resource_dir) = app.path().resource_dir() {
                let plugin_root = resource_dir.join("memory-clawmaster-powermem");
                if plugin_root.join("openclaw.plugin.json").exists() {
                    std::env::set_var(
                        "CLAWMASTER_PACKAGED_MEMORY_PLUGIN_ROOT",
                        plugin_root.to_string_lossy().to_string(),
                    );
                }
                let ernie_image_plugin_root = resource_dir.join("openclaw-ernie-image");
                if ernie_image_plugin_root
                    .join("openclaw.plugin.json")
                    .exists()
                {
                    std::env::set_var(
                        "CLAWMASTER_PACKAGED_ERNIE_IMAGE_PLUGIN_ROOT",
                        ernie_image_plugin_root.to_string_lossy().to_string(),
                    );
                }
                let content_draft_skill_root =
                    resource_dir.join("bundled-skills").join("content-draft");
                if content_draft_skill_root.join("SKILL.md").exists() {
                    std::env::set_var(
                        "CLAWMASTER_BUNDLED_CONTENT_DRAFT_SKILL_ROOT",
                        content_draft_skill_root.to_string_lossy().to_string(),
                    );
                }
                let ernie_image_skill_root =
                    resource_dir.join("bundled-skills").join("ernie-image");
                if ernie_image_skill_root.join("SKILL.md").exists() {
                    std::env::set_var(
                        "CLAWMASTER_BUNDLED_ERNIE_IMAGE_SKILL_ROOT",
                        ernie_image_skill_root.to_string_lossy().to_string(),
                    );
                }
                let clawprobe_cost_digest_skill_root = resource_dir
                    .join("bundled-skills")
                    .join("clawprobe-cost-digest");
                if clawprobe_cost_digest_skill_root.join("SKILL.md").exists() {
                    std::env::set_var(
                        "CLAWMASTER_BUNDLED_CLAWPROBE_COST_DIGEST_SKILL_ROOT",
                        clawprobe_cost_digest_skill_root
                            .to_string_lossy()
                            .to_string(),
                    );
                }
                let models_dev_skill_root = resource_dir.join("bundled-skills").join("models-dev");
                if models_dev_skill_root.join("SKILL.md").exists() {
                    std::env::set_var(
                        "CLAWMASTER_BUNDLED_MODELS_DEV_SKILL_ROOT",
                        models_dev_skill_root.to_string_lossy().to_string(),
                    );
                }
                let paddleocr_skill_root = resource_dir
                    .join("bundled-skills")
                    .join("paddleocr-doc-parsing");
                if paddleocr_skill_root.join("SKILL.md").exists() {
                    std::env::set_var(
                        "CLAWMASTER_BUNDLED_PADDLEOCR_DOC_PARSING_SKILL_ROOT",
                        paddleocr_skill_root.to_string_lossy().to_string(),
                    );
                }
                if let Err(error) = sync_installed_bundled_skills() {
                    eprintln!("ClawMaster skipped bundled skill refresh: {error}");
                }
            }
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
