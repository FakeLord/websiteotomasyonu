/**
 * Postgres `ilike`, Türkçe noktalı/noktasız i harflerini büyük-küçük harf
 * eşleniği saymaz ('İstanbul' ilike 'istanbul' = false). Bu harfleri tek
 * karakterlik jokere (`_`) çevirerek "istanbul", "İstanbul", "ISTANBUL"
 * yazımlarının hepsini eşleştiririz. PostgREST `or` sözdizimini bozan
 * karakterler de temizlenir.
 */
export function turkishLikePattern(value: string, mode: "contains" | "exact" = "contains"): string {
  const cleaned = value
    .trim()
    .replace(/[,()%*\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[İIıi]/g, "_");
  return mode === "contains" ? `%${cleaned}%` : cleaned;
}

export function toCsv(rows: Array<Record<string, unknown>>, columns: Array<{ key: string; label: string }>): string {
  const escape = (value: unknown): string => {
    if (value === null || value === undefined) return "";
    const text = String(value);
    // Excel formül enjeksiyonunu önle (=, +, -, @ ile başlayan hücreler).
    const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
    return /[";\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  const header = columns.map((c) => escape(c.label)).join(";");
  const body = rows.map((row) => columns.map((c) => escape(row[c.key])).join(";"));
  // BOM: Excel'in UTF-8 Türkçe karakterleri doğru açması için.
  return String.fromCharCode(0xfeff) + [header, ...body].join("\r\n");
}

export function downloadFile(content: string, filename: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
