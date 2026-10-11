export const SERVICE_KINDS = ["DOMAIN", "HOSTING", "EMAIL", "WEBSITE", "SOCIAL", "PACKAGE_ITEM", "OTHER"] as const;
export type ServiceKind = (typeof SERVICE_KINDS)[number];

export const DOCUMENT_KINDS = ["INVOICE", "CONTRACT", "OTHER"] as const;
export type DocumentKind = (typeof DOCUMENT_KINDS)[number];

export type ServiceStatus = "ACTIVE" | "PAUSED" | "ENDED";
export type MoneyCurrency = "TRY" | "USD" | "EUR";

export interface CustomerServiceRow {
  id: string;
  business_id: string;
  kind: ServiceKind;
  title: string;
  provider: string | null;
  identifier: string | null;
  login_url: string | null;
  username: string | null;
  status: ServiceStatus;
  starts_on: string | null;
  renews_on: string | null;
  cost_amount: number | null;
  currency: MoneyCurrency;
  note: string | null;
}

export interface CustomerDocumentRow {
  id: string;
  business_id: string;
  service_id: string | null;
  kind: DocumentKind;
  title: string;
  invoice_number: string | null;
  amount: number | null;
  currency: MoneyCurrency;
  issued_on: string | null;
  file_path: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  created_at: string;
}

export const STORAGE_BUCKET = "customer-files";
export const MAX_FILE_BYTES = 10 * 1024 * 1024;

/** Kovanın kabul ettiği dosya türleri (migration ile aynı liste). */
export const ALLOWED_MIME_TYPES: Record<string, string> = {
  "application/pdf": "PDF",
  "image/png": "PNG",
  "image/jpeg": "JPG",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "DOCX",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "XLSX",
};

export const FILE_ACCEPT = ".pdf,.png,.jpg,.jpeg,.docx,.xlsx";

export type FileProblem = "EMPTY" | "TOO_LARGE" | "TYPE";

export function checkFile(file: { size: number; type: string }): FileProblem | null {
  if (file.size <= 0) return "EMPTY";
  if (file.size > MAX_FILE_BYTES) return "TOO_LARGE";
  if (!(file.type in ALLOWED_MIME_TYPES)) return "TYPE";
  return null;
}

/** Dosya adını depolama yolu için güvenli hale getirir (yol ayracı, boşluk, Türkçe harf). */
export function safeFileName(rawName: string): string {
  const name = rawName.split("/").pop()?.split(String.fromCharCode(92)).pop() ?? "";
  const dot = name.lastIndexOf(".");
  const base = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot + 1) : "";
  const clean = (value: string) =>
    value
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .replace(/ı/g, "i")
      .replace(/[^A-Za-z0-9._-]+/g, "-")
      .replace(/-{2,}/g, "-")
      .replace(/^[-.]+|[-.]+$/g, "");
  const safeBase = clean(base).slice(0, 80) || "dosya";
  const safeExt = clean(ext).slice(0, 8).toLowerCase();
  return safeExt ? `${safeBase}.${safeExt}` : safeBase;
}

/** `{çalışma alanı}/{işletme}/{rastgele}-{ad}`: Storage politikası ve `register_customer_document` bu yolu bekler. */
export function buildStoragePath(workspaceId: string, businessId: string, fileName: string, uniqueId: string): string {
  return `${workspaceId}/${businessId}/${uniqueId}-${safeFileName(fileName)}`;
}

export type RenewalState = "OVERDUE" | "SOON" | "OK";

/** Yenileme tarihi geçmişse OVERDUE, 30 gün içindeyse SOON. Biten hizmetler için çağıran null kullanır. */
export function renewalState(renewsOn: string | null, now: Date = new Date(), soonDays = 30): RenewalState | null {
  if (!renewsOn) return null;
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const [y, m, d] = renewsOn.split("-").map(Number);
  if (!y || !m || !d) return null;
  const due = Date.UTC(y, m - 1, d);
  const days = Math.round((due - today) / 86_400_000);
  if (days < 0) return "OVERDUE";
  return days <= soonDays ? "SOON" : "OK";
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
