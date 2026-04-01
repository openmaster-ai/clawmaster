use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::net::{SocketAddr, TcpStream};
use std::process::{Command, Stdio};
use std::sync::OnceLock;
use std::time::Duration;

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
pub struct OpenClawInfo {
    pub installed: bool,
    pub version: String,
    pub config_path: String,
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

/// GUI processes (especially when launched from Finder on macOS) often lack nvm/fnm global bins in PATH,
/// so `openclaw` may differ from Terminal or be missing. Resolve via login shell `command -v openclaw`.
fn openclaw_executable_path() -> PathBuf {
    OPENCLAW_EXE
        .get_or_init(|| {
            try_resolve_openclaw_via_login_shell()
                .unwrap_or_else(|| PathBuf::from("openclaw"))
        })
        .clone()
}

fn openclaw_cmd() -> Command {
    Command::new(openclaw_executable_path())
}

fn clawprobe_executable_path() -> PathBuf {
    CLAWPROBE_EXE
        .get_or_init(|| {
            try_resolve_clawprobe_via_login_shell()
                .unwrap_or_else(|| PathBuf::from("clawprobe"))
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
        if p.exists() { Some(p) } else { None }
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
        if p.exists() { Some(p) } else { None }
    }
}

// OpenClaw config file path
fn get_config_path() -> PathBuf {
    if cfg!(target_os = "windows") {
        dirs::config_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join("openclaw")
            .join("openclaw.json")
    } else {
        dirs::home_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join(".openclaw")
            .join("openclaw.json")
    }
}

// Run command with --version-style arg; return stdout if success
fn check_command(cmd: &str, version_arg: &str) -> Option<String> {
    let output = Command::new(cmd)
        .arg(version_arg)
        .output()
        .ok()?;
    
    if output.status.success() {
        let version = String::from_utf8_lossy(&output.stdout)
            .trim()
            .to_string();
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
        version: nodejs_version.unwrap_or_else(|| "未安装".to_string()),
    };

    // npm
    let npm_version = check_command("npm", "--version");
    let npm = NpmInfo {
        installed: npm_version.is_some(),
        version: npm_version.map(|v| v.lines().next().unwrap_or("未知").to_string()).unwrap_or_else(|| "未安装".to_string()),
    };

    // OpenClaw (same resolution as gateway start so GUI PATH misses do not break detection)
    let openclaw_version = openclaw_cmd()
        .arg("--version")
        .output()
        .ok()
        .filter(|o| o.status.success())
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string());
    let config_path = get_config_path();
    
    let openclaw = OpenClawInfo {
        installed: openclaw_version.is_some() || config_path.exists(),
        version: openclaw_version
            .map(|v| v.trim().replace("openclaw ", "").replace("v", ""))
            .unwrap_or_else(|| "未知".to_string()),
        config_path: config_path.to_string_lossy().to_string(),
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
        .map_err(|e| format!("启动失败: {}", e))?;
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
            format!("退出码 {:?}", output.status.code())
        };
        Err(format!("openclaw gateway start 失败: {}", msg))
    }
}

#[cfg(not(target_os = "macos"))]
fn start_gateway_impl() -> Result<(), String> {
    let output = openclaw_cmd()
        .args(&["gateway", "start"])
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .map_err(|e| format!("启动失败: {}", e))?;
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
            format!("退出码 {:?}", output.status.code())
        };
        Err(format!("openclaw gateway start 失败: {}", msg))
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
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    if !config_path.exists() {
        fs::write(&config_path, "{}\n").map_err(|e| e.to_string())?;
    }

    let doc = openclaw_cmd()
        .args(["doctor", "--fix"])
        .output()
        .map_err(|e| format!("无法执行 openclaw doctor: {}", e))?;

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
        .map_err(|e| format!("停止失败: {}", e))?;
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

    let content = fs::read_to_string(&config_path)
        .map_err(|e| format!("读取配置失败: {}", e))?;

    let data: serde_json::Value = serde_json::from_str(&content)
        .map_err(|e| format!("解析配置失败: {}", e))?;

    Ok(OpenClawConfig { data })
}

