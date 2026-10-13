use reqwest::header::{ACCEPT, AUTHORIZATION, USER_AGENT};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::io::{Read, Write};
use std::net::{SocketAddr, TcpListener, TcpStream};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tauri::{command, AppHandle, Emitter, State};

const CREDENTIAL_TARGET: &str = "Edge Ghosty/Google Workspace";
const GOOGLE_SCOPES: &str = "openid email profile https://www.googleapis.com/auth/gmail.modify https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/tasks";
const USER_AGENT_VALUE: &str = "Edge-Ghosty";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GoogleToken {
    client_id: String,
    access_token: String,
    refresh_token: String,
    expires_at: u64,
    email: String,
}

#[derive(Debug, Clone)]
struct GoogleAuthPending {
    state: String,
    client_id: String,
    code_verifier: String,
    redirect_uri: String,
    code: Option<String>,
    error: Option<String>,
    exchange_in_progress: bool,
    expires_at: Instant,
}

#[derive(Default)]
pub struct GoogleWorkspaceState {
    pending: Arc<Mutex<Option<GoogleAuthPending>>>,
    snapshot: Mutex<Option<GoogleSnapshot>>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GoogleEmailMessage {
    pub id: String,
    pub thread_id: String,
    pub subject: String,
    pub sender: String,
    pub received_at: u64,
    pub web_url: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GoogleCalendarEvent {
    pub id: String,
    pub title: String,
    pub starts_at: String,
    pub ends_at: Option<String>,
    pub all_day: bool,
    pub location: Option<String>,
    pub web_url: Option<String>,
    pub join_url: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GoogleTask {
    pub id: String,
    pub list_id: String,
    pub list_title: String,
    pub title: String,
    pub due_at: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GoogleSnapshot {
    pub email: String,
    pub checked_at: u64,
    pub unread_count: u64,
    pub messages: Vec<GoogleEmailMessage>,
    pub events: Vec<GoogleCalendarEvent>,
    pub tasks: Vec<GoogleTask>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GoogleAccountStatus {
    pub connected: bool,
    pub email: Option<String>,
    pub configured: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GoogleAuthProgress {
    pub status: String,
    pub email: Option<String>,
    pub message: Option<String>,
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

fn now_secs() -> u64 {
    now_ms() / 1000
}

fn client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(18))
        .user_agent(USER_AGENT_VALUE)
        .build()
        .map_err(|error| format!("Não consegui preparar a conexão com o Google: {error}"))
}

fn validate_client_id(client_id: &str) -> Result<(), String> {
    let value = client_id.trim();
    if value.len() < 20
        || value.len() > 180
        || !value.bytes().all(|byte| {
            byte.is_ascii_alphanumeric()
                || matches!(byte, b'-' | b'_' | b'.')
        })
        || !value.ends_with(".apps.googleusercontent.com")
    {
        return Err("Informe um Client ID de aplicativo OAuth para computador do Google.".to_string());
    }
    Ok(())
}

fn configured_client_id() -> Result<&'static str, String> {
    let value = option_env!("EDGE_GHOSTY_GOOGLE_CLIENT_ID").unwrap_or_default().trim();
    if value.is_empty() {
        return Err("A conexão Google ainda não está configurada nesta versão do Edge Ghosty.".to_string());
    }
    validate_client_id(value)?;
    Ok(value)
}

fn configured_client_secret() -> Option<&'static str> {
    option_env!("EDGE_GHOSTY_GOOGLE_CLIENT_SECRET")
        .map(str::trim)
        .filter(|value| !value.is_empty())
}

fn validate_random(value: &str, min: usize, max: usize) -> bool {
    value.len() >= min
        && value.len() <= max
        && value.bytes().all(|byte| {
            byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'.' | b'_' | b'~')
        })
}

fn constant_time_eq(left: &str, right: &str) -> bool {
    if left.len() != right.len() {
        return false;
    }
    left.bytes()
        .zip(right.bytes())
        .fold(0u8, |difference, (a, b)| difference | (a ^ b))
        == 0
}

fn auth_html(success: bool) -> &'static [u8] {
    if success {
        br#"<!doctype html><meta charset="utf-8"><title>Ghosty conectado</title><body style="font:16px Segoe UI,Arial;background:#101114;color:#eee;display:grid;place-items:center;height:90vh"><main><h2>Conta conectada</h2><p>Volte ao Edge Ghosty para continuar.</p></main></body>"#
    } else {
        br#"<!doctype html><meta charset="utf-8"><title>Login do Ghosty</title><body style="font:16px Segoe UI,Arial;background:#101114;color:#eee;display:grid;place-items:center;height:90vh"><main><h2>N&#227;o foi poss&#237;vel concluir</h2><p>Volte ao Edge Ghosty e tente novamente.</p></main></body>"#
    }
}

fn reply_to_browser(stream: &mut TcpStream, success: bool) {
    let body = auth_html(success);
    let response = format!(
        "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nCache-Control: no-store\r\nConnection: close\r\n\r\n",
        body.len()
    );
    let _ = stream.write_all(response.as_bytes());
    let _ = stream.write_all(body);
    let _ = stream.flush();
}

fn set_callback_result(
    pending_state: &Arc<Mutex<Option<GoogleAuthPending>>>,
    expected_state: &str,
    code: Option<String>,
    error: Option<String>,
) {
    if let Ok(mut slot) = pending_state.lock() {
        if let Some(pending) = slot.as_mut() {
            if constant_time_eq(&pending.state, expected_state) {
                pending.code = code;
                pending.error = error;
            }
        }
    }
}

fn listen_for_callback(listener: TcpListener, pending_state: Arc<Mutex<Option<GoogleAuthPending>>>, state: String) {
    let deadline = Instant::now() + Duration::from_secs(300);
    while Instant::now() < deadline {
        let still_pending = pending_state
            .lock()
            .ok()
            .and_then(|slot| slot.as_ref().map(|pending| constant_time_eq(&pending.state, &state)))
            .unwrap_or(false);
        if !still_pending {
            return;
        }
        match listener.accept() {
            Ok((mut stream, address)) => {
                let is_loopback = address.ip().is_loopback();
                let _ = stream.set_read_timeout(Some(Duration::from_secs(5)));
                let mut buffer = [0u8; 8192];
                let read = stream.read(&mut buffer).unwrap_or(0);
                let request = String::from_utf8_lossy(&buffer[..read]);
                let path = request
                    .lines()
                    .next()
                    .and_then(|line| line.split_whitespace().nth(1))
                    .unwrap_or("/");
                let callback_url = reqwest::Url::parse(&format!("http://127.0.0.1{path}"));
                let parsed = callback_url.ok();
                let returned_state = parsed
                    .as_ref()
                    .and_then(|url| url.query_pairs().find(|(key, _)| key == "state").map(|(_, value)| value.into_owned()));
                let code = parsed
                    .as_ref()
                    .and_then(|url| url.query_pairs().find(|(key, _)| key == "code").map(|(_, value)| value.into_owned()));
                let error = parsed
                    .as_ref()
                    .and_then(|url| url.query_pairs().find(|(key, _)| key == "error").map(|(_, value)| value.into_owned()));
                let valid = is_loopback
                    && (path == "/" || path.starts_with("/?"))
                    && returned_state.as_deref().is_some_and(|value| constant_time_eq(value, &state));
                if valid {
                    if let Some(error) = error {
                        let message = if error == "access_denied" {
                            "O acesso foi cancelado na tela do Google.".to_string()
                        } else {
                            format!("O Google não concluiu o login ({})", error.chars().take(80).collect::<String>())
                        };
                        set_callback_result(&pending_state, &state, None, Some(message));
                        reply_to_browser(&mut stream, false);
                    } else if let Some(code) = code.filter(|value| !value.is_empty() && value.len() <= 4096) {
                        set_callback_result(&pending_state, &state, Some(code), None);
                        reply_to_browser(&mut stream, true);
                    } else {
                        set_callback_result(&pending_state, &state, None, Some("O Google retornou um código de login vazio.".to_string()));
                        reply_to_browser(&mut stream, false);
                    }
                } else {
                    reply_to_browser(&mut stream, false);
                    continue;
                }
                return;
            }
            Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                thread::sleep(Duration::from_millis(80));
            }
            Err(error) => {
                set_callback_result(
                    &pending_state,
                    &state,
                    None,
                    Some(format!("O retorno do navegador falhou: {error}")),
                );
                return;
            }
        }
    }
    set_callback_result(
        &pending_state,
        &state,
        None,
        Some("O login expirou. Tente conectar a conta novamente.".to_string()),
    );
}

