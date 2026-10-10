import { useState } from "react";
import { supabase } from "../../lib/supabase-client";
import { tr } from "../../i18n/tr";
import { ClipboardCopy, Download } from "lucide-react";
import { useAnalysisStore } from "../../lib/analysis-store";
import { useDraftStore } from "../../lib/draft-store";
import { useScanStore } from "../../lib/scan-store";
import { useWorkspaceMembership } from "../../lib/use-workspace-membership";
import { buildDiagnostics } from "../../lib/diagnostics";
import { Button } from "../../components/ui/button";
import { Card, CardBody, CardHeader } from "../../components/ui/card";

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

  const role = useWorkspaceMembership().data?.role ?? null;
  const analysis = useAnalysisStore((state) => state.queue);
  const problem = useAnalysisStore((state) => state.problem);
  const scan = useScanStore((state) => state.scan);
  const drafts = useDraftStore((state) => state.draft);
  const [diagnosticsCopied, setDiagnosticsCopied] = useState<"ok" | "error" | null>(null);

  const copyDiagnostics = async () => {
    const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? "";
    let backendHost: string | null = null;
    try {
      backendHost = url ? new URL(url).host : null;
    } catch {
      backendHost = null;
    }
    const text = buildDiagnostics({
      appVersion: __APP_VERSION__,
      now: new Date(),
      userAgent: navigator.userAgent,
      language: navigator.language,
      online: navigator.onLine,
      backendHost,
      role,
      analysis: { running: analysis.running, done: analysis.done, total: analysis.total, error: problem?.firstError ?? null },
      scan: { running: scan.running, tilesDone: scan.tilesDone, budgetPaused: scan.budgetPaused, error: scan.error },
      drafts: { running: drafts.running, done: drafts.done, failed: drafts.failed, stopped: drafts.stopped, error: drafts.error },
    });
    try {
      await navigator.clipboard.writeText(text);
      setDiagnosticsCopied("ok");
    } catch {
      setDiagnosticsCopied("error");
    }
  };

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader title={tr.settings.exportTitle} />
        <CardBody className="space-y-3">
          <p className="text-sm text-muted">{tr.settings.exportDescription}</p>
          <Button disabled={exporting} onClick={() => void exportData()}>
            <Download />
            {exporting ? tr.settings.exporting : tr.settings.exportButton}
          </Button>
          {error && <p className="text-xs text-[#f87171]">{error}</p>}
        </CardBody>
      </Card>
      <Card>
        <CardHeader title={tr.settings.diagnosticsTitle} />
        <CardBody className="space-y-3">
          <p className="text-sm text-muted">{tr.settings.diagnosticsDescription}</p>
          <Button variant="outline" onClick={() => void copyDiagnostics()}>
            <ClipboardCopy />
            {tr.settings.diagnosticsButton}
          </Button>
          {diagnosticsCopied === "ok" && <p className="text-xs text-muted">{tr.settings.diagnosticsCopied}</p>}
          {diagnosticsCopied === "error" && <p className="text-xs text-[#f87171]">{tr.settings.diagnosticsFailed}</p>}
        </CardBody>
      </Card>
    </div>
  );
}
