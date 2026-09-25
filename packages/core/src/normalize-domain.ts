/**
 * Bir URL veya ham domain girdisini karşılaştırılabilir bir domain'e indirger:
 * şema ve "www." önekini kaldırır, küçük harfe çevirir, sondaki "/" atılır.
 */
export function normalizeDomain(input: string): string {
  const trimmed = input.trim();
  if (trimmed.length === 0) {
    return "";
  }

  const withScheme = /^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  let host: string;
  try {
    host = new URL(withScheme).hostname;
  } catch {
    return trimmed.toLowerCase();
  }

  return host.toLowerCase().replace(/^www\./, "");
}