fn saved_token() -> Result<Option<GoogleToken>, String> {
    let Some(value) = crate::credentials::read(CREDENTIAL_TARGET)? else {
        return Ok(None);
    };
    serde_json::from_str(&value)
        .map(Some)
        .map_err(|_| "A conexão salva com o Google está corrompida. Desconecte e conecte novamente.".to_string())
}

fn write_token(token: &GoogleToken) -> Result<(), String> {
    let value = serde_json::to_string(token)
        .map_err(|error| format!("Não consegui preparar a credencial do Google: {error}"))?;
    crate::credentials::write(CREDENTIAL_TARGET, &value)
}

fn callback_error(response: &Value, fallback: &str) -> String {
    response
        .get("error_description")
        .and_then(Value::as_str)
        .or_else(|| response.get("error").and_then(Value::as_str))
        .map(|message| format!("{fallback}: {}", message.chars().take(220).collect::<String>()))
        .unwrap_or_else(|| fallback.to_string())
}

async fn exchange_google_code(pending: &GoogleAuthPending, code: &str) -> Result<GoogleToken, String> {
    let client = client()?;
    let mut form = vec![
        ("code", code),
        ("client_id", pending.client_id.as_str()),
        ("code_verifier", pending.code_verifier.as_str()),
        ("redirect_uri", pending.redirect_uri.as_str()),
        ("grant_type", "authorization_code"),
    ];
    if let Some(client_secret) = configured_client_secret() {
        form.push(("client_secret", client_secret));
    }
    let response = client
        .post("https://oauth2.googleapis.com/token")
        .form(&form)
        .send()
        .await
        .map_err(|error| format!("Não consegui concluir o login com o Google: {error}"))?;
    let status = response.status();
    let body = response
        .json::<Value>()
        .await
        .map_err(|error| format!("A resposta de login do Google não era válida: {error}"))?;
    if !status.is_success() {
        return Err(callback_error(&body, "O Google recusou o login"));
    }
    let access_token = body
        .get("access_token")
        .and_then(Value::as_str)
        .filter(|value| value.len() < 8192)
        .ok_or_else(|| "O Google não retornou um token de acesso.".to_string())?
        .to_string();
    let refresh_token = body
        .get("refresh_token")
        .and_then(Value::as_str)
        .filter(|value| value.len() < 8192)
        .map(str::to_string)
        .or_else(|| saved_token().ok().flatten().map(|token| token.refresh_token))
        .ok_or_else(|| "O Google não retornou um token de renovação. Revise o consentimento e tente novamente.".to_string())?;
    let expires_in = body.get("expires_in").and_then(Value::as_u64).unwrap_or(3600).clamp(60, 86400);
    let profile = client
        .get("https://openidconnect.googleapis.com/v1/userinfo")
        .bearer_auth(&access_token)
        .send()
        .await
        .map_err(|error| format!("Não consegui confirmar sua conta Google: {error}"))?;
    let profile_status = profile.status();
    let profile = profile
        .json::<Value>()
        .await
        .map_err(|error| format!("O perfil do Google não retornou uma resposta válida: {error}"))?;
    if !profile_status.is_success() {
        return Err(callback_error(&profile, "Não consegui confirmar a conta Google"));
    }
    let email = profile
        .get("email")
        .and_then(Value::as_str)
        .filter(|value| value.len() <= 254 && value.contains('@'))
        .ok_or_else(|| "O Google não retornou o endereço de e-mail da conta.".to_string())?
        .to_string();
    Ok(GoogleToken {
        client_id: pending.client_id.clone(),
        access_token,
        refresh_token,
        expires_at: now_secs().saturating_add(expires_in),
        email,
    })
}