// Save openclaw.json
#[tauri::command]
fn save_config(config: serde_json::Value) -> Result<(), String> {
    let config_path = get_config_path();
    
    // Ensure parent directory exists
    if let Some(parent) = config_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("创建目录失败: {}", e))?;
    }

    let content = serde_json::to_string_pretty(&config)
        .map_err(|e| format!("序列化配置失败: {}", e))?;

    fs::write(&config_path, content)
        .map_err(|e| format!("写入配置失败: {}", e))?;

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
        fs::create_dir_all(parent).map_err(|e| format!("创建目录失败: {}", e))?;
    }
    let content = serde_json::to_string_pretty(&serde_json::json!({}))
        .map_err(|e| format!("序列化失败: {}", e))?;
    fs::write(&config_path, content).map_err(|e| format!("写入失败: {}", e))?;
    Ok(())
}

fn npm_root_g() -> Result<String, String> {
    let output = Command::new("npm")
        .args(["root", "-g"])
        .output()
        .map_err(|e| format!("无法执行 npm root -g: {}", e))?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }
    let s = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if s.is_empty() {
        return Err("npm root -g 输出为空".into());
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
            Err(e) => (
                false,
                -1,
                String::new(),
                format!("无法执行 npm: {}", e),
            ),
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
        return (
            true,
            0,
            format!("{}\n(全局目录已不存在)", out),
            err,
        );
    }

    match fs::remove_dir_all(&pkg_dir) {
        Ok(()) => (
            true,
            0,
            format!("{}\n已手动删除: {}", out, pkg_dir.display()),
            err,
        ),
        Err(e) => (
            false,
            c1,
            out,
            format!("{}\n删除目录失败: {}", err, e),
        ),
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
        return Err("Invalid version or tag".to_string());
    }
    if !t.chars()
        .all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-'))
    {
        return Err("Invalid version or tag".to_string());
    }
    Ok(())
}

fn cmp_openclaw_version_desc(a: &str, b: &str) -> std::cmp::Ordering {
    fn key(v: &str) -> [i64; 3] {
        let core = v.split('-').next().unwrap_or("").split('+').next().unwrap_or("");
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
            .map_err(|e| format!("无法执行 npm: {}", e))?;
        if !output.status.success() {
            return Err(String::from_utf8_lossy(&output.stderr).to_string());
        }
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    }

    let v_raw = npm_stdout(&["view", "openclaw", "versions", "--json"])?;
    let parsed: serde_json::Value =
        serde_json::from_str(v_raw.trim()).map_err(|e| format!("解析版本列表失败: {}", e))?;
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
        .map_err(|e| format!("无法执行 npm: {}", e))?;
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
        return Err("路径不是有效文件".into());
    }
    let name = p
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_lowercase();
    if !name.ends_with(".tgz") && !name.ends_with(".tar.gz") {
        return Err("仅支持 npm pack 生成的 .tgz 或 .tar.gz".into());
    }
    let canon = fs::canonicalize(&p).map_err(|e| e.to_string())?;
    let s = canon.to_string_lossy().to_string();
    let output = Command::new("npm")
        .args(["install", "-g", &s])
        .output()
        .map_err(|e| format!("无法执行 npm: {}", e))?;
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

    let backup_ok = steps.iter().find(|s| s.id == "backup").map(|s| s.ok).unwrap_or(false);
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
    fs::create_dir_all(dst).map_err(|e| e.to_string())?;
    for entry in fs::read_dir(src).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let ty = entry.file_type().map_err(|e| e.to_string())?;
        let from = entry.path();
        let to = dst.join(entry.file_name());
        if ty.is_dir() {
            copy_dir_all(&from, &to)?;
        } else {
            fs::copy(&from, &to).map_err(|e| e.to_string())?;
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
    let home = dirs::home_dir().ok_or_else(|| "无法解析用户主目录".to_string())?;
    let desktop = home.join("Desktop");
    let desktop_dir = if desktop.is_dir() {
        desktop.to_string_lossy().to_string()
    } else {
        home.to_string_lossy().to_string()
    };
    let snapshots_dir = home.join(".openclaw_snapshots").to_string_lossy().to_string();
    let data_dir = get_config_path()
        .parent()
        .ok_or_else(|| "无效配置路径".to_string())?
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
                .ok_or_else(|| "自定义模式请填写 exportDir".to_string())?;
            expand_home_path(&s)
        }
        _ => return Err("mode 须为 snapshots / desktop / custom".into()),
    };
    let data_dir = PathBuf::from(&defs.data_dir);
    if !data_dir.exists() {
        return Err("未找到 OpenClaw 数据目录".into());
    }
    fs::create_dir_all(&out_parent).map_err(|e| e.to_string())?;
    let ts = format_backup_ts();
    let snap_id = format!("openclaw_backup_{}", ts);
    let tmp = std::env::temp_dir().join(format!("ocb-{}", ts));
    let snap_root = tmp.join(&snap_id);
    let data_target = snap_root.join("openclaw_data");
    fs::create_dir_all(&data_target).map_err(|e| e.to_string())?;
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
    let meta_str = serde_json::to_string_pretty(&meta).map_err(|e| e.to_string())?;
    fs::write(snap_root.join("snapshot.json"), meta_str).map_err(|e| e.to_string())?;
    let tar_path = out_parent.join(format!("{}.tar.gz", snap_id));
    let st = Command::new("tar")
        .arg("-czf")
        .arg(&tar_path)
        .arg("-C")
        .arg(&tmp)
        .arg(&snap_id)
        .status()
        .map_err(|e| format!("tar 不可用: {}", e))?;
    if !st.success() {
        let _ = fs::remove_dir_all(&tmp);
        return Err("tar 打包失败".into());
    }
    let _ = fs::remove_dir_all(&tmp);
    let size = fs::metadata(&tar_path).map_err(|e| e.to_string())?.len();
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
        .map_err(|e| e.to_string())?
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
        return Err("备份文件无效".into());
    }
    let tmp = std::env::temp_dir().join(format!("ocr-{}", format_backup_ts()));
    fs::create_dir_all(&tmp).map_err(|e| e.to_string())?;
    let st = Command::new("tar")
        .arg("-xzf")
        .arg(&tar)
        .arg("-C")
        .arg(&tmp)
        .status()
        .map_err(|e| e.to_string())?;
    if !st.success() {
        let _ = fs::remove_dir_all(&tmp);
        return Err("解压失败".into());
    }
    let mut data_src: Option<PathBuf> = None;
    for entry in fs::read_dir(&tmp).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        if entry.file_type().map_err(|e| e.to_string())?.is_dir() {
            let p = entry.path().join("openclaw_data");
            if p.is_dir() {
                data_src = Some(p);
                break;
            }
        }
    }
    let data_src = data_src.ok_or_else(|| "包内无 openclaw_data".to_string())?;
    let target = get_config_path()
        .parent()
        .ok_or_else(|| "无配置路径".to_string())?
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
        fs::rename(&target, &bak).map_err(|e| e.to_string())?;
    }
    fs::create_dir_all(&target).map_err(|e| e.to_string())?;
    copy_dir_all(&data_src, &target)?;
    let _ = fs::remove_dir_all(&tmp);
    Ok(())
}

