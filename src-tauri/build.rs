use std::{env, fs, path::PathBuf};

fn main() {
    ensure_dev_icon();
    configure_google_client_id();
    configure_google_client_secret();
    tauri_build::build();
}

fn configure_google_client_id() {
    const ENV_NAME: &str = "EDGE_GHOSTY_GOOGLE_CLIENT_ID";
    println!("cargo:rerun-if-env-changed={ENV_NAME}");

    let client_id = env::var(ENV_NAME).unwrap_or_default();
    let client_id = client_id.trim();
    if client_id.is_empty() {
        if env::var("PROFILE").ok().as_deref() == Some("release") {
            panic!("Set {ENV_NAME} before building a release; Google Workspace login needs the app's OAuth client ID.");
        }
        return;
    }

    let valid = (20..=180).contains(&client_id.len())
        && client_id.bytes().all(|byte| {
            byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.')
        })
        && client_id.ends_with(".apps.googleusercontent.com");
    if !valid {
        panic!("{ENV_NAME} must be a valid Google OAuth desktop client ID.");
    }

    println!("cargo:rustc-env={ENV_NAME}={client_id}");
}

fn configure_google_client_secret() {
    const ENV_NAME: &str = "EDGE_GHOSTY_GOOGLE_CLIENT_SECRET";
    println!("cargo:rerun-if-env-changed={ENV_NAME}");

    let client_secret = env::var(ENV_NAME).unwrap_or_default();
    let client_secret = client_secret.trim();
    if client_secret.is_empty() {
        return;
    }

    if client_secret.len() > 1024
        || !client_secret.is_ascii()
        || client_secret.bytes().any(|byte| byte.is_ascii_control())
    {
        panic!("{ENV_NAME} must be a valid Google OAuth client secret.");
    }

    println!("cargo:rustc-env={ENV_NAME}={client_secret}");
}

// Keep a transparent fallback for older development checkouts that lack the
// branded icon asset. The Windows installer uses the committed Edge Ghosty ICO.
fn ensure_dev_icon() {
    let manifest_dir = PathBuf::from(env::var("CARGO_MANIFEST_DIR").unwrap());
    let icon_path = manifest_dir.join("icons").join("icon.ico");
    if icon_path.exists() {
        return;
    }

    const SIZE: usize = 16;
    const XOR_BYTES: usize = SIZE * SIZE * 4;
    const AND_BYTES: usize = ((SIZE + 31) / 32) * 4 * SIZE;
    const IMAGE_BYTES: usize = 40 + XOR_BYTES + AND_BYTES;

    let mut bytes = Vec::with_capacity(22 + IMAGE_BYTES);
    bytes.extend_from_slice(&[0, 0, 1, 0, 1, 0]); // ICO header
    bytes.extend_from_slice(&[SIZE as u8, SIZE as u8, 0, 0, 1, 0, 32, 0]);
    bytes.extend_from_slice(&(IMAGE_BYTES as u32).to_le_bytes());
    bytes.extend_from_slice(&22u32.to_le_bytes());

    // BITMAPINFOHEADER: 16x16, 32-bit BGRA, followed by XOR and AND masks.
    bytes.extend_from_slice(&40u32.to_le_bytes());
    bytes.extend_from_slice(&(SIZE as i32).to_le_bytes());
    bytes.extend_from_slice(&((SIZE * 2) as i32).to_le_bytes());
    bytes.extend_from_slice(&1u16.to_le_bytes());
    bytes.extend_from_slice(&32u16.to_le_bytes());
    bytes.extend_from_slice(&0u32.to_le_bytes());
    bytes.extend_from_slice(&(XOR_BYTES as u32).to_le_bytes());
    bytes.extend_from_slice(&[0; 16]);
    bytes.extend(std::iter::repeat_n(0u8, XOR_BYTES));
    bytes.extend(std::iter::repeat_n(0u8, AND_BYTES));

    fs::create_dir_all(icon_path.parent().unwrap()).unwrap();
    fs::write(icon_path, bytes).unwrap();
}
