use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::io::Write;
use std::net::{SocketAddr, TcpStream};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};

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

fn sanitize_profile_name(input: &str) -> Result<String, String> {
    let trimmed = input.trim();
    if trimmed.is_empty() {
        return Err("Profile name is required".to_string());
    }
    if trimmed == "default" {
        return Err("Use the default profile option instead of the reserved name \"default\"".to_string());
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
        settings.openclaw_profile.as_ref().map(|item| item.kind.clone()),
        settings.openclaw_profile.as_ref().and_then(|item| item.name.clone()),
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
    let raw = fs::read_to_string(&source_path)
        .map_err(|e| cmd_err_d("PROFILE_SEED_READ_FAILED", e))?;
    let parsed: serde_json::Value = serde_json::from_str(&raw)
        .map_err(|_| "Imported OpenClaw config must be valid JSON".to_string())?;

    fs::create_dir_all(&target_dir).map_err(|e| cmd_err_d("PROFILE_SEED_MKDIR_FAILED", e))?;
    let content = serde_json::to_string_pretty(&parsed)
        .map_err(|e| cmd_err_d("PROFILE_SEED_SERIALIZE_FAILED", e))?;
    fs::write(&target_config_path, format!("{content}\n"))
        .map_err(|e| cmd_err_d("PROFILE_SEED_WRITE_FAILED", e))?;
    Ok(())
}

fn openclaw_cmd() -> Command {
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
    let default_candidates =
        get_config_path_candidates_for(cfg!(target_os = "windows"), home_dir.clone(), config_dir);
    let existing_config_paths = default_candidates
        .iter()
        .filter(|candidate| candidate.exists())
        .cloned()
        .collect::<Vec<_>>();

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

fn get_config_path() -> PathBuf {
    get_config_resolution().config_path
}

const PADDLEOCR_TEXT_SKILL_ID: &str = "paddleocr-text-recognition";
const PADDLEOCR_DOC_SKILL_ID: &str = "paddleocr-doc-parsing";
const PADDLEOCR_SKILL_IDS: [&str; 2] = [PADDLEOCR_TEXT_SKILL_ID, PADDLEOCR_DOC_SKILL_ID];
const PADDLEOCR_SAMPLE_IMAGE_BASE64: &str =
    include_str!("../resources/paddleocr-preview/sample_image.base64");

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PaddleocrSetupPayload {
    module_id: String,
    api_url: String,
    access_token: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PaddleocrClearPayload {
    module_id: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct PaddleocrModuleStatus {
    configured: bool,
    enabled: bool,
    missing: bool,
    api_url_configured: bool,
    access_token_configured: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    api_url: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct PaddleocrStatusPayload {
    configured: bool,
    enabled_modules: Vec<String>,
    missing_modules: Vec<String>,
    text_recognition: PaddleocrModuleStatus,
    doc_parsing: PaddleocrModuleStatus,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct PaddleocrPreviewPayload {
    module_id: String,
    api_url: String,
    latency_ms: u128,
    page_count: usize,
    text_line_count: usize,
    extracted_text: String,
    response_preview: String,
}

struct BundledPaddleocrFile {
    module_id: &'static str,
    relative_path: &'static str,
    contents: &'static str,
}

const BUNDLED_PADDLEOCR_FILES: &[BundledPaddleocrFile] = &[
    BundledPaddleocrFile {
        module_id: PADDLEOCR_TEXT_SKILL_ID,
        relative_path: "SKILL.md",
        contents: include_str!("../resources/paddleocr-skills/paddleocr-text-recognition/SKILL.md"),
    },
    BundledPaddleocrFile {
        module_id: PADDLEOCR_TEXT_SKILL_ID,
        relative_path: "references/output_schema.md",
        contents: include_str!(
            "../resources/paddleocr-skills/paddleocr-text-recognition/references/output_schema.md"
        ),
    },
    BundledPaddleocrFile {
        module_id: PADDLEOCR_TEXT_SKILL_ID,
        relative_path: "scripts/lib.py",
        contents: include_str!(
            "../resources/paddleocr-skills/paddleocr-text-recognition/scripts/lib.py"
        ),
    },
    BundledPaddleocrFile {
        module_id: PADDLEOCR_TEXT_SKILL_ID,
        relative_path: "scripts/ocr_caller.py",
        contents: include_str!(
            "../resources/paddleocr-skills/paddleocr-text-recognition/scripts/ocr_caller.py"
        ),
    },
    BundledPaddleocrFile {
        module_id: PADDLEOCR_TEXT_SKILL_ID,
        relative_path: "scripts/requirements.txt",
        contents: include_str!(
            "../resources/paddleocr-skills/paddleocr-text-recognition/scripts/requirements.txt"
        ),
    },
    BundledPaddleocrFile {
        module_id: PADDLEOCR_TEXT_SKILL_ID,
        relative_path: "scripts/smoke_test.py",
        contents: include_str!(
            "../resources/paddleocr-skills/paddleocr-text-recognition/scripts/smoke_test.py"
        ),
    },
    BundledPaddleocrFile {
        module_id: PADDLEOCR_DOC_SKILL_ID,
        relative_path: "SKILL.md",
        contents: include_str!("../resources/paddleocr-skills/paddleocr-doc-parsing/SKILL.md"),
    },
    BundledPaddleocrFile {
        module_id: PADDLEOCR_DOC_SKILL_ID,
        relative_path: "references/output_schema.md",
        contents: include_str!(
            "../resources/paddleocr-skills/paddleocr-doc-parsing/references/output_schema.md"
        ),
    },
    BundledPaddleocrFile {
        module_id: PADDLEOCR_DOC_SKILL_ID,
        relative_path: "scripts/lib.py",
        contents: include_str!(
            "../resources/paddleocr-skills/paddleocr-doc-parsing/scripts/lib.py"
        ),
    },
    BundledPaddleocrFile {
        module_id: PADDLEOCR_DOC_SKILL_ID,
        relative_path: "scripts/optimize_file.py",
        contents: include_str!(
            "../resources/paddleocr-skills/paddleocr-doc-parsing/scripts/optimize_file.py"
        ),
    },
    BundledPaddleocrFile {
        module_id: PADDLEOCR_DOC_SKILL_ID,
        relative_path: "scripts/requirements.txt",
        contents: include_str!(
            "../resources/paddleocr-skills/paddleocr-doc-parsing/scripts/requirements.txt"
        ),
    },
    BundledPaddleocrFile {
        module_id: PADDLEOCR_DOC_SKILL_ID,
        relative_path: "scripts/smoke_test.py",
        contents: include_str!(
            "../resources/paddleocr-skills/paddleocr-doc-parsing/scripts/smoke_test.py"
        ),
    },
    BundledPaddleocrFile {
        module_id: PADDLEOCR_DOC_SKILL_ID,
        relative_path: "scripts/vl_caller.py",
        contents: include_str!(
            "../resources/paddleocr-skills/paddleocr-doc-parsing/scripts/vl_caller.py"
        ),
    },
];

fn trim_trailing_slashes(value: &str) -> String {
    value.trim_end_matches('/').to_string()
}

fn paddleocr_module_endpoint_suffix(module_id: &str) -> Result<&'static str, String> {
    match module_id {
        PADDLEOCR_TEXT_SKILL_ID => Ok("/ocr"),
        PADDLEOCR_DOC_SKILL_ID => Ok("/layout-parsing"),
        _ => Err("Unsupported PaddleOCR module.".to_string()),
    }
}

fn paddleocr_module_api_env_key(module_id: &str) -> Result<&'static str, String> {
    match module_id {
        PADDLEOCR_TEXT_SKILL_ID => Ok("PADDLEOCR_OCR_API_URL"),
        PADDLEOCR_DOC_SKILL_ID => Ok("PADDLEOCR_DOC_PARSING_API_URL"),
        _ => Err("Unsupported PaddleOCR module.".to_string()),
    }
}

fn paddleocr_module_timeout_env_key(module_id: &str) -> Result<&'static str, String> {
    match module_id {
        PADDLEOCR_TEXT_SKILL_ID => Ok("PADDLEOCR_OCR_TIMEOUT"),
        PADDLEOCR_DOC_SKILL_ID => Ok("PADDLEOCR_DOC_PARSING_TIMEOUT"),
        _ => Err("Unsupported PaddleOCR module.".to_string()),
    }
}

fn paddleocr_module_timeout_default(module_id: &str) -> Result<&'static str, String> {
    match module_id {
        PADDLEOCR_TEXT_SKILL_ID => Ok("120"),
        PADDLEOCR_DOC_SKILL_ID => Ok("600"),
        _ => Err("Unsupported PaddleOCR module.".to_string()),
    }
}

fn paddleocr_validation_label(module_id: &str) -> Result<&'static str, String> {
    match module_id {
        PADDLEOCR_TEXT_SKILL_ID => Ok("PaddleOCR text recognition"),
        PADDLEOCR_DOC_SKILL_ID => Ok("PaddleOCR document parsing"),
        _ => Err("Unsupported PaddleOCR module.".to_string()),
    }
}

fn normalize_paddleocr_api_url(module_id: &str, value: &str) -> Result<String, String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Err("API endpoint is required.".to_string());
    }

    let normalized = if trimmed.starts_with("http://") || trimmed.starts_with("https://") {
        trimmed.to_string()
    } else {
        format!("https://{trimmed}")
    };

    if normalized.chars().any(char::is_whitespace) {
        return Err("Enter a valid PaddleOCR API endpoint.".to_string());
    }

    let Some((scheme, rest)) = normalized.split_once("://") else {
        return Err("Enter a valid PaddleOCR API endpoint.".to_string());
    };
    if scheme != "http" && scheme != "https" {
        return Err("Enter a valid PaddleOCR API endpoint.".to_string());
    }

    let rest = rest.split('#').next().unwrap_or(rest);
    let rest = rest.split('?').next().unwrap_or(rest);
    let api_url = trim_trailing_slashes(&format!("{scheme}://{}", rest.trim_end_matches('/')));
    let expected_suffix = paddleocr_module_endpoint_suffix(module_id)?;
    if !api_url.ends_with(expected_suffix) {
        return Err(format!(
            "Enter the full PaddleOCR endpoint ending with {expected_suffix}."
        ));
    }

    let host = api_url
        .split_once("://")
        .map(|(_, remainder)| remainder)
        .unwrap_or("")
        .split('/')
        .next()
        .unwrap_or("")
        .trim();
    if host.is_empty() {
        return Err("Enter a valid PaddleOCR API endpoint.".to_string());
    }

    Ok(api_url)
}

