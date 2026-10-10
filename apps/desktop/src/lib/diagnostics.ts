/**
 * Tanılama bilgisi (BACKLOG #12): destek için kopyalanıp yapıştırılabilen, gizli veri içermeyen özet.
 * Sır, anahtar, e-posta adresi, işletme adı ve mesaj metni YOKTUR; yalnızca sürüm, ortam ve çalışan işlerin durumu.
 */
export interface DiagnosticsInput {
  appVersion: string;
  now: Date;
  userAgent: string;
  language: string;
  online: boolean;
  /** Supabase proje adresinin yalnızca ana makine adı (anahtar/yol değil). */
  backendHost: string | null;
  role: string | null;
  analysis: { running: boolean; done: number; total: number; error: string | null };
  scan: { running: boolean; tilesDone: number; budgetPaused: boolean; error: string | null };
  drafts: { running: boolean; done: number; failed: number; stopped: string | null; error: string | null };
}

/** Hata metnindeki olası anahtar/belirteçleri maskeler (nvapi-…, sk-…, JWT, uzun onaltılık). */
export function redactSecrets(text: string | null): string | null {
  if (text === null) return null;
  return text
    .replace(/nvapi-[A-Za-z0-9_-]+/g, "nvapi-***")
    .replace(/sk-[A-Za-z0-9_-]{8,}/g, "sk-***")
    .replace(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, "jwt-***")
    .replace(/\b[a-f0-9]{32,}\b/gi, "hex-***")
    .slice(0, 300);
}

export function buildDiagnostics(input: DiagnosticsInput): string {
  const report = {
    generatedAt: input.now.toISOString(),
    appVersion: input.appVersion,
    userAgent: input.userAgent,
    language: input.language,
    online: input.online,
    backendHost: input.backendHost,
    role: input.role,
    jobs: {
      analysis: { ...input.analysis, error: redactSecrets(input.analysis.error) },
      scan: { ...input.scan, error: redactSecrets(input.scan.error) },
      drafts: { ...input.drafts, error: redactSecrets(input.drafts.error) },
    },
  };
  return JSON.stringify(report, null, 2);
}
