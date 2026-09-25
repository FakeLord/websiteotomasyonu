import { useState } from "react";
import { supabase } from "../../lib/supabase-client";
import { tr } from "../../i18n/tr";
import { Button } from "../../components/ui/button";

/**
 * Free Supabase planında otomatik yedekleme olmadığı için admin'in elle JSON
 * dışa aktarımı (SPEC.md → D13, Faz 8). Tarayıcı indirme mekanizmasıyla
 * (Blob + `<a download>`) çalışır; Tauri webview'ında yerel `Downloads`
 * klasörüne kaydedilir, ek bir Rust komutu gerekmez.
 */
export function DataExportSection({ workspaceId }: { workspaceId: string }) {
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const exportData = async () => {
    setExporting(true);
    setError(null);
    try {
      const [businesses, contactChannels, notes] = await Promise.all([
        supabase.from("businesses").select("*").eq("workspace_id", workspaceId),
        supabase.from("contact_channels").select("*").eq("workspace_id", workspaceId),
        supabase.from("notes").select("*").eq("workspace_id", workspaceId),
      ]);
      if (businesses.error) throw businesses.error;
      if (contactChannels.error) throw contactChannels.error;
      if (notes.error) throw notes.error;

      const payload = {
        exportedAt: new Date().toISOString(),
        workspaceId,
        businesses: businesses.data,
        contactChannels: contactChannels.data,
        notes: notes.data,
      };

      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `local-business-finder-export-${new Date().toISOString().slice(0, 10)}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : tr.settings.exportError);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-2 border-t border-slate-100 pt-4">
      <h2 className="text-lg font-medium text-slate-900">{tr.settings.exportTitle}</h2>
      <p className="text-sm text-slate-500">{tr.settings.exportDescription}</p>
      <Button disabled={exporting} onClick={() => void exportData()}>
        {exporting ? tr.settings.exporting : tr.settings.exportButton}
      </Button>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
