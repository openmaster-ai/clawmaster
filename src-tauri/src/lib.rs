use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::process::Command;
use std::path::PathBuf;
use std::fs;

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

// 获取 OpenClaw 配置文件路径
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

// 检查命令是否存在并获取版本
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

// 检测系统环境
#[tauri::command]
fn detect_system() -> Result<SystemInfo, String> {
    // 检测 Node.js
    let nodejs_version = check_command("node", "--version");
    let nodejs = NodejsInfo {
        installed: nodejs_version.is_some(),
        version: nodejs_version.unwrap_or_else(|| "未安装".to_string()),
    };

    // 检测 npm
    let npm_version = check_command("npm", "--version");
    let npm = NpmInfo {
        installed: npm_version.is_some(),
        version: npm_version.map(|v| v.lines().next().unwrap_or("未知").to_string()).unwrap_or_else(|| "未安装".to_string()),
    };

    // 检测 OpenClaw
    let openclaw_version = check_command("openclaw", "--version");
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

// 获取 Gateway 状态
#[tauri::command]
fn get_gateway_status() -> Result<GatewayStatus, String> {
    // 尝试通过 openclaw 命令获取状态
    let output = Command::new("openclaw")
        .args(&["gateway", "status", "--json"])
        .output();

    match output {
        Ok(o) if o.status.success() => {
            let json: serde_json::Value = serde_json::from_slice(&o.stdout)
                .unwrap_or(serde_json::json!({"running": false, "port": 18789}));
            Ok(GatewayStatus {
                running: json["running"].as_bool().unwrap_or(false),
                port: json["port"].as_u64().unwrap_or(18789) as u16,
            })
        }
        _ => {
            // 如果命令失败，假设未运行
            Ok(GatewayStatus {
                running: false,
                port: 18789,
            })
        }
    }
}

// 启动 Gateway
#[tauri::command]
fn start_gateway() -> Result<(), String> {
    Command::new("openclaw")
        .args(&["gateway", "start"])
        .spawn()
        .map_err(|e| format!("启动失败: {}", e))?;
    Ok(())
}

// 停止 Gateway
#[tauri::command]
fn stop_gateway() -> Result<(), String> {
    Command::new("openclaw")
        .args(&["gateway", "stop"])
        .status()
        .map_err(|e| format!("停止失败: {}", e))?;
    Ok(())
}

// 重启 Gateway
#[tauri::command]
fn restart_gateway() -> Result<(), String> {
    stop_gateway().ok();
    std::thread::sleep(std::time::Duration::from_secs(1));
    start_gateway()
}

// 读取配置文件
#[tauri::command]
fn get_config() -> Result<OpenClawConfig, String> {
    let config_path = get_config_path();
    
    if !config_path.exists() {
        return Err(format!("配置文件不存在: {}", config_path.display()));
    }

    let content = fs::read_to_string(&config_path)
        .map_err(|e| format!("读取配置失败: {}", e))?;

    let data: serde_json::Value = serde_json::from_str(&content)
        .map_err(|e| format!("解析配置失败: {}", e))?;

    Ok(OpenClawConfig { data })
}

// 保存配置文件
#[tauri::command]
fn save_config(config: serde_json::Value) -> Result<(), String> {
    let config_path = get_config_path();
    
    // 确保目录存在
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

// 获取日志
#[tauri::command]
fn get_logs(lines: usize) -> Result<Vec<String>, String> {
    let config_path = get_config_path();
    let log_path = config_path.parent()
        .unwrap_or(&PathBuf::from("."))
        .join("logs")
        .join("openclaw.log");

    if !log_path.exists() {
        return Ok(vec!["暂无日志".to_string()]);
    }

    let content = fs::read_to_string(&log_path)
        .map_err(|e| format!("读取日志失败: {}", e))?;

    let logs: Vec<String> = content
        .lines()
        .rev()
        .take(lines)
        .map(|s| s.to_string())
        .collect();

    Ok(logs)
}

// 执行 OpenClaw 命令
#[tauri::command]
fn run_openclaw_command(args: Vec<String>) -> Result<String, String> {
    let output = Command::new("openclaw")
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            detect_system,
            get_gateway_status,
            start_gateway,
            stop_gateway,
            restart_gateway,
            get_config,
            save_config,
            get_logs,
            run_openclaw_command,
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