#[command]
pub fn google_auth_begin(
    state_value: String,
    code_verifier: String,
    code_challenge: String,
    state: State<'_, GoogleWorkspaceState>,
) -> Result<String, String> {
    let client_id = configured_client_id()?;
    if !validate_random(&state_value, 32, 128)
        || !validate_random(&code_verifier, 43, 128)
        || !validate_random(&code_challenge, 43, 128)
    {
        return Err("Não consegui criar uma solicitação segura de login. Tente novamente.".to_string());
    }
    let listener = TcpListener::bind("127.0.0.1:0")
        .map_err(|error| format!("Não consegui abrir o retorno seguro do navegador: {error}"))?;
    listener
        .set_nonblocking(true)
        .map_err(|error| format!("Não consegui preparar o retorno do navegador: {error}"))?;
    let address: SocketAddr = listener
        .local_addr()
        .map_err(|error| format!("Não consegui reservar uma porta para o login: {error}"))?;
    let redirect_uri = format!("http://127.0.0.1:{}", address.port());
    let mut authorization = reqwest::Url::parse("https://accounts.google.com/o/oauth2/v2/auth")
        .map_err(|error| format!("Não consegui preparar o login do Google: {error}"))?;
    authorization.query_pairs_mut()
        .append_pair("client_id", client_id)
        .append_pair("redirect_uri", &redirect_uri)
        .append_pair("response_type", "code")
        .append_pair("scope", GOOGLE_SCOPES)
        .append_pair("access_type", "offline")
        .append_pair("include_granted_scopes", "true")
        .append_pair("prompt", "consent")
        .append_pair("state", &state_value)
        .append_pair("code_challenge", &code_challenge)
        .append_pair("code_challenge_method", "S256");

    let pending = GoogleAuthPending {
        state: state_value.clone(),
        client_id: client_id.to_string(),
        code_verifier,
        redirect_uri,
        code: None,
        error: None,
        exchange_in_progress: false,
        expires_at: Instant::now() + Duration::from_secs(300),
    };
    {
        let mut slot = state.pending.lock().map_err(|_| "O estado do login Google ficou indisponível.".to_string())?;
        *slot = Some(pending);
    }
    let pending_state = Arc::clone(&state.pending);
    thread::spawn(move || listen_for_callback(listener, pending_state, state_value));
    Ok(authorization.to_string())
}