fn get_paddleocr_skills_dir() -> PathBuf {
    get_config_resolution().data_dir.join("workspace").join("skills")
}

fn get_paddleocr_skill_dir(skills_dir: &Path, module_id: &str) -> PathBuf {
    skills_dir.join(module_id)
}

fn ensure_json_object(
    value: &mut serde_json::Value,
) -> &mut serde_json::Map<String, serde_json::Value> {
    if !value.is_object() {
        *value = serde_json::json!({});
    }
    value
        .as_object_mut()
        .expect("object should exist after normalization")
}

fn ensure_object_property<'a>(
    map: &'a mut serde_json::Map<String, serde_json::Value>,
    key: &str,
) -> &'a mut serde_json::Map<String, serde_json::Value> {
    let entry = map
        .entry(key.to_string())
        .or_insert_with(|| serde_json::json!({}));
    if !entry.is_object() {
        *entry = serde_json::json!({});
    }
    entry
        .as_object_mut()
        .expect("object should exist after normalization")
}

fn load_config_json_value() -> Result<serde_json::Value, String> {
    get_config().map(|config| config.data)
}

fn save_config_json_value(config: serde_json::Value) -> Result<(), String> {
    save_config(config)
}

fn read_paddleocr_skill_entry<'a>(
    config: &'a serde_json::Value,
    module_id: &str,
) -> Option<&'a serde_json::Map<String, serde_json::Value>> {
    config
        .get("skills")?
        .as_object()?
        .get("entries")?
        .as_object()?
        .get(module_id)?
        .as_object()
}

