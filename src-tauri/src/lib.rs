use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::io::Write;
use std::net::{SocketAddr, TcpStream};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::{Mutex, OnceLock};
use std::time::Duration;

const CMD_ERR_PREFIX: &str = "CLAWMASTER_ERR:";

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
        let local_bin = home_dir.join(".local").join("bin").join(if cfg!(target_os = "windows") {
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

#[cfg(target_os = "windows")]
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
    let local_bin = format!("{}/.local/bin/ollama", get_wsl_home_dir(distro).trim_end_matches('/'));
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

        let data_root = clawmaster_data_root_posix(
            profile_selection,
            _wsl_home_dir.unwrap_or("/home"),
        );
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
        |base, child| PathBuf::from(base).join(child).to_string_lossy().to_string(),
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
    use super::{
        get_config_path_candidates_for, get_openclaw_profile_args, get_openclaw_profile_data_dir,
        local_data_profile_key, normalize_clawmaster_runtime_selection,
        normalize_local_data_target_platform, parse_node_major, parse_wsl_list_verbose,
        resolve_config_path_from_candidates, resolve_local_data_status,
        resolve_selected_wsl_distro_from_list, supports_seekdb_embedded,
        OpenclawProfileSelection,
    };
    use std::fs;
    use std::path::Path;
    use std::path::PathBuf;
    use std::time::{SystemTime, UNIX_EPOCH};

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
    let output = Command::new("npm")
        .args(["install", "-g", &pkg])
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
    let output = Command::new("npm")
        .args(["install", "-g", &s])
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
fn read_required_runtime_text_file(path_input: String) -> Result<RequiredRuntimeTextFileDto, String> {
    let path = resolve_runtime_input_path(&path_input)?;
    let content = read_active_openclaw_text_file(&path)?
        .ok_or_else(|| cmd_err_p("RUNTIME_FILE_NOT_FOUND", serde_json::json!({ "path": path.to_string_lossy() })))?;
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
        ("copilot-user", "json", None, Some(".copilot/mcp-config.json")),
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

// ClawProbe CLI (`clawprobe` on PATH, same resolution strategy as openclaw).
// Non-zero exit with JSON on stdout (e.g. `outputJsonError` in --json mode) still returns Ok for UI parsing.
#[tauri::command]
fn run_clawprobe_command(args: Vec<String>) -> Result<String, String> {
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
        download_file_via_curl("https://ollama.com/download/OllamaSetup.exe", &installer_path)?;
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
            &format!("nohup {} serve >/dev/null 2>&1 &", shell_escape_posix_arg(&bin)),
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
    let normalized_args: Vec<String> = args.iter().map(|arg| expand_exec_arg_home(arg)).collect();

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
            save_config,
            reset_openclaw_config,
            save_openclaw_profile,
            clear_openclaw_profile,
            save_clawmaster_runtime,
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
            read_runtime_text_file,
            read_required_runtime_text_file,
            write_runtime_text_file,
            list_mcp_import_candidates,
            get_logs,
            run_openclaw_command,
            run_openclaw_command_captured,
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
        ])
        .setup(|app| {
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