#[command]
pub async fn google_auth_poll(
    app: AppHandle,
    state: State<'_, GoogleWorkspaceState>,
) -> Result<GoogleAuthProgress, String> {
    let pending = {
        let mut slot = state.pending.lock().map_err(|_| "O estado do login Google ficou indisponível.".to_string())?;
        let Some(pending) = slot.as_mut() else {
            return Ok(GoogleAuthProgress { status: "idle".to_string(), email: None, message: None });
        };
        if let Some(error) = pending.error.take() {
            *slot = None;
            return Ok(GoogleAuthProgress { status: "error".to_string(), email: None, message: Some(error) });
        }
        if pending.expires_at <= Instant::now() {
            *slot = None;
            return Ok(GoogleAuthProgress {
                status: "error".to_string(),
                email: None,
                message: Some("O login expirou. Tente conectar a conta novamente.".to_string()),
            });
        }
        let Some(_) = pending.code else {
            return Ok(GoogleAuthProgress { status: "waiting".to_string(), email: None, message: None });
        };
        if pending.exchange_in_progress {
            return Ok(GoogleAuthProgress { status: "waiting".to_string(), email: None, message: None });
        }
        pending.exchange_in_progress = true;
        pending.clone()
    };
    let code = pending.code.clone().unwrap_or_default();
    match exchange_google_code(&pending, &code).await {
        Ok(token) => {
            write_token(&token)?;
            *state.snapshot.lock().map_err(|_| "O cache do Google ficou indisponível.".to_string())? = None;
            if let Ok(mut slot) = state.pending.lock() { *slot = None; }
            let _ = app.emit("edge-ghosty-google-snapshot", Option::<GoogleSnapshot>::None);
            Ok(GoogleAuthProgress { status: "connected".to_string(), email: Some(token.email), message: None })
        }
        Err(error) => {
            if let Ok(mut slot) = state.pending.lock() { *slot = None; }
            Ok(GoogleAuthProgress { status: "error".to_string(), email: None, message: Some(error) })
        }
    }
}

#[command]
pub fn google_auth_cancel(state: State<'_, GoogleWorkspaceState>) {
    if let Ok(mut slot) = state.pending.lock() {
        *slot = None;
    }
}

#[command]
pub fn google_account_status() -> Result<GoogleAccountStatus, String> {
    let token = saved_token()?;
    Ok(GoogleAccountStatus {
        connected: token.is_some(),
        email: token.map(|value| value.email),
        configured: configured_client_id().is_ok(),
    })
}

