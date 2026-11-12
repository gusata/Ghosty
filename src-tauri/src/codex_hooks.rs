use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};
use std::collections::BTreeSet;
use std::env;
use std::fs;
use std::fs::OpenOptions;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager};

const GHOSTY_HOOK_NAME: &str = "edge-ghosty-codex-hook.ps1";
const LEGACY_HOOK_NAME: &str = "edge-mochi-codex-hook.ps1";
const HOOK_EVENTS: &[&str] = &[
    "SessionStart",
    "UserPromptSubmit",
    "PreToolUse",
    "PermissionRequest",
    "PostToolUse",
    "SubagentStart",
    "SubagentStop",
    "Stop",
    "Interrupt",
    "SessionEnd",
];

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CodexHookEvent {
    pub event_name: String,
    pub occurred_at: u64,
    pub tool_name: Option<String>,
    pub agent_type: Option<String>,
    #[serde(default)]
    pub session_id: Option<String>,
    #[serde(default)]
    pub approval_id: Option<String>,
    #[serde(default)]
    pub approval_description: Option<String>,
    #[serde(default)]
    pub approval_expires_at: Option<u64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CodexHookReviewState {
    pub enabled: bool,
    pub needs_review: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CodexHookEventChange {
    pub event_name: String,
    pub before: Vec<Value>,
    pub after: Vec<Value>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CodexHookPreview {
    pub enabled: bool,
    pub config_path: String,
    pub fingerprint: String,
    pub config_changed: bool,
    pub backup_will_be_created: bool,
    pub changes: Vec<CodexHookEventChange>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CodexHookChangeResult {
    pub enabled: bool,
    pub backup_path: Option<String>,
}

struct BridgePaths {
    config: PathBuf,
    directory: PathBuf,
    disabled: PathBuf,
    script: PathBuf,
    events: PathBuf,
    responses: PathBuf,
    heartbeat: PathBuf,
}

fn bridge_paths(app: &AppHandle) -> Result<BridgePaths, String> {
    let app_directory = app
        .path()
        .app_local_data_dir()
        .map_err(|error| format!("diretório local do Ghosty: {error}"))?;
    let codex_home = env::var_os("CODEX_HOME")
        .map(PathBuf::from)
        .or_else(|| env::var_os("USERPROFILE").map(|profile| PathBuf::from(profile).join(".codex")))
        .ok_or_else(|| "não encontrei a pasta de configuração do Codex neste usuário".to_string())?;

    let directory = app_directory.join("codex");
    Ok(BridgePaths {
        config: codex_home.join("hooks.json"),
        script: directory.join(GHOSTY_HOOK_NAME),
        disabled: directory.join("disabled.flag"),
        events: directory.join("events"),
        responses: directory.join("responses"),
        heartbeat: directory.join("ui-heartbeat"),
        directory,
    })
}

fn parse_config(contents: &[u8]) -> Result<Value, String> {
    let config: Value = serde_json::from_slice(contents)
        .map_err(|error| format!("hooks.json do Codex não contém JSON válido: {error}"))?;
    let object = config
        .as_object()
        .ok_or_else(|| "hooks.json do Codex precisa conter um objeto JSON".to_string())?;
    if object.get("hooks").is_some_and(|hooks| !hooks.is_object()) {
        return Err("a propriedade hooks do hooks.json do Codex precisa ser um objeto".to_string());
    }
    Ok(config)
}

fn load_config(path: &Path) -> Result<(Value, bool), String> {
    match fs::read(path) {
        Ok(contents) => Ok((parse_config(&contents)?, true)),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok((json!({}), false)),
        Err(error) => Err(format!("não consegui ler hooks.json do Codex: {error}")),
    }
}

fn fingerprint(contents: Option<&[u8]>) -> String {
    let Some(contents) = contents else { return "missing".to_string() };
    let mut hash = 0xcbf29ce484222325_u64;
    for byte in contents {
        hash ^= u64::from(*byte);
        hash = hash.wrapping_mul(0x100000001b3);
    }
    format!("fnv1a64-{hash:016x}")
}

fn read_config_snapshot(path: &Path) -> Result<(Vec<u8>, bool), String> {
    match fs::read(path) {
        Ok(contents) => Ok((contents, true)),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok((Vec::new(), false)),
        Err(error) => Err(format!("não consegui ler hooks.json do Codex: {error}")),
    }
}

fn ghosty_groups_for_event(config: &Value, event_name: &str) -> Vec<Value> {
    config
        .get("hooks")
        .and_then(|hooks| hooks.get(event_name))
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|group| {
            let handlers = group.get("hooks")?.as_array()?;
            let ghosty_handlers = handlers
                .iter()
                .filter(|handler| is_ghosty_handler(handler))
                .cloned()
                .collect::<Vec<_>>();
            if ghosty_handlers.is_empty() { return None; }
            let mut visible_group = group.clone();
            visible_group["hooks"] = json!(ghosty_handlers);
            Some(visible_group)
        })
        .collect()
}

fn event_changes(before: &Value, after: &Value) -> Vec<CodexHookEventChange> {
    let mut event_names = BTreeSet::new();
    event_names.extend(HOOK_EVENTS.iter().map(|name| (*name).to_string()));
    for config in [before, after] {
        if let Some(hooks) = config.get("hooks").and_then(Value::as_object) {
            event_names.extend(hooks.keys().cloned());
        }
    }
    event_names
        .into_iter()
        .filter_map(|event_name| {
            let old = ghosty_groups_for_event(before, &event_name);
            let new = ghosty_groups_for_event(after, &event_name);
            (old != new).then(|| CodexHookEventChange {
                event_name,
                before: old,
                after: new,
            })
        })
        .collect()
}

fn desired_config(
    paths: &BridgePaths,
    mut config: Value,
    enabled: bool,
) -> Result<Value, String> {
    remove_ghosty_groups(&mut config)?;
    if enabled {
        let command = hook_command(&paths.script, &paths.events);
        add_ghosty_groups(&mut config, &command)?;
    }
    Ok(config)
}

fn save_backup(path: &Path, contents: &[u8]) -> Result<PathBuf, String> {
    let parent = path
        .parent()
        .ok_or_else(|| "não encontrei a pasta de configuração do Codex".to_string())?;
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    for attempt in 0..20_u8 {
        let suffix = if attempt == 0 { String::new() } else { format!("-{attempt}") };
        let backup = parent.join(format!("hooks.json.edge-ghosty-{timestamp}{suffix}.bak"));
        match OpenOptions::new().write(true).create_new(true).open(&backup) {
            Ok(mut file) => {
                if let Err(error) = file.write_all(contents).and_then(|_| file.sync_all()) {
                    let _ = fs::remove_file(&backup);
                    return Err(format!("não consegui criar o backup do hooks.json: {error}"));
                }
                return Ok(backup);
            }
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(error) => return Err(format!("não consegui criar o backup do hooks.json: {error}")),
        }
    }
    Err("não consegui reservar um nome único para o backup do hooks.json".to_string())
}

fn is_ghosty_handler(handler: &Value) -> bool {
    ["command", "commandWindows"].iter().any(|key| {
        handler
            .get(key)
            .and_then(Value::as_str)
            .is_some_and(|command| {
                let normalized = command.to_ascii_lowercase();
                normalized.contains(GHOSTY_HOOK_NAME) || normalized.contains(LEGACY_HOOK_NAME)
            })
    })
}

fn is_ghosty_group(group: &Value) -> bool {
    group
        .get("hooks")
        .and_then(Value::as_array)
        .is_some_and(|handlers| handlers.iter().any(is_ghosty_handler))
}

fn has_ghosty_group(config: &Value) -> bool {
    config
        .get("hooks")
        .and_then(Value::as_object)
        .is_some_and(|hooks| {
            hooks
                .values()
                .filter_map(Value::as_array)
                .flatten()
                .any(is_ghosty_group)
        })
}

fn has_current_approval_hook(config: &Value) -> bool {
    config
        .get("hooks")
        .and_then(|hooks| hooks.get("PermissionRequest"))
        .and_then(Value::as_array)
        .is_some_and(|groups| {
            groups.iter().any(|group| {
                group
                    .get("hooks")
                    .and_then(Value::as_array)
                    .is_some_and(|handlers| {
                        handlers.iter().any(|handler| {
                            is_ghosty_handler(handler)
                                && handler.get("async").and_then(Value::as_bool) != Some(true)
                                && handler.get("timeout").and_then(Value::as_u64) == Some(600)
                        })
                    })
            })
        })
}

fn remove_ghosty_groups(config: &mut Value) -> Result<bool, String> {
    let mut removed = false;

    if let Some(hooks_value) = config.get_mut("hooks") {
        let hooks = hooks_value
            .as_object_mut()
            .ok_or_else(|| "a propriedade hooks do hooks.json do Codex precisa ser um objeto".to_string())?;
        for (event_name, groups_value) in hooks.iter_mut() {
            let groups = groups_value
                .as_array_mut()
                .ok_or_else(|| format!("a configuração hooks.{event_name} do Codex precisa ser uma lista"))?;
            let mut index = 0;
            while index < groups.len() {
                let handlers_empty = if let Some(handlers) = groups[index].get_mut("hooks").and_then(Value::as_array_mut) {
                    let old_length = handlers.len();
                    handlers.retain(|handler| !is_ghosty_handler(handler));
                    removed |= old_length != handlers.len();
                    handlers.is_empty()
                } else {
                    false
                };
                let remove_group = handlers_empty
                    && groups[index]
                        .as_object()
                        .is_some_and(|group| group.len() == 1 && group.contains_key("hooks"));
                if remove_group {
                    groups.remove(index);
                } else {
                    index += 1;
                }
            }
        }
    }
    Ok(removed)
}

fn write_config(path: &Path, config: &Value) -> Result<(), String> {
    let parent = path
        .parent()
        .ok_or_else(|| "não encontrei a pasta de configuração do Codex".to_string())?;
    fs::create_dir_all(parent).map_err(|error| format!("não consegui preparar a pasta do Codex: {error}"))?;
    let mut temporary = path.as_os_str().to_os_string();
    temporary.push(".edge-ghosty.tmp");
    let temporary = PathBuf::from(temporary);
    let contents = serde_json::to_vec_pretty(config)
        .map_err(|error| format!("não consegui montar hooks.json do Codex: {error}"))?;
    fs::write(&temporary, contents).map_err(|error| format!("não consegui salvar hooks.json do Codex: {error}"))?;
    if let Err(error) = fs::rename(&temporary, path) {
        let _ = fs::remove_file(&temporary);
        return Err(format!("não consegui atualizar hooks.json do Codex: {error}"));
    }
    Ok(())
}

fn hook_command(script: &Path, events: &Path) -> String {
    format!(
        "powershell.exe -NoLogo -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File \"{}\" -QueueDirectory \"{}\"",
        script.display(),
        events.display()
    )
}

fn add_ghosty_groups(config: &mut Value, command: &str) -> Result<(), String> {
    let root = config
        .as_object_mut()
        .ok_or_else(|| "hooks.json do Codex precisa conter um objeto JSON".to_string())?;
    let hooks = root
        .entry("hooks".to_string())
        .or_insert_with(|| Value::Object(Map::new()))
        .as_object_mut()
        .ok_or_else(|| "a propriedade hooks do hooks.json do Codex precisa ser um objeto".to_string())?;

    for event_name in HOOK_EVENTS {
        let groups = hooks
            .entry((*event_name).to_string())
            .or_insert_with(|| Value::Array(Vec::new()))
            .as_array_mut()
            .ok_or_else(|| format!("a configuração hooks.{event_name} do Codex precisa ser uma lista"))?;
        let mut handler = json!({
            "type": "command",
            "command": command,
            "commandWindows": command
        });
        if *event_name == "PermissionRequest" {
            handler["timeout"] = json!(600);
            handler["statusMessage"] = json!("Aguardando uma decisão no Ghosty");
        } else {
            handler["async"] = json!(true);
            handler["timeout"] = json!(3);
        }
        groups.push(json!({ "hooks": [handler] }));
    }
    Ok(())
}

#[tauri::command(async)]
pub fn codex_hooks_enabled(app: AppHandle) -> Result<bool, String> {
    let paths = bridge_paths(&app)?;
    if paths.disabled.exists() {
        return Ok(false);
    }
    let (config, exists) = load_config(&paths.config)?;
    if !exists {
        return Ok(false);
    }
    Ok(has_ghosty_group(&config))
}

#[tauri::command(async)]
pub fn codex_hooks_review_state(app: AppHandle) -> Result<CodexHookReviewState, String> {
    let paths = bridge_paths(&app)?;
    if paths.disabled.exists() {
        return Ok(CodexHookReviewState { enabled: false, needs_review: false });
    }
    let (config, exists) = load_config(&paths.config)?;
    if !exists || !has_ghosty_group(&config) {
        return Ok(CodexHookReviewState { enabled: false, needs_review: false });
    }

    let script_is_current = fs::read_to_string(&paths.script)
        .ok()
        .is_some_and(|script| script == include_str!("codex-hook.ps1"));
    let needs_review = !(has_current_approval_hook(&config) && script_is_current && paths.responses.exists());
    Ok(CodexHookReviewState { enabled: true, needs_review })
}

#[tauri::command(async)]
pub fn codex_hooks_preview(app: AppHandle, enabled: bool) -> Result<CodexHookPreview, String> {
    let paths = bridge_paths(&app)?;
    let (contents, exists) = read_config_snapshot(&paths.config)?;
    let current = if exists { parse_config(&contents)? } else { json!({}) };
    let desired = desired_config(&paths, current.clone(), enabled)?;
    Ok(CodexHookPreview {
        enabled,
        config_path: paths.config.display().to_string(),
        fingerprint: fingerprint(exists.then_some(contents.as_slice())),
        config_changed: current != desired,
        backup_will_be_created: exists && current != desired,
        changes: event_changes(&current, &desired),
    })
}

#[tauri::command(async)]
pub fn apply_codex_hooks_change(
    app: AppHandle,
    enabled: bool,
    expected_fingerprint: String,
) -> Result<CodexHookChangeResult, String> {
    let paths = bridge_paths(&app)?;
    let (contents, exists) = read_config_snapshot(&paths.config)?;
    if fingerprint(exists.then_some(contents.as_slice())) != expected_fingerprint {
        return Err("hooks.json mudou depois da revisão. Atualize a prévia e confira as diferenças novamente.".to_string());
    }
    let mut config = if exists { parse_config(&contents)? } else { json!({}) };
    let desired = desired_config(&paths, config.clone(), enabled)?;
    let config_changed = config != desired;
    let mut backup_path = None;

    if !enabled {
        if exists && config_changed {
            backup_path = Some(save_backup(&paths.config, &contents)?);
            // Detect edits made while the reviewed backup was being written.
            let (latest_contents, latest_exists) = read_config_snapshot(&paths.config)?;
            if !latest_exists || latest_contents != contents {
                return Err("hooks.json mudou durante a gravação do backup. Nenhuma alteração foi aplicada; revise novamente.".to_string());
            }
            write_config(&paths.config, &desired)?;
        }
        if paths.events.exists() {
            let _ = fs::remove_dir_all(&paths.events);
        }
        if paths.responses.exists() {
            let _ = fs::remove_dir_all(&paths.responses);
        }
        if paths.heartbeat.exists() {
            let _ = fs::remove_file(&paths.heartbeat);
        }
        fs::create_dir_all(&paths.directory).map_err(|error| format!("não consegui desativar o hook local do Codex: {error}"))?;
        fs::write(&paths.disabled, b"disabled\n")
            .map_err(|error| format!("não consegui desativar o hook local do Codex: {error}"))?;
        return Ok(CodexHookChangeResult {
            enabled: false,
            backup_path: backup_path.map(|path| path.display().to_string()),
        });
    }

    fs::create_dir_all(&paths.directory).map_err(|error| format!("não consegui preparar a integração com Codex: {error}"))?;
    fs::create_dir_all(&paths.events).map_err(|error| format!("não consegui preparar a fila de eventos do Codex: {error}"))?;
    fs::create_dir_all(&paths.responses)
        .map_err(|error| format!("não consegui preparar as respostas de aprovação do Codex: {error}"))?;
    fs::write(&paths.script, include_str!("codex-hook.ps1"))
        .map_err(|error| format!("não consegui instalar o hook local do Codex: {error}"))?;

    if config_changed {
        if exists {
            backup_path = Some(save_backup(&paths.config, &contents)?);
            let (latest_contents, latest_exists) = read_config_snapshot(&paths.config)?;
            if !latest_exists || latest_contents != contents {
                return Err("hooks.json mudou durante a gravação do backup. Nenhuma alteração foi aplicada; revise novamente.".to_string());
            }
        }
        write_config(&paths.config, &desired)?;
    }
    if paths.disabled.exists() {
        fs::remove_file(&paths.disabled)
            .map_err(|error| format!("não consegui reativar o hook local do Codex: {error}"))?;
    }
    Ok(CodexHookChangeResult {
        enabled: true,
        backup_path: backup_path.map(|path| path.display().to_string()),
    })
}

fn event_is_supported(event_name: &str) -> bool {
    HOOK_EVENTS.contains(&event_name)
}

fn unix_time_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or_default()
}

#[tauri::command(async)]
pub fn drain_codex_events(app: AppHandle) -> Result<Vec<CodexHookEvent>, String> {
    let paths = bridge_paths(&app)?;
    if paths.disabled.exists() || !paths.events.exists() {
        return Ok(Vec::new());
    }
    fs::write(&paths.heartbeat, unix_time_ms().to_string())
        .map_err(|error| format!("não consegui atualizar a presença local do Ghosty: {error}"))?;
    let mut files = fs::read_dir(&paths.events)
        .map_err(|error| format!("não consegui ler eventos locais do Codex: {error}"))?
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .filter(|path| path.extension().and_then(|extension| extension.to_str()) == Some("json"))
        .collect::<Vec<_>>();
    files.sort();

    let now = unix_time_ms();
    let oldest = now.saturating_sub(15_000);
    let oldest_approval = now.saturating_sub(570_000);
    let mut events = Vec::new();
    for path in files.into_iter().take(128) {
        let parsed = fs::read(&path)
            .ok()
            .and_then(|contents| serde_json::from_slice::<CodexHookEvent>(&contents).ok());
        let _ = fs::remove_file(path);
        if let Some(event) = parsed {
            let recent_enough = if event.event_name == "PermissionRequest" {
                event.occurred_at >= oldest_approval
                    && event.approval_expires_at.is_some_and(|expires_at| expires_at > now)
            } else {
                event.occurred_at >= oldest
            };
            if event_is_supported(&event.event_name)
                && recent_enough
                && event.occurred_at <= now.saturating_add(5_000)
            {
                events.push(event);
            }
        }
    }
    Ok(events)
}

#[tauri::command(async)]
pub fn resolve_codex_approval(
    app: AppHandle,
    request_id: String,
    decision: String,
) -> Result<(), String> {
    if request_id.len() != 32 || !request_id.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return Err("identificador de aprovação inválido".to_string());
    }
    if decision != "allow" && decision != "deny" {
        return Err("decisão de aprovação inválida".to_string());
    }

    let paths = bridge_paths(&app)?;
    if paths.disabled.exists() {
        return Err("a integração com Codex está desativada".to_string());
    }
    fs::create_dir_all(&paths.responses)
        .map_err(|error| format!("não consegui preparar a resposta da aprovação: {error}"))?;
    let response_path = paths.responses.join(format!("{}.json", request_id.to_ascii_lowercase()));
    if response_path.exists() {
        return Ok(());
    }
    let temporary_path = paths.responses.join(format!("{}.{}.tmp", request_id.to_ascii_lowercase(), unix_time_ms()));
    let contents = serde_json::to_vec(&json!({ "decision": decision }))
        .map_err(|error| format!("não consegui montar a resposta da aprovação: {error}"))?;
    fs::write(&temporary_path, contents)
        .map_err(|error| format!("não consegui salvar a resposta da aprovação: {error}"))?;
    if let Err(error) = fs::rename(&temporary_path, &response_path) {
        let _ = fs::remove_file(&temporary_path);
        if response_path.exists() {
            return Ok(());
        }
        return Err(format!("não consegui entregar a resposta ao Codex: {error}"));
    }
    Ok(())
}
