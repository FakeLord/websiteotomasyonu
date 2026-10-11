#[cfg(not(any(target_os = "android", target_os = "ios")))]
use tauri::Manager;

mod commands;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default();

    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_focus();
            }
        }));
        // Otomatik güncelleme (ADR 0026): imzalı sürümü Supabase Storage'daki latest.json'dan kontrol eder.
        builder = builder.plugin(tauri_plugin_updater::Builder::new().build());
    }

    builder
        .plugin(tauri_plugin_opener::init())
        .plugin(
            tauri_plugin_log::Builder::new()
                .max_file_size(10 * 1024 * 1024)
                .rotation_strategy(tauri_plugin_log::RotationStrategy::KeepAll)
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            commands::secrets::secret_get,
            commands::secrets::secret_set,
            commands::secrets::secret_delete,
            commands::website::fetch_page,
            commands::email::send_email,
            commands::imap::imap_fetch,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