#[command]
pub fn google_clear_account(
    app: AppHandle,
    state: State<'_, GoogleWorkspaceState>,
) -> Result<(), String> {
    crate::credentials::delete(CREDENTIAL_TARGET)?;
    *state.snapshot.lock().map_err(|_| "O cache do Google ficou indisponível.".to_string())? = None;
    if let Ok(mut pending) = state.pending.lock() { *pending = None; }
    let _ = app.emit("edge-ghosty-google-snapshot", Option::<GoogleSnapshot>::None);
    Ok(())
}

#[command]
pub fn google_cached_snapshot(state: State<'_, GoogleWorkspaceState>) -> Option<GoogleSnapshot> {
    state.snapshot.lock().ok()?.clone()
}

async fn refresh_token_if_needed(token: &mut GoogleToken) -> Result<(), String> {
    if token.expires_at > now_secs().saturating_add(90) {
        return Ok(());
    }
    let client = client()?;
    let mut form = vec![
        ("client_id", token.client_id.as_str()),
        ("refresh_token", token.refresh_token.as_str()),
        ("grant_type", "refresh_token"),
    ];
    if let Some(client_secret) = configured_client_secret() {
        form.push(("client_secret", client_secret));
    }
    let response = client
        .post("https://oauth2.googleapis.com/token")
        .form(&form)
        .send()
        .await
        .map_err(|error| format!("Não consegui renovar o acesso ao Google: {error}"))?;
    let status = response.status();
    let body = response
        .json::<Value>()
        .await
        .map_err(|error| format!("A renovação da conta Google retornou dados inválidos: {error}"))?;
    if !status.is_success() {
        return Err(callback_error(&body, "O acesso ao Google expirou. Conecte a conta novamente"));
    }
    let access_token = body
        .get("access_token")
        .and_then(Value::as_str)
        .filter(|value| value.len() < 8192)
        .ok_or_else(|| "O Google não retornou um token renovado.".to_string())?;
    token.access_token = access_token.to_string();
    token.expires_at = now_secs().saturating_add(body.get("expires_in").and_then(Value::as_u64).unwrap_or(3600).clamp(60, 86400));
    if let Some(refresh_token) = body.get("refresh_token").and_then(Value::as_str).filter(|value| value.len() < 8192) {
        token.refresh_token = refresh_token.to_string();
    }
    write_token(token)
}

async fn api_get(client: &reqwest::Client, token: &str, url: &str) -> Result<Value, String> {
    let response = client
        .get(url)
        .header(USER_AGENT, USER_AGENT_VALUE)
        .header(ACCEPT, "application/json")
        .header(AUTHORIZATION, format!("Bearer {token}"))
        .send()
        .await
        .map_err(|error| format!("A consulta ao Google falhou: {error}"))?;
    let status = response.status();
    let body = response
        .json::<Value>()
        .await
        .map_err(|error| format!("O Google retornou uma resposta inválida: {error}"))?;
    if !status.is_success() {
        return Err(match status.as_u16() {
            401 => "O Google recusou o acesso salvo. Conecte a conta novamente.".to_string(),
            403 => callback_error(&body, "A conta não autorizou este painel"),
            429 => "O Google limitou temporariamente estas consultas. Tente novamente em instantes.".to_string(),
            code => format!("O Google respondeu com HTTP {code}."),
        });
    }
    Ok(body)
}

async fn api_write(
    client: &reqwest::Client,
    token: &str,
    method: reqwest::Method,
    url: &str,
    body: Option<Value>,
) -> Result<Value, String> {
    let mut request = client
        .request(method, url)
        .header(USER_AGENT, USER_AGENT_VALUE)
        .header(ACCEPT, "application/json")
        .bearer_auth(token);
    if let Some(body) = body {
        request = request.json(&body);
    }
    let response = request
        .send()
        .await
        .map_err(|error| format!("A ação no Google falhou: {error}"))?;
    let status = response.status();
    let text = response
        .text()
        .await
        .map_err(|error| format!("O Google não retornou o resultado da ação: {error}"))?;
    let body = if text.is_empty() { Value::Null } else { serde_json::from_str::<Value>(&text).unwrap_or(Value::Null) };
    if !status.is_success() {
        return Err(match status.as_u16() {
            401 => "O Google recusou o acesso salvo. Conecte a conta novamente.".to_string(),
            403 => callback_error(&body, "A conta não autorizou esta ação"),
            404 => "Este item já não existe na conta Google.".to_string(),
            429 => "O Google limitou temporariamente esta ação. Tente novamente.".to_string(),
            code => format!("O Google respondeu com HTTP {code}."),
        });
    }
    Ok(body)
}