fn read_paddleocr_api_url_from_entry(
    entry: Option<&serde_json::Map<String, serde_json::Value>>,
    module_id: &str,
) -> Option<String> {
    let entry = entry?;
    if let Some(config) = entry.get("config").and_then(|value| value.as_object()) {
        if let Some(api_url) = config
            .get("apiUrl")
            .and_then(|value| value.as_str())
            .map(str::trim)
            .filter(|value| !value.is_empty())
        {
            if let Ok(normalized) = normalize_paddleocr_api_url(module_id, api_url) {
                return Some(normalized);
            }
        }
    }

    let env = entry.get("env").and_then(|value| value.as_object())?;
    let env_key = paddleocr_module_api_env_key(module_id).ok()?;
    let env_url = env.get(env_key).and_then(|value| value.as_str())?.trim();
    if env_url.is_empty() {
        return None;
    }

    normalize_paddleocr_api_url(module_id, env_url).ok()
}

fn read_paddleocr_access_token_from_entry(
    entry: Option<&serde_json::Map<String, serde_json::Value>>,
) -> Option<String> {
    let entry = entry?;

    if let Some(token) = entry
        .get("apiKey")
        .and_then(|value| value.as_str())
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        return Some(token.to_string());
    }

    if let Some(token) = entry
        .get("config")
        .and_then(|value| value.as_object())
        .and_then(|config| config.get("accessToken"))
        .and_then(|value| value.as_str())
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        return Some(token.to_string());
    }

    entry
        .get("env")
        .and_then(|value| value.as_object())
        .and_then(|env| env.get("PADDLEOCR_ACCESS_TOKEN"))
        .and_then(|value| value.as_str())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(|value| value.to_string())
}

fn paddleocr_has_access_token(
    entry: Option<&serde_json::Map<String, serde_json::Value>>,
) -> bool {
    read_paddleocr_access_token_from_entry(entry).is_some()
}

fn build_paddleocr_module_status(
    config: &serde_json::Value,
    skills_dir: &Path,
    module_id: &str,
) -> PaddleocrModuleStatus {
    let entry = read_paddleocr_skill_entry(config, module_id);
    let enabled = entry
        .and_then(|item| item.get("enabled"))
        .and_then(|value| value.as_bool())
        .unwrap_or(false);
    let missing = !get_paddleocr_skill_dir(skills_dir, module_id).exists();
    let access_token_configured = paddleocr_has_access_token(entry);
    let api_url = read_paddleocr_api_url_from_entry(entry, module_id);
    let api_url_configured = api_url.is_some();

    PaddleocrModuleStatus {
        configured: enabled && !missing && access_token_configured && api_url_configured,
        enabled,
        missing,
        api_url_configured,
        access_token_configured,
        api_url,
    }
}

fn build_paddleocr_status(
    config: &serde_json::Value,
    skills_dir: &Path,
) -> PaddleocrStatusPayload {
    let text_recognition =
        build_paddleocr_module_status(config, skills_dir, PADDLEOCR_TEXT_SKILL_ID);
    let doc_parsing = build_paddleocr_module_status(config, skills_dir, PADDLEOCR_DOC_SKILL_ID);

    let enabled_modules = PADDLEOCR_SKILL_IDS
        .iter()
        .filter_map(|module_id| {
            let enabled = if *module_id == PADDLEOCR_TEXT_SKILL_ID {
                text_recognition.enabled
            } else {
                doc_parsing.enabled
            };
            if enabled {
                Some((*module_id).to_string())
            } else {
                None
            }
        })
        .collect::<Vec<_>>();

    let missing_modules = PADDLEOCR_SKILL_IDS
        .iter()
        .filter_map(|module_id| {
            let missing = if *module_id == PADDLEOCR_TEXT_SKILL_ID {
                text_recognition.missing
            } else {
                doc_parsing.missing
            };
            if missing {
                Some((*module_id).to_string())
            } else {
                None
            }
        })
        .collect::<Vec<_>>();

    PaddleocrStatusPayload {
        configured: text_recognition.configured && doc_parsing.configured,
        enabled_modules,
        missing_modules,
        text_recognition,
        doc_parsing,
    }
}

fn ensure_bundled_paddleocr_meta(skill_dir: &Path, module_id: &str) -> Result<(), String> {
    let meta_path = skill_dir.join("_meta.json");
    if meta_path.exists() {
        return Ok(());
    }

    let content = serde_json::to_string_pretty(&serde_json::json!({
        "slug": module_id,
        "version": "bundled",
        "source": "clawmaster-bundled",
        "bundled": true
    }))
    .map_err(|e| format!("Failed to serialize bundled PaddleOCR metadata: {e}"))?;

    fs::write(&meta_path, format!("{content}\n"))
        .map_err(|e| format!("Failed to write bundled PaddleOCR metadata: {e}"))?;
    Ok(())
}

fn ensure_bundled_paddleocr_modules(skills_dir: &Path) -> Result<(), String> {
    fs::create_dir_all(skills_dir)
        .map_err(|e| format!("Failed to prepare the OpenClaw skills directory: {e}"))?;

    for file in BUNDLED_PADDLEOCR_FILES {
        let target_path = get_paddleocr_skill_dir(skills_dir, file.module_id)
            .join(PathBuf::from(file.relative_path));
        if let Some(parent) = target_path.parent() {
            fs::create_dir_all(parent).map_err(|e| {
                format!(
                    "Failed to prepare the bundled PaddleOCR module directory {}: {e}",
                    parent.display()
                )
            })?;
        }
        if !target_path.exists() {
            fs::write(&target_path, file.contents).map_err(|e| {
                format!(
                    "Failed to copy bundled PaddleOCR module file {}: {e}",
                    target_path.display()
                )
            })?;
        }
    }

    for module_id in PADDLEOCR_SKILL_IDS {
        let skill_dir = get_paddleocr_skill_dir(skills_dir, module_id);
        fs::create_dir_all(&skill_dir).map_err(|e| {
            format!(
                "Failed to prepare bundled PaddleOCR module directory {}: {e}",
                skill_dir.display()
            )
        })?;
        ensure_bundled_paddleocr_meta(&skill_dir, module_id)?;
    }

    Ok(())
}

fn paddleocr_error_detail(payload: Option<&serde_json::Value>, fallback: &str) -> String {
    if let Some(detail) = payload
        .and_then(|value| value.get("errorMsg"))
        .and_then(|value| value.as_str())
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        return detail.to_string();
    }

    let trimmed = fallback.trim();
    if trimmed.is_empty() {
        "No response body".to_string()
    } else {
        shorten_chars(trimmed, 1000)
    }
}

