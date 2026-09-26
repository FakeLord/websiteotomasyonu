//! Windows Credential Manager üzerinden oturum/secret saklama (SPEC.md → F, P.2).
//! Oturum token'ı ve kişisel SMTP/IMAP şifreleri yalnızca burada, düz metin
//! olarak localStorage/dosyaya asla yazılmadan tutulur.
//!
//! Windows Credential Manager, tek bir credential blob'unu 2560 BAYT'la
//! sınırlar (`CRED_MAX_CREDENTIAL_BLOB_SIZE`) — UTF-16 kodlamada bu, 1280 kod
//! birimine denk gelir (`keyring` crate'in hata mesajı yanıltıcı biçimde
//! "2560 chars" der, ama aslında bayt sayısını karşılaştırır). Gerçek bir
//! Supabase oturumu (access_token + refresh_token + kullanıcı nesnesi) bu
//! sınırı kolayca aşıyor — bu yüzden değer, sabit boyutlu parçalara bölünüp
//! `{key}__0`, `{key}__1`, ... altında ayrı credential'lar olarak saklanır;
//! parça sayısı `{key}__chunks` içinde tutulur. Kısa değerler (ör. SMTP şifresi)
//! için de aynı şema kullanılır (tek parça), böylece tek bir kod yolu yeterli olur.

use keyring::Entry;

const SERVICE_NAME: &str = "com.hostlysisletme.localbusinessfinder";
// Windows'un CRED_MAX_CREDENTIAL_BLOB_SIZE sınırı 2560 BAYT'tır (UTF-16 kod
// birimi değil — `keyring` crate'in hata mesajı "2560 chars" dese de, aslında
// UTF-16 kodlanmış BAYT sayısını 2560 ile karşılaştırıyor). Yani gerçek sınır
// 2560 / 2 = 1280 UTF-16 kod birimidir; güvenli bir pay bırakmak için 1200
// kullanılıyor.
const CHUNK_SIZE: usize = 1200;

/// `value`'yu, hiçbir parçanın UTF-16 kod birimi cinsinden `max_units`'i
/// aşmayacağı ve sürrogat çiftlerinin bölünmeyeceği (char sınırlarına
/// hizalanmış) parçalara ayırır. Boş girdi için tek (boş) parça döner, böylece
/// `secret_set("")` de en az bir chunk yazar ve `chunks.len()` hiçbir zaman 0
/// olmaz.
fn split_into_chunks(value: &str, max_units: usize) -> Vec<String> {
    let mut chunks: Vec<String> = Vec::new();
    let mut current = String::new();
    let mut current_units = 0usize;
    for ch in value.chars() {
        let units = ch.len_utf16();
        if current_units + units > max_units && !current.is_empty() {
            chunks.push(std::mem::take(&mut current));
            current_units = 0;
        }
        current.push(ch);
        current_units += units;
    }
    chunks.push(current);
    chunks
}

fn entry(key: &str) -> Result<Entry, String> {
    Entry::new(SERVICE_NAME, key).map_err(|e| e.to_string())
}

fn chunk_meta_key(key: &str) -> String {
    format!("{key}__chunks")
}

fn chunk_key(key: &str, index: usize) -> String {
    format!("{key}__{index}")
}

fn read_chunk_count(key: &str) -> Result<Option<usize>, String> {
    match entry(&chunk_meta_key(key))?.get_password() {
        Ok(count_str) => count_str
            .parse::<usize>()
            .map(Some)
            .map_err(|e| e.to_string()),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub fn secret_get(key: String) -> Result<Option<String>, String> {
    let Some(count) = read_chunk_count(&key)? else {
        return Ok(None);
    };

    let mut value = String::new();
    for i in 0..count {
        match entry(&chunk_key(&key, i))?.get_password() {
            Ok(part) => value.push_str(&part),
            Err(keyring::Error::NoEntry) => return Ok(None),
            Err(e) => return Err(e.to_string()),
        }
    }
    Ok(Some(value))
}

#[tauri::command]
pub fn secret_set(key: String, value: String) -> Result<(), String> {
    let chunks = split_into_chunks(&value, CHUNK_SIZE);
    let old_count = read_chunk_count(&key)?.unwrap_or(0);

    for (i, chunk) in chunks.iter().enumerate() {
        entry(&chunk_key(&key, i))?
            .set_password(chunk)
            .map_err(|e| e.to_string())?;
    }

    // Yeni değer eskisinden daha az parçaya bölündüyse artık kalanları sil.
    for i in chunks.len()..old_count {
        if let Err(e) = entry(&chunk_key(&key, i))?.delete_credential() {
            if !matches!(e, keyring::Error::NoEntry) {
                return Err(e.to_string());
            }
        }
    }

    entry(&chunk_meta_key(&key))?
        .set_password(&chunks.len().to_string())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn secret_delete(key: String) -> Result<(), String> {
    let count = read_chunk_count(&key)?.unwrap_or(0);
    for i in 0..count {
        if let Err(e) = entry(&chunk_key(&key, i))?.delete_credential() {
            if !matches!(e, keyring::Error::NoEntry) {
                return Err(e.to_string());
            }
        }
    }
    match entry(&chunk_meta_key(&key))?.delete_credential() {
        Ok(()) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_value_produces_one_empty_chunk() {
        let chunks = split_into_chunks("", 2000);
        assert_eq!(chunks, vec![""]);
    }

    #[test]
    fn short_value_stays_in_one_chunk() {
        let chunks = split_into_chunks("hello", 2000);
        assert_eq!(chunks, vec!["hello"]);
    }

    #[test]
    fn value_over_limit_splits_into_multiple_chunks() {
        let value = "a".repeat(4500);
        let chunks = split_into_chunks(&value, 2000);
        assert_eq!(chunks.len(), 3);
        assert_eq!(chunks[0].len(), 2000);
        assert_eq!(chunks[1].len(), 2000);
        assert_eq!(chunks[2].len(), 500);
        assert_eq!(chunks.concat(), value);
    }

    #[test]
    fn exact_multiple_of_chunk_size_does_not_create_trailing_empty_chunk() {
        let value = "a".repeat(4000);
        let chunks = split_into_chunks(&value, 2000);
        assert_eq!(chunks.len(), 2);
        assert_eq!(chunks.concat(), value);
    }

    #[test]
    fn surrogate_pairs_are_not_split_across_chunks() {
        // 😀 (U+1F600) UTF-16'da 2 kod birimi (sürrogat çifti) kullanır.
        let value = "😀".repeat(1001); // 2002 UTF-16 birimi
        let chunks = split_into_chunks(&value, 2000);
        assert_eq!(chunks.concat(), value);
        for chunk in &chunks {
            // Her parça geçerli UTF-8/char sınırlarında olmalı (panik yoksa geçer)
            // ve hiçbir emoji ortadan kesilmemeli.
            assert!(chunk.chars().all(|c| c == '😀'));
        }
    }
}