fn value_text(value: &Value, key: &str, limit: usize) -> Option<String> {
    value
        .get(key)
        .and_then(Value::as_str)
        .map(|text| text.chars().take(limit).collect::<String>())
        .filter(|text| !text.trim().is_empty())
}

fn safe_google_id(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 200
        && value.bytes().all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.'))
}

fn google_path_segment(value: &str) -> String {
    let mut encoded = String::with_capacity(value.len());
    for byte in value.bytes() {
        if byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.' | b'~') {
            encoded.push(byte as char);
        } else {
            encoded.push_str(&format!("%{byte:02X}"));
        }
    }
    encoded
}

fn date_time_from_unix(seconds: u64) -> String {
    let days = (seconds / 86400) as i64;
    let seconds_in_day = seconds % 86400;
    let z = days + 719468;
    let era = if z >= 0 { z } else { z - 146096 } / 146097;
    let day_of_era = z - era * 146097;
    let year_of_era = (day_of_era - day_of_era / 1460 + day_of_era / 36524 - day_of_era / 146096) / 365;
    let mut year = year_of_era + era * 400;
    let day_of_year = day_of_era - (365 * year_of_era + year_of_era / 4 - year_of_era / 100);
    let month_prime = (5 * day_of_year + 2) / 153;
    let day = day_of_year - (153 * month_prime + 2) / 5 + 1;
    let month = month_prime + if month_prime < 10 { 3 } else { -9 };
    year += if month <= 2 { 1 } else { 0 };
    let hour = seconds_in_day / 3600;
    let minute = (seconds_in_day % 3600) / 60;
    let second = seconds_in_day % 60;
    format!("{year:04}-{month:02}-{day:02}T{hour:02}:{minute:02}:{second:02}Z")
}

fn email_header(message: &Value, name: &str) -> Option<String> {
    message
        .get("payload")?
        .get("headers")?
        .as_array()?
        .iter()
        .find(|header| header.get("name").and_then(Value::as_str).is_some_and(|value| value.eq_ignore_ascii_case(name)))
        .and_then(|header| header.get("value").and_then(Value::as_str))
        .map(|value| value.chars().take(240).collect())
}

async fn fetch_mail(client: &reqwest::Client, token: &str) -> Result<(u64, Vec<GoogleEmailMessage>), String> {
    let mut list_url = reqwest::Url::parse("https://gmail.googleapis.com/gmail/v1/users/me/messages")
        .map_err(|error| error.to_string())?;
    list_url.query_pairs_mut()
        .append_pair("q", "in:inbox is:unread")
        .append_pair("maxResults", "8");
    let list = api_get(client, token, list_url.as_str()).await?;
    let unread_count = list.get("resultSizeEstimate").and_then(Value::as_u64).unwrap_or(0);
    let ids = list.get("messages").and_then(Value::as_array).cloned().unwrap_or_default();
    let mut messages = Vec::new();
    for item in ids.iter().take(6) {
        let Some(id) = value_text(item, "id", 200).filter(|value| safe_google_id(value)) else { continue; };
        let thread_id = value_text(item, "threadId", 200).filter(|value| safe_google_id(value)).unwrap_or_else(|| id.clone());
        let url = format!(
            "https://gmail.googleapis.com/gmail/v1/users/me/messages/{}?format=metadata&metadataHeaders=From&metadataHeaders=Subject",
            google_path_segment(&id)
        );
        let detail = api_get(client, token, &url).await?;
        let subject = email_header(&detail, "Subject").unwrap_or_else(|| "Sem assunto".to_string());
        let sender = email_header(&detail, "From").unwrap_or_else(|| "Remetente desconhecido".to_string());
        let received_at = detail
            .get("internalDate")
            .and_then(Value::as_str)
            .and_then(|value| value.parse::<u64>().ok())
            .unwrap_or_else(now_ms);
        messages.push(GoogleEmailMessage {
            id,
            web_url: format!("https://mail.google.com/mail/u/0/#all/{thread_id}"),
            thread_id,
            subject,
            sender,
            received_at,
        });
    }
    Ok((unread_count, messages))
}