fn paddleocr_error_code(payload: Option<&serde_json::Value>) -> i64 {
    let Some(payload) = payload else {
        return 0;
    };
    let Some(value) = payload.get("errorCode") else {
        return 0;
    };
    value
        .as_i64()
        .or_else(|| {
            value
                .as_u64()
                .filter(|number| *number <= i64::MAX as u64)
                .map(|number| number as i64)
        })
        .or_else(|| value.as_str().and_then(|text| text.trim().parse::<i64>().ok()))
        .unwrap_or(0)
}

fn paddleocr_sample_image_base64() -> String {
    PADDLEOCR_SAMPLE_IMAGE_BASE64
        .chars()
        .filter(|ch| !ch.is_whitespace())
        .collect()
}

fn count_non_empty_lines(text: &str) -> usize {
    text.lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .count()
}

fn extract_paddleocr_preview_text(payload: Option<&serde_json::Value>) -> (String, usize) {
    let Some(payload) = payload else {
        return (String::new(), 0);
    };

    let Some(result) = payload.get("result").and_then(|value| value.as_object()) else {
        let text = payload
            .get("text")
            .and_then(|value| value.as_str())
            .map(str::trim)
            .unwrap_or("")
            .to_string();
        return (text, 0);
    };

    if let Some(ocr_results) = result.get("ocrResults").and_then(|value| value.as_array()) {
        let page_texts = ocr_results
            .iter()
            .filter_map(|page| page.get("prunedResult"))
            .filter_map(|value| value.as_object())
            .map(|pruned_result| {
                pruned_result
                    .get("rec_texts")
                    .and_then(|value| value.as_array())
                    .map(|texts| {
                        texts
                            .iter()
                            .filter_map(|item| item.as_str())
                            .map(str::trim)
                            .filter(|item| !item.is_empty())
                            .collect::<Vec<_>>()
                            .join("\n")
                    })
                    .unwrap_or_default()
            })
            .filter(|text| !text.is_empty())
            .collect::<Vec<_>>();

        let page_count = result
            .get("dataInfo")
            .and_then(|value| value.as_object())
            .and_then(|data_info| data_info.get("numPages"))
            .and_then(|value| value.as_u64())
            .map(|value| value as usize)
            .filter(|value| *value > 0)
            .unwrap_or(ocr_results.len());

        return (page_texts.join("\n\n"), page_count);
    }

    if let Some(layout_results) = result
        .get("layoutParsingResults")
        .and_then(|value| value.as_array())
    {
        let page_texts = layout_results
            .iter()
            .filter_map(|page| page.get("markdown"))
            .filter_map(|value| value.as_object())
            .filter_map(|markdown| markdown.get("text"))
            .filter_map(|value| value.as_str())
            .map(str::trim)
            .filter(|text| !text.is_empty())
            .map(|text| text.to_string())
            .collect::<Vec<_>>();

        return (page_texts.join("\n\n"), layout_results.len());
    }

    let text = payload
        .get("text")
        .and_then(|value| value.as_str())
        .map(str::trim)
        .unwrap_or("")
        .to_string();
    (text, 0)
}

fn format_paddleocr_response_preview(payload: Option<&serde_json::Value>) -> String {
    let preview_value = payload.and_then(|value| value.get("result").or(Some(value)));
    let Some(preview_value) = preview_value else {
        return String::new();
    };

    let serialized =
        serde_json::to_string_pretty(preview_value).unwrap_or_else(|_| preview_value.to_string());
    shorten_chars(&serialized, 4000)
}

fn resolve_paddleocr_access_token(
    input_access_token: &str,
    config: &serde_json::Value,
    module_id: &str,
) -> Result<String, String> {
    let input_access_token = input_access_token.trim();
    if !input_access_token.is_empty() {
        return Ok(input_access_token.to_string());
    }

    read_paddleocr_access_token_from_entry(read_paddleocr_skill_entry(config, module_id))
        .ok_or_else(|| "Access Token is required.".to_string())
}

struct PaddleocrRequestResult {
    status: u16,
    raw_body: String,
    payload: Option<serde_json::Value>,
    latency_ms: u128,
}

fn run_paddleocr_request(
    api_url: &str,
    access_token: &str,
) -> Result<PaddleocrRequestResult, String> {
    const STATUS_MARKER: &str = "__CLAWMASTER_PADDLEOCR_STATUS__:";
    let payload = serde_json::json!({
        "file": paddleocr_sample_image_base64(),
        "fileType": 1,
        "visualize": false,
        "useDocUnwarping": false,
        "useDocOrientationClassify": false
    })
    .to_string();

    let started_at = Instant::now();
    let output = Command::new(resolve_system_command_path("curl"))
        .args([
            "-sS",
            "--connect-timeout",
            "10",
            "--max-time",
            "25",
            "-X",
            "POST",
            api_url,
            "-H",
            &format!("Authorization: token {access_token}"),
            "-H",
            "Content-Type: application/json",
            "-H",
            "Client-Platform: clawmaster-bundled",
            "-d",
            &payload,
            "-w",
            &format!("\n{STATUS_MARKER}%{{http_code}}"),
        ])
        .stdin(Stdio::null())
        .output()
        .map_err(|e| format!("PaddleOCR verification request could not start: {e}"))?;
    let latency_ms = started_at.elapsed().as_millis();

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    if !output.status.success() {
        let detail = if !stderr.trim().is_empty() {
            stderr.trim().to_string()
        } else if !stdout.trim().is_empty() {
            stdout.trim().to_string()
        } else {
            format!("curl exited with {:?}", output.status.code())
        };
        return Err(format!("PaddleOCR verification request failed: {detail}"));
    }

    let Some((body, status_text)) = stdout.rsplit_once(STATUS_MARKER) else {
        return Err("PaddleOCR verification returned an unreadable response.".to_string());
    };
    let status = status_text
        .trim()
        .parse::<u16>()
        .map_err(|_| "PaddleOCR verification returned an invalid status code.".to_string())?;

    let raw_body = body
        .trim_end_matches(|ch| ch == '\r' || ch == '\n')
        .to_string();
    let payload = serde_json::from_str::<serde_json::Value>(&raw_body).ok();

    Ok(PaddleocrRequestResult {
        status,
        raw_body,
        payload,
        latency_ms,
    })
}

