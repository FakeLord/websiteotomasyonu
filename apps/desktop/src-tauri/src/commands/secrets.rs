//! Windows Credential Manager üzerinden oturum/secret saklama (SPEC.md → F, P.2).
//! Oturum token'ı ve kişisel SMTP/IMAP şifreleri yalnızca burada, düz metin
//! olarak localStorage/dosyaya asla yazılmadan tutulur.

use keyring::Entry;

const SERVICE_NAME: &str = "com.hostlysisletme.localbusinessfinder";

fn entry(key: &str) -> Result<Entry, String> {
    Entry::new(SERVICE_NAME, key).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn secret_get(key: String) -> Result<Option<String>, String> {
    match entry(&key)?.get_password() {
        Ok(password) => Ok(Some(password)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub fn secret_set(key: String, value: String) -> Result<(), String> {
    entry(&key)?.set_password(&value).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn secret_delete(key: String) -> Result<(), String> {
    match entry(&key)?.delete_credential() {
        Ok(()) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}