async fn fetch_calendar(client: &reqwest::Client, token: &str) -> Result<Vec<GoogleCalendarEvent>, String> {
    let now = now_secs();
    let mut url = reqwest::Url::parse("https://www.googleapis.com/calendar/v3/calendars/primary/events")
        .map_err(|error| error.to_string())?;
    url.query_pairs_mut()
        .append_pair("timeMin", &date_time_from_unix(now))
        .append_pair("timeMax", &date_time_from_unix(now.saturating_add(14 * 86400)))
        .append_pair("singleEvents", "true")
        .append_pair("orderBy", "startTime")
        .append_pair("maxResults", "18");
    let response = api_get(client, token, url.as_str()).await?;
    let events = response.get("items").and_then(Value::as_array).cloned().unwrap_or_default();
    Ok(events
        .iter()
        .filter_map(|event| {
            let id = value_text(event, "id", 200)?;
            let start = event.get("start")?;
            let starts_at = value_text(start, "dateTime", 48).or_else(|| value_text(start, "date", 20))?;
            let ends_at = value_text(event.get("end")?, "dateTime", 48).or_else(|| value_text(event.get("end")?, "date", 20));
            let conference = event.get("conferenceData").and_then(|value| value.get("entryPoints")).and_then(Value::as_array);
            let join_url = value_text(event, "hangoutLink", 500).or_else(|| conference
                .into_iter()
                .flatten()
                .find(|entry| entry.get("entryPointType").and_then(Value::as_str) == Some("video"))
                .and_then(|entry| value_text(entry, "uri", 500)));
            Some(GoogleCalendarEvent {
                id,
                title: value_text(event, "summary", 180).unwrap_or_else(|| "Compromisso".to_string()),
                all_day: start.get("date").and_then(Value::as_str).is_some(),
                starts_at,
                ends_at,
                location: value_text(event, "location", 180),
                web_url: value_text(event, "htmlLink", 500),
                join_url,
            })
        })
        .take(12)
        .collect())
}

async fn fetch_tasks(client: &reqwest::Client, token: &str) -> Result<Vec<GoogleTask>, String> {
    let list_url = "https://tasks.googleapis.com/tasks/v1/users/@me/lists?maxResults=20";
    let list_response = api_get(client, token, list_url).await?;
    let lists = list_response.get("items").and_then(Value::as_array).cloned().unwrap_or_default();
    let mut tasks = Vec::new();
    for list in lists.iter().take(8) {
        let Some(list_id) = value_text(list, "id", 200).filter(|value| safe_google_id(value)) else { continue; };
        let list_title = value_text(list, "title", 120).unwrap_or_else(|| "Tarefas".to_string());
        let url = format!(
            "https://tasks.googleapis.com/tasks/v1/lists/{}/tasks?maxResults=50&showCompleted=false&showHidden=false",
            google_path_segment(&list_id)
        );
        let response = api_get(client, token, &url).await?;
        let items = response.get("items").and_then(Value::as_array).cloned().unwrap_or_default();
        for item in items {
            let Some(id) = value_text(&item, "id", 200).filter(|value| safe_google_id(value)) else { continue; };
            let title = value_text(&item, "title", 180).unwrap_or_else(|| "Tarefa sem título".to_string());
            tasks.push(GoogleTask {
                id,
                list_id: list_id.clone(),
                list_title: list_title.clone(),
                title,
                due_at: value_text(&item, "due", 48),
            });
        }
    }
    tasks.sort_by(|left, right| left.due_at.as_deref().unwrap_or("9999").cmp(right.due_at.as_deref().unwrap_or("9999")));
    tasks.truncate(30);
    Ok(tasks)
}

async fn get_live_token() -> Result<GoogleToken, String> {
    let mut token = saved_token()?.ok_or_else(|| "Conecte sua conta Google nas Configurações → Painéis.".to_string())?;
    refresh_token_if_needed(&mut token).await?;
    Ok(token)
}