fn validate_single_paddleocr_endpoint(
    module_id: &str,
    api_url: &str,
    access_token: &str,
) -> Result<(), String> {
    let label = paddleocr_validation_label(module_id)?;
    let request = run_paddleocr_request(api_url, access_token)?;

    if request.status != 200 {
        let detail = paddleocr_error_detail(request.payload.as_ref(), &request.raw_body);
        return Err(match request.status {
            403 => format!("{label} rejected the access token (403)."),
            429 => format!("{label} quota has been exceeded (429)."),
            500..=599 => {
                format!(
                    "{label} service is temporarily unavailable ({}): {detail}",
                    request.status
                )
            }
            _ => format!("{label} verification failed ({}): {detail}", request.status),
        });
    }

    let api_error_code = paddleocr_error_code(request.payload.as_ref());
    if api_error_code != 0 {
        let detail = paddleocr_error_detail(request.payload.as_ref(), &request.raw_body);
        return Err(format!("{label} verification failed: {detail}"));
    }

    Ok(())
}

fn validate_paddleocr_credentials(
    module_id: &str,
    api_url: &str,
    access_token: &str,
) -> Result<(), String> {
    let token = access_token.trim();
    if token.is_empty() {
        return Err("Access Token is required.".to_string());
    }

    let api_url = normalize_paddleocr_api_url(module_id, api_url)?;
    validate_single_paddleocr_endpoint(module_id, &api_url, token)?;
    Ok(())
}

fn clear_paddleocr_skill_entry(config: &mut serde_json::Value, module_id: &str) {
    if let Some(entries) = config
        .get_mut("skills")
        .and_then(|value| value.as_object_mut())
        .and_then(|skills| skills.get_mut("entries"))
        .and_then(|value| value.as_object_mut())
    {
        entries.remove(module_id);
    }
}

fn write_paddleocr_skill_entries(
    config: &mut serde_json::Value,
    module_id: &str,
    api_url: &str,
    access_token: &str,
) -> Result<(), String> {
    let root = ensure_json_object(config);
    let skills = ensure_object_property(root, "skills");
    let entries = ensure_object_property(skills, "entries");
    let api_env_key = paddleocr_module_api_env_key(module_id)?;
    let timeout_env_key = paddleocr_module_timeout_env_key(module_id)?;
    let timeout_default = paddleocr_module_timeout_default(module_id)?;

    let entry_value = entries
        .entry(module_id.to_string())
        .or_insert_with(|| serde_json::json!({}));
    let entry = ensure_json_object(entry_value);
    entry.insert("enabled".to_string(), serde_json::Value::Bool(true));
    entry.insert(
        "apiKey".to_string(),
        serde_json::Value::String(access_token.to_string()),
    );

    let env = ensure_object_property(entry, "env");
    env.insert(
        "PADDLEOCR_ACCESS_TOKEN".to_string(),
        serde_json::Value::String(access_token.to_string()),
    );
    env.insert(
        api_env_key.to_string(),
        serde_json::Value::String(api_url.to_string()),
    );
    env.insert(
        timeout_env_key.to_string(),
        serde_json::Value::String(timeout_default.to_string()),
    );

    let entry_config = ensure_object_property(entry, "config");
    entry_config.insert(
        "apiUrl".to_string(),
        serde_json::Value::String(api_url.to_string()),
    );
    entry_config.insert(
        "accessToken".to_string(),
        serde_json::Value::String(access_token.to_string()),
    );

    Ok(())
}

#[tauri::command]
fn get_paddleocr_status() -> Result<PaddleocrStatusPayload, String> {
    let config = load_config_json_value()?;
    Ok(build_paddleocr_status(&config, &get_paddleocr_skills_dir()))
}

#[tauri::command]
fn setup_paddleocr(payload: PaddleocrSetupPayload) -> Result<PaddleocrStatusPayload, String> {
    let module_id = payload.module_id.trim();
    let config = load_config_json_value()?;
    let access_token =
        resolve_paddleocr_access_token(&payload.access_token, &config, module_id)?;
    let api_url = normalize_paddleocr_api_url(module_id, &payload.api_url)?;
    validate_paddleocr_credentials(module_id, &api_url, &access_token)?;

    let skills_dir = get_paddleocr_skills_dir();
    ensure_bundled_paddleocr_modules(&skills_dir)?;

    let mut config = config;
    write_paddleocr_skill_entries(&mut config, module_id, &api_url, &access_token)?;
    save_config_json_value(config)?;

    let updated_config = load_config_json_value()?;
    Ok(build_paddleocr_status(&updated_config, &skills_dir))
}

#[tauri::command]
fn preview_paddleocr(payload: PaddleocrSetupPayload) -> Result<PaddleocrPreviewPayload, String> {
    let module_id = payload.module_id.trim();
    let config = load_config_json_value()?;
    let access_token =
        resolve_paddleocr_access_token(&payload.access_token, &config, module_id)?;
    let api_url = normalize_paddleocr_api_url(module_id, &payload.api_url)?;
    let request = run_paddleocr_request(&api_url, &access_token)?;
    let label = paddleocr_validation_label(module_id)?;

    if request.status != 200 {
        let detail = paddleocr_error_detail(request.payload.as_ref(), &request.raw_body);
        return Err(match request.status {
            403 => format!("{label} rejected the access token (403)."),
            429 => format!("{label} quota has been exceeded (429)."),
            500..=599 => {
                format!("{label} service is temporarily unavailable ({}): {detail}", request.status)
            }
            _ => format!("{label} verification failed ({}): {detail}", request.status),
        });
    }

    let api_error_code = paddleocr_error_code(request.payload.as_ref());
    if api_error_code != 0 {
        let detail = paddleocr_error_detail(request.payload.as_ref(), &request.raw_body);
        return Err(format!("{label} verification failed: {detail}"));
    }

    let (extracted_text, page_count) = extract_paddleocr_preview_text(request.payload.as_ref());

    Ok(PaddleocrPreviewPayload {
        module_id: module_id.to_string(),
        api_url,
        latency_ms: request.latency_ms,
        page_count,
        text_line_count: count_non_empty_lines(&extracted_text),
        extracted_text,
        response_preview: format_paddleocr_response_preview(request.payload.as_ref()),
    })
}