#[tauri::command]
fn remove_openclaw_data(confirm: String) -> Result<(), String> {
    if confirm != "DELETE" {
        return Err("需要 confirm 为 DELETE".into());
    }
    let target = get_config_path()
        .parent()
        .ok_or_else(|| "无配置路径".to_string())?
        .to_path_buf();
    if target.exists() {
        fs::remove_dir_all(&target).map_err(|e| e.to_string())?;
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
        let content = fs::read_to_string(&log_path)
            .map_err(|e| format!("读取日志失败: {}", e))?;
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
    Ok(vec!["暂无日志".to_string()])
}

// Run arbitrary openclaw CLI args
#[tauri::command]
fn run_openclaw_command(args: Vec<String>) -> Result<String, String> {
    let output = openclaw_cmd()
        .args(&args)
        .output()
        .map_err(|e| format!("执行命令失败: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    if output.status.success() {
        Ok(stdout)
    } else {
        Err(format!("命令执行失败: {}", stderr))
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
        .map_err(|e| format!("执行命令失败: {}", e))?;
    Ok(OpenclawCapturedOutput {
        code: output.status.code().unwrap_or(-1),
        stdout: String::from_utf8_lossy(&output.stdout).to_string(),
        stderr: String::from_utf8_lossy(&output.stderr).to_string(),
    })
}

// ClawProbe CLI (`clawprobe` on PATH, same resolution strategy as openclaw).
// Non-zero exit with JSON on stdout (e.g. `outputJsonError` in --json mode) still returns Ok for UI parsing.
#[tauri::command]
fn run_clawprobe_command(args: Vec<String>) -> Result<String, String> {
    let output = clawprobe_cmd()
        .args(&args)
        .output()
        .map_err(|e| format!("执行命令失败: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    if output.status.success() || !stdout.trim().is_empty() {
        Ok(stdout)
    } else {
        Err(format!("命令执行失败: {}", stderr))
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
            run_clawprobe_command,
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