#[command]
pub async fn google_refresh(
    app: AppHandle,
    state: State<'_, GoogleWorkspaceState>,
    pause: State<'_, crate::tray::AppPauseState>,
) -> Result<GoogleSnapshot, String> {
    if pause.is_paused() {
        return Err("As atualizações estão pausadas pela bandeja do sistema.".to_string());
    }
    let token = get_live_token().await?;
    let client = client()?;
    let (unread_count, messages) = fetch_mail(&client, &token.access_token).await?;
    let events = fetch_calendar(&client, &token.access_token).await?;
    let tasks = fetch_tasks(&client, &token.access_token).await?;
    if pause.is_paused() {
        return Err("As atualizações foram pausadas durante a consulta.".to_string());
    }
    let Some(saved) = saved_token()? else {
        return Err("A conta Google foi desconectada durante a consulta.".to_string());
    };
    if saved.refresh_token != token.refresh_token || saved.client_id != token.client_id || saved.email != token.email {
        return Err("A conta Google mudou durante a consulta. Atualize o painel.".to_string());
    }
    let snapshot = GoogleSnapshot {
        email: token.email.clone(),
        checked_at: now_ms(),
        unread_count,
        messages,
        events,
        tasks,
    };
    *state.snapshot.lock().map_err(|_| "O cache do Google ficou indisponível.".to_string())? = Some(snapshot.clone());
    let _ = app.emit("edge-ghosty-google-snapshot", Some(snapshot.clone()));
    Ok(snapshot)
}

#[command]
pub async fn google_mark_message(
    message_id: String,
    action: String,
) -> Result<(), String> {
    if !safe_google_id(&message_id) || (action != "read" && action != "archive") {
        return Err("A mensagem ou a ação não é válida.".to_string());
    }
    let token = get_live_token().await?;
    let client = client()?;
    let label = if action == "read" { "UNREAD" } else { "INBOX" };
    let url = format!(
        "https://gmail.googleapis.com/gmail/v1/users/me/messages/{}/modify",
        google_path_segment(&message_id)
    );
    api_write(
        &client,
        &token.access_token,
        reqwest::Method::POST,
        &url,
        Some(json!({ "removeLabelIds": [label] })),
    )
    .await?;
    Ok(())
}

#[command]
pub async fn google_complete_task(list_id: String, task_id: String) -> Result<(), String> {
    if !safe_google_id(&list_id) || !safe_google_id(&task_id) {
        return Err("A tarefa selecionada não é válida.".to_string());
    }
    let token = get_live_token().await?;
    let client = client()?;
    let url = format!(
        "https://tasks.googleapis.com/tasks/v1/lists/{}/tasks/{}",
        google_path_segment(&list_id),
        google_path_segment(&task_id)
    );
    api_write(
        &client,
        &token.access_token,
        reqwest::Method::PATCH,
        &url,
        Some(json!({ "status": "completed" })),
    )
    .await?;
    Ok(())
}

#[command]
pub async fn google_add_task(title: String) -> Result<GoogleTask, String> {
    let title = title.trim();
    if title.is_empty() || title.chars().count() > 180 {
        return Err("Escreva uma tarefa de até 180 caracteres.".to_string());
    }
    let token = get_live_token().await?;
    let client = client()?;
    let lists = api_get(&client, &token.access_token, "https://tasks.googleapis.com/tasks/v1/users/@me/lists?maxResults=20").await?;
    let first_list = lists
        .get("items")
        .and_then(Value::as_array)
        .and_then(|items| items.first())
        .ok_or_else(|| "Crie uma lista no Google Tarefas antes de adicionar itens.".to_string())?;
    let list_id = value_text(first_list, "id", 200)
        .filter(|value| safe_google_id(value))
        .ok_or_else(|| "Crie uma lista no Google Tarefas antes de adicionar itens.".to_string())?;
    let list_title = value_text(first_list, "title", 120).unwrap_or_else(|| "Tarefas".to_string());
    let url = format!(
        "https://tasks.googleapis.com/tasks/v1/lists/{}/tasks",
        google_path_segment(&list_id)
    );
    let created = api_write(
        &client,
        &token.access_token,
        reqwest::Method::POST,
        &url,
        Some(json!({ "title": title })),
    )
    .await?;
    let id = value_text(&created, "id", 200)
        .filter(|value| safe_google_id(value))
        .ok_or_else(|| "A tarefa foi criada, mas o Google não retornou o identificador.".to_string())?;
    Ok(GoogleTask {
        id,
        list_id,
        list_title,
        title: value_text(&created, "title", 180).unwrap_or_else(|| title.to_string()),
        due_at: value_text(&created, "due", 48),
    })
}