#[tauri::command]
fn clear_paddleocr(payload: PaddleocrClearPayload) -> Result<PaddleocrStatusPayload, String> {
    let module_id = payload.module_id.trim();
    if module_id != PADDLEOCR_TEXT_SKILL_ID && module_id != PADDLEOCR_DOC_SKILL_ID {
        return Err("Unsupported PaddleOCR module.".to_string());
    }

    let mut config = load_config_json_value()?;
    clear_paddleocr_skill_entry(&mut config, module_id);
    save_config_json_value(config)?;

    let updated_config = load_config_json_value()?;
    let skills_dir = get_paddleocr_skills_dir();
    Ok(build_paddleocr_status(&updated_config, &skills_dir))
}

#[cfg(test)]
mod tests {
    use super::{
        get_config_path_candidates_for, get_openclaw_profile_args, get_openclaw_profile_data_dir,
        resolve_config_path_from_candidates, OpenclawProfileSelection,
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
        let roaming_candidate = root
            .join("roaming")
            .join("openclaw")
            .join("openclaw.json");

        fs::create_dir_all(roaming_candidate.parent().expect("roaming parent should exist"))
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

        assert_eq!(get_openclaw_profile_args(&selection), vec!["--dev".to_string()]);
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
}

// Run command with --version-style arg; return stdout if success
fn check_command(cmd: &str, version_arg: &str) -> Option<String> {
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

    Ok(SystemInfo {
        nodejs,
        npm,
        openclaw,
    })
}

fn default_gateway_port_from_config() -> u16 {
    let p = get_config_path();
    let Ok(s) = fs::read_to_string(&p) else {
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
    if let Some(parent) = config_path.parent() {
        fs::create_dir_all(parent).map_err(|e| cmd_err_d("IO_ERROR", e))?;
    }
    if !config_path.exists() {
        fs::write(&config_path, "{}\n").map_err(|e| cmd_err_d("IO_ERROR", e))?;
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

    if !config_path.exists() {
        return Ok(OpenClawConfig {
            data: serde_json::json!({}),
        });
    }

    let content =
        fs::read_to_string(&config_path).map_err(|e| cmd_err_d("CONFIG_READ_FAILED", e))?;

    let data: serde_json::Value =
        serde_json::from_str(&content).map_err(|e| cmd_err_d("CONFIG_PARSE_FAILED", e))?;

    Ok(OpenClawConfig { data })
}

// Save openclaw.json
#[tauri::command]
fn save_config(config: serde_json::Value) -> Result<(), String> {
    let config_path = get_config_path();

    // Ensure parent directory exists
    if let Some(parent) = config_path.parent() {
        fs::create_dir_all(parent).map_err(|e| cmd_err_d("CONFIG_MKDIR_FAILED", e))?;
    }

    let content = serde_json::to_string_pretty(&config)
        .map_err(|e| cmd_err_d("CONFIG_SERIALIZE_FAILED", e))?;

    fs::write(&config_path, content).map_err(|e| cmd_err_d("CONFIG_WRITE_FAILED", e))?;

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
    if let Some(parent) = config_path.parent() {
        fs::create_dir_all(parent).map_err(|e| cmd_err_d("RESET_MKDIR_FAILED", e))?;
    }
    let content = serde_json::to_string_pretty(&serde_json::json!({}))
        .map_err(|e| cmd_err_d("RESET_SERIALIZE_FAILED", e))?;
    fs::write(&config_path, content).map_err(|e| cmd_err_d("RESET_WRITE_FAILED", e))?;
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
    if let Ok(raw) = fs::read_to_string(&config_path) {
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
        if !log_path.exists() {
            continue;
        }
        let content = fs::read_to_string(&log_path).map_err(|e| cmd_err_d("LOG_READ_FAILED", e))?;
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

fn is_allowed_system_command(cmd: &str) -> bool {
    matches!(
        cmd,
        "bash" | "clawhub" | "curl" | "mkdir" | "nohup" | "npm" | "ollama" | "pip" | "python3"
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

fn expand_powermem_env_path(raw: &str) -> PathBuf {
    let t = raw.trim();
    if let Some(rest) = t.strip_prefix("~/") {
        dirs::home_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join(rest)
    } else {
        PathBuf::from(t)
    }
}

fn json_str_trim(v: &serde_json::Value, key: &str) -> Option<String> {
    v.get(key)?
        .as_str()
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string())
}

fn provider_api_key_json(cfg: &serde_json::Value) -> Option<String> {
    json_str_trim(cfg, "apiKey")
        .or_else(|| json_str_trim(cfg, "api_key"))
        .or_else(|| json_str_trim(cfg, "token"))
        .or_else(|| json_str_trim(cfg, "key"))
}

fn provider_looks_dashscope(id: &str, cfg: &serde_json::Value) -> bool {
    let id_l = id.to_lowercase();
    if id_l.contains("dashscope")
        || id_l.contains("qwen")
        || id_l.contains("tongyi")
        || id_l.contains("bailian")
        || id_l.contains("alibabacloud")
        || id_l.contains("modelstudio")
        || id.contains("百炼")
    {
        return true;
    }
    let base = cfg
        .get("baseUrl")
        .and_then(|b| b.as_str())
        .unwrap_or("")
        .to_lowercase();
    base.contains("dashscope")
        || base.contains("alibabacloud")
        || base.contains("qwen")
        || base.contains("tongyi")
        || base.contains("bailian")
}

fn extract_powermem_dashscope_key(config: &serde_json::Value) -> Option<String> {
    if let Some(entries) = config.get("plugins").and_then(|p| p.get("entries")) {
        if let Some(ent) = entries.get("memory-powermem") {
            if let Some(pcfg) = ent.get("config") {
                if let Some(k) = provider_api_key_json(pcfg) {
                    return Some(k);
                }
            }
        }
    }
    let providers = config
        .get("models")
        .and_then(|m| m.get("providers"))
        .and_then(|p| p.as_object())?;

    let mut named_key: Option<String> = None;
    let mut fallback_key: Option<String> = None;
    for (id, pv) in providers {
        let Some(key) = provider_api_key_json(pv) else {
            continue;
        };
        if provider_looks_dashscope(id, pv) {
            named_key = Some(key);
            break;
        }
        if fallback_key.is_none() {
            fallback_key = Some(key);
        }
    }
    if let Some(k) = named_key {
        return Some(k);
    }
    if let Some(primary) = config
        .get("agents")
        .and_then(|a| a.get("defaults"))
        .and_then(|d| d.get("model"))
        .and_then(|m| m.get("primary"))
        .and_then(|p| p.as_str())
    {
        if let Some((prov, _)) = primary.split_once('/') {
            let prov = prov.trim();
            if !prov.is_empty() {
                if let Some(pv) = providers.get(prov) {
                    if let Some(k) = provider_api_key_json(pv) {
                        return Some(k);
                    }
                }
            }
        }
    }
    fallback_key
}

fn format_powermem_dotenv_value(value: &str) -> String {
    let needs_quote = value
        .chars()
        .any(|c| matches!(c, '\r' | '\n' | '#' | '\'' | '"' | '\\'))
        || value != value.trim();
    if needs_quote {
        let escaped = value.replace('\\', "\\\\").replace('"', "\\\"");
        format!("\"{escaped}\"")
    } else {
        value.to_string()
    }
}

const POWERMEM_ENV_TEMPLATE: &str = include_str!("../../packages/backend/src/powermem.env.example");

fn replace_powermem_dotenv_line(content: &str, name: &str, rhs: &str) -> String {
    let prefix = format!("{}=", name);
    content
        .lines()
        .map(|line| {
            let trimmed = line.trim_start();
            if trimmed.starts_with('#') {
                return line.to_string();
            }
            if line.starts_with(&prefix) || trimmed.starts_with(&prefix) {
                format!("{}={}", name, rhs)
            } else {
                line.to_string()
            }
        })
        .collect::<Vec<_>>()
        .join("\n")
}

fn merge_openclaw_key_into_powermem_template(template: &str, key: Option<&str>) -> String {
    let header = "# Clawmaster: first-time .env from oceanbase/powermem `.env.example` (bundled).\n\
                  # Upstream: https://github.com/oceanbase/powermem/blob/main/.env.example\n\
                  # LLM / embedding / rerank / sparse / DASHSCOPE lines may be filled from openclaw.json when created.\n\
                  # SQLITE_PATH is set to match OpenClaw gateway memory-powermem (powermem/data/powermem.db).\n\n";
    let mut body = if let Some(k) = key.map(str::trim).filter(|s| !s.is_empty()) {
        let v = format_powermem_dotenv_value(k);
        let mut b = template.to_string();
        for name in [
            "LLM_API_KEY",
            "EMBEDDING_API_KEY",
            "RERANKER_API_KEY",
            "SPARSE_EMBEDDER_API_KEY",
        ] {
            b = replace_powermem_dotenv_line(&b, name, &v);
        }
        let has_dashscope = b.lines().any(|line| {
            let t = line.trim_start();
            !t.starts_with('#') && t.starts_with("DASHSCOPE_API_KEY=")
        });
        if has_dashscope {
            replace_powermem_dotenv_line(&b, "DASHSCOPE_API_KEY", &v)
        } else {
            format!("DASHSCOPE_API_KEY={}\n\n{}", v, b)
        }
    } else {
        template.to_string()
    };
    if let Some(parent) = get_config_path().parent() {
        let data = parent.join("powermem").join("data");
        let _ = fs::create_dir_all(&data);
        let db = data.join("powermem.db");
        let v_sqlite = format_powermem_dotenv_value(&db.to_string_lossy());
        body = replace_powermem_dotenv_line(&body, "SQLITE_PATH", &v_sqlite);
    }
    format!("{}{}", header, body)
}

/// If `<openclaw data>/powermem/.env` is missing, create it from bundled PowerMem `.env.example` (keys from openclaw.json when possible).
fn ensure_powermem_dotenv_file() {
    let config_path = get_config_path();
    let Some(parent) = config_path.parent() else {
        return;
    };
    let pm_dir = parent.join("powermem");
    let env_path = pm_dir.join(".env");
    if env_path.is_file() {
        return;
    }
    let _ = fs::create_dir_all(&pm_dir);
    let raw = fs::read_to_string(&config_path).unwrap_or_else(|_| "{}".to_string());
    let config: serde_json::Value =
        serde_json::from_str(&raw).unwrap_or_else(|_| serde_json::json!({}));
    let key = extract_powermem_dashscope_key(&config);
    let body = merge_openclaw_key_into_powermem_template(POWERMEM_ENV_TEMPLATE, key.as_deref());
    let out = if body.ends_with('\n') {
        body
    } else {
        format!("{}\n", body)
    };
    let _ = fs::write(&env_path, out);
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        if let Ok(meta) = fs::metadata(&env_path) {
            let mut p = meta.permissions();
            p.set_mode(0o600);
            let _ = fs::set_permissions(&env_path, p);
        }
    }
}

/// Explicit `env_file` from plugin config, else default `<openclaw data>/powermem/.env` (created on first use when missing).
fn resolve_powermem_env_file_path(env_file: Option<&str>) -> Option<PathBuf> {
    if let Some(raw) = env_file.map(str::trim).filter(|s| !s.is_empty()) {
        let p = expand_powermem_env_path(raw);
        if p.is_file() {
            return Some(p);
        }
    }
    ensure_powermem_dotenv_file();
    let default_path = get_config_path().parent()?.join("powermem").join(".env");
    if default_path.is_file() {
        Some(default_path)
    } else {
        None
    }
}

fn database_provider_from_dotenv_file(path: &Path) -> Option<String> {
    let s = fs::read_to_string(path).ok()?;
    for line in s.lines() {
        let t = line.trim_start().trim_end();
        if t.starts_with('#') || t.is_empty() {
            continue;
        }
        let Some((k, v)) = t.split_once('=') else {
            continue;
        };
        if !k.trim().eq_ignore_ascii_case("DATABASE_PROVIDER") {
            continue;
        }
        let v = v.trim().trim_matches(|c| c == '"' || c == '\'');
        return Some(v.to_lowercase());
    }
    None
}

fn should_inject_gateway_sqlite_path(env_file_resolved: Option<&Path>) -> bool {
    let Some(p) = env_file_resolved.filter(|p| p.is_file()) else {
        return true;
    };
    match database_provider_from_dotenv_file(p).as_deref() {
        Some("oceanbase") | Some("postgres") => false,
        _ => true,
    }
}

fn pmem_args_with_env_file(mut args: Vec<String>, env_path: &Path) -> Vec<String> {
    if args.windows(2).any(|w| w[0] == "--env-file") {
        return args;
    }
    let s = env_path.to_string_lossy().to_string();
    let mut out = vec!["--env-file".to_string(), s];
    out.append(&mut args);
    out
}

/// Run `pmem` / `powermem` CLI (PowerMem). `program` is usually `pmem` or an absolute path from plugin config.
#[tauri::command]
fn run_pmem_command(
    program: String,
    args: Vec<String>,
    env_file: Option<String>,
    api_key: Option<String>,
) -> Result<String, String> {
    let prog = program.trim();
    if prog.is_empty() {
        return Err("PMEM_EMPTY_PROGRAM".to_string());
    }
    let resolved = resolve_powermem_env_file_path(env_file.as_deref());
    let final_args = match &resolved {
        Some(p) => pmem_args_with_env_file(args, p),
        None => args,
    };
    let mut cmd = Command::new(prog);
    cmd.args(&final_args);
    if let Some(ref p) = resolved {
        cmd.env("POWERMEM_ENV_FILE", p.to_string_lossy().to_string());
    }
    if let Some(key) = api_key.as_ref().map(|s| s.trim()).filter(|s| !s.is_empty()) {
        cmd.env("DASHSCOPE_API_KEY", key);
    }
    if should_inject_gateway_sqlite_path(resolved.as_deref()) {
        if let Some(parent) = get_config_path().parent() {
            let data = parent.join("powermem").join("data");
            let _ = fs::create_dir_all(&data);
            cmd.env(
                "SQLITE_PATH",
                data.join("powermem.db").to_string_lossy().to_string(),
            );
        }
    }
    let output = cmd
        .output()
        .map_err(|e| cmd_err_d("PMEM_CMD_SPAWN_FAILED", e))?;
    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    if output.status.success() {
        Ok(stdout)
    } else {
        Err(cmd_err_stderr("PMEM_CMD_FAILED", &stderr))
    }
}

fn powermem_plugin_entry(config: &serde_json::Value) -> Option<&serde_json::Value> {
    config
        .get("plugins")
        .and_then(|p| p.get("entries"))
        .and_then(|e| e.get("memory-powermem"))
}

fn powermem_plugin_enabled(ent: &serde_json::Value) -> bool {
    ent.get("enabled").and_then(|v| v.as_bool()).unwrap_or(true)
}

fn powermem_mode_from_entry(ent: &serde_json::Value) -> String {
    let cfg = ent.get("config").unwrap_or(&serde_json::Value::Null);
    match cfg.get("mode").and_then(|m| m.as_str()) {
        Some("http") => return "http".to_string(),
        Some("cli") => return "cli".to_string(),
        _ => {}
    }
    let base_url = cfg
        .get("baseUrl")
        .and_then(|b| b.as_str())
        .map(|s| s.trim())
        .unwrap_or("");
    if !base_url.is_empty() {
        "http".to_string()
    } else {
        "cli".to_string()
    }
}

fn powermem_cli_env_raw_from_entry(ent: &serde_json::Value) -> Option<String> {
    let cfg = ent.get("config").unwrap_or(&serde_json::Value::Null);
    json_str_trim(cfg, "envFile").or_else(|| json_str_trim(cfg, "env_file"))
}

#[derive(Serialize)]
struct PowermemEnvEditorPayload {
    path: String,
    content: String,
}

#[tauri::command]
fn read_powermem_env_file() -> Result<PowermemEnvEditorPayload, String> {
    let config_path = get_config_path();
    let raw = fs::read_to_string(&config_path).map_err(|e| e.to_string())?;
    let config: serde_json::Value =
        serde_json::from_str(&raw).unwrap_or_else(|_| serde_json::json!({}));
    let Some(ent) = powermem_plugin_entry(&config) else {
        return Err("POWERMEM_NOT_CONFIGURED".to_string());
    };
    if !powermem_plugin_enabled(ent) {
        return Err("POWERMEM_PLUGIN_DISABLED".to_string());
    }
    if powermem_mode_from_entry(ent) != "cli" {
        return Err("POWERMEM_ENV_HTTP_MODE".to_string());
    }
    let env_raw = powermem_cli_env_raw_from_entry(ent);
    let path_buf = resolve_powermem_env_file_path(env_raw.as_deref())
        .ok_or_else(|| "POWERMEM_ENV_NO_PATH".to_string())?;
    let path = path_buf.to_string_lossy().to_string();
    let content = fs::read_to_string(&path_buf).unwrap_or_default();
    Ok(PowermemEnvEditorPayload { path, content })
}

#[tauri::command]
fn write_powermem_env_file(content: String) -> Result<(), String> {
    const MAX_BYTES: usize = 256 * 1024;
    if content.len() > MAX_BYTES {
        return Err("POWERMEM_ENV_TOO_LARGE".to_string());
    }
    let config_path = get_config_path();
    let raw = fs::read_to_string(&config_path).map_err(|e| e.to_string())?;
    let config: serde_json::Value =
        serde_json::from_str(&raw).unwrap_or_else(|_| serde_json::json!({}));
    let Some(ent) = powermem_plugin_entry(&config) else {
        return Err("POWERMEM_NOT_CONFIGURED".to_string());
    };
    if !powermem_plugin_enabled(ent) {
        return Err("POWERMEM_PLUGIN_DISABLED".to_string());
    }
    if powermem_mode_from_entry(ent) != "cli" {
        return Err("POWERMEM_ENV_HTTP_MODE".to_string());
    }
    let env_raw = powermem_cli_env_raw_from_entry(ent);
    let path_buf = resolve_powermem_env_file_path(env_raw.as_deref())
        .ok_or_else(|| "POWERMEM_ENV_NO_PATH".to_string())?;
    if let Some(parent) = path_buf.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(&path_buf, content).map_err(|e| e.to_string())?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        if let Ok(meta) = fs::metadata(&path_buf) {
            let mut p = meta.permissions();
            p.set_mode(0o600);
            let _ = fs::set_permissions(&path_buf, p);
        }
    }
    Ok(())
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
            get_paddleocr_status,
            setup_paddleocr,
            preview_paddleocr,
            clear_paddleocr,
            reset_openclaw_config,
            save_openclaw_profile,
            clear_openclaw_profile,
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
            get_logs,
            run_openclaw_command,
            run_openclaw_command_captured,
            run_openclaw_command_stdin,
            run_clawprobe_command,
            run_system_command,
            run_pmem_command,
            read_powermem_env_file,
            write_powermem_env_file,
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
