use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::command;

const USER_AGENT: &str = "Edge-Ghosty";

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WeatherLocation {
    pub id: Option<i64>,
    pub name: String,
    pub admin1: Option<String>,
    pub country: Option<String>,
    pub country_code: Option<String>,
    pub latitude: f64,
    pub longitude: f64,
    pub timezone: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WeatherCurrent {
    pub temperature_c: f64,
    pub feels_like_c: f64,
    pub relative_humidity: u8,
    pub weather_code: u16,
    pub wind_speed_kmh: f64,
    pub precipitation_mm: f64,
    pub is_day: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WeatherDay {
    pub date: String,
    pub weather_code: u16,
    pub min_c: f64,
    pub max_c: f64,
    pub precipitation_probability: Option<u8>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WeatherSnapshot {
    pub location: WeatherLocation,
    pub current: WeatherCurrent,
    pub days: Vec<WeatherDay>,
    pub checked_at: u64,
}

fn client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(12))
        .user_agent(USER_AGENT)
        .build()
        .map_err(|error| format!("Não consegui preparar a consulta do clima: {error}"))
}

fn api_error(value: &Value, fallback: &str) -> String {
    value
        .get("reason")
        .and_then(Value::as_str)
        .map(|reason| format!("{fallback}: {}", reason.chars().take(180).collect::<String>()))
        .unwrap_or_else(|| fallback.to_string())
}

fn number(value: &Value, key: &str) -> Option<f64> {
    value.get(key).and_then(Value::as_f64).filter(|n| n.is_finite())
}

fn text(value: &Value, key: &str, limit: usize) -> Option<String> {
    value
        .get(key)
        .and_then(Value::as_str)
        .map(|value| value.chars().take(limit).collect::<String>())
        .filter(|value| !value.trim().is_empty())
}

fn weather_code(value: &Value, key: &str) -> Option<u16> {
    value
        .get(key)
        .and_then(Value::as_u64)
        .and_then(|value| u16::try_from(value).ok())
}

fn location_from(value: &Value) -> Option<WeatherLocation> {
    let latitude = number(value, "latitude")?;
    let longitude = number(value, "longitude")?;
    if !(-90.0..=90.0).contains(&latitude) || !(-180.0..=180.0).contains(&longitude) {
        return None;
    }
    Some(WeatherLocation {
        id: value.get("id").and_then(Value::as_i64),
        name: text(value, "name", 100)?,
        admin1: text(value, "admin1", 100),
        country: text(value, "country", 100),
        country_code: text(value, "country_code", 2),
        latitude,
        longitude,
        timezone: text(value, "timezone", 80),
    })
}

#[command]
pub async fn weather_search_locations(query: String) -> Result<Vec<WeatherLocation>, String> {
    let query = query.trim();
    if query.chars().count() < 2 || query.chars().count() > 100 {
        return Err("Digite entre 2 e 100 caracteres para buscar uma cidade.".to_string());
    }

    let response = client()?
        .get("https://geocoding-api.open-meteo.com/v1/search")
        .query(&[
            ("name", query),
            ("count", "6"),
            ("language", "pt"),
            ("format", "json"),
        ])
        .send()
        .await
        .map_err(|error| format!("A busca de cidades falhou: {error}"))?;
    let status = response.status();
    let body = response
        .json::<Value>()
        .await
        .map_err(|error| format!("A resposta da busca de cidades não era válida: {error}"))?;
    if !status.is_success() {
        return Err(api_error(&body, "O serviço de cidades recusou a busca"));
    }

    Ok(body
        .get("results")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(location_from)
        .take(6)
        .collect())
}

#[command]
pub async fn weather_get_forecast(
    location: WeatherLocation,
) -> Result<WeatherSnapshot, String> {
    if !location.latitude.is_finite()
        || !location.longitude.is_finite()
        || !(-90.0..=90.0).contains(&location.latitude)
        || !(-180.0..=180.0).contains(&location.longitude)
        || location.name.trim().is_empty()
        || location.name.chars().count() > 100
    {
        return Err("A localização salva não é válida.".to_string());
    }

    let latitude = location.latitude.to_string();
    let longitude = location.longitude.to_string();
    let query = [
        ("latitude", latitude.as_str()),
        ("longitude", longitude.as_str()),
        (
            "current",
            "temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,precipitation,is_day",
        ),
        (
            "daily",
            "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max",
        ),
        ("forecast_days", "5"),
        ("timezone", "auto"),
    ];
    let response = client()?
        .get("https://api.open-meteo.com/v1/forecast")
        .query(&query)
        .send()
        .await
        .map_err(|error| format!("A consulta do clima falhou: {error}"))?;
    let status = response.status();
    let body = response
        .json::<Value>()
        .await
        .map_err(|error| format!("A resposta do clima não era válida: {error}"))?;
    if !status.is_success() || body.get("error").and_then(Value::as_bool) == Some(true) {
        return Err(api_error(&body, "O serviço de clima não conseguiu montar a previsão"));
    }

    let current = body
        .get("current")
        .ok_or_else(|| "O serviço de clima não retornou as condições atuais.".to_string())?;
    let relative_humidity = current
        .get("relative_humidity_2m")
        .and_then(Value::as_u64)
        .and_then(|value| u8::try_from(value).ok())
        .filter(|value| *value <= 100)
        .ok_or_else(|| "A umidade retornada pelo serviço não era válida.".to_string())?;
    let current = WeatherCurrent {
        temperature_c: number(current, "temperature_2m")
            .ok_or_else(|| "A temperatura atual não foi retornada.".to_string())?,
        feels_like_c: number(current, "apparent_temperature")
            .ok_or_else(|| "A sensação térmica não foi retornada.".to_string())?,
        relative_humidity,
        weather_code: weather_code(current, "weather_code")
            .ok_or_else(|| "A condição atual não foi retornada.".to_string())?,
        wind_speed_kmh: number(current, "wind_speed_10m")
            .ok_or_else(|| "A velocidade do vento não foi retornada.".to_string())?,
        precipitation_mm: number(current, "precipitation")
            .ok_or_else(|| "A precipitação atual não foi retornada.".to_string())?,
        is_day: current.get("is_day").and_then(Value::as_u64) == Some(1),
    };

    let daily = body
        .get("daily")
        .ok_or_else(|| "O serviço de clima não retornou a previsão diária.".to_string())?;
    let dates = daily.get("time").and_then(Value::as_array).cloned().unwrap_or_default();
    let codes = daily.get("weather_code").and_then(Value::as_array).cloned().unwrap_or_default();
    let minimums = daily.get("temperature_2m_min").and_then(Value::as_array).cloned().unwrap_or_default();
    let maximums = daily.get("temperature_2m_max").and_then(Value::as_array).cloned().unwrap_or_default();
    let precipitation = daily
        .get("precipitation_probability_max")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let days = (0..dates.len().min(5))
        .filter_map(|index| {
            let date = dates.get(index)?.as_str()?.to_string();
            let weather_code = codes.get(index)?.as_u64().and_then(|value| u16::try_from(value).ok())?;
            let min_c = minimums.get(index)?.as_f64().filter(|value| value.is_finite())?;
            let max_c = maximums.get(index)?.as_f64().filter(|value| value.is_finite())?;
            let precipitation_probability = precipitation
                .get(index)
                .and_then(Value::as_u64)
                .and_then(|value| u8::try_from(value).ok())
                .filter(|value| *value <= 100);
            Some(WeatherDay { date, weather_code, min_c, max_c, precipitation_probability })
        })
        .collect::<Vec<_>>();
    if days.is_empty() {
        return Err("A previsão diária retornou vazia.".to_string());
    }

    Ok(WeatherSnapshot {
        location,
        current,
        days,
        checked_at: std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as u64,
    })
}
