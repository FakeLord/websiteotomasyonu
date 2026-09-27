// Deno Edge Function'larından göreli yolla içe aktarılır; import içermemelidir.

/**
 * Model çıktısından ilk JSON nesnesini ayıklar. `response_format: json_object`'i
 * dikkate almayan modeller JSON'u ```json bloğuna sarabiliyor veya önüne/arkasına
 * açıklama ekleyebiliyor. Nesne bulunamazsa `null` döner.
 */
export function extractJsonObject(text: string): Record<string, unknown> | null {
  const direct = tryParseObject(text.trim());
  if (direct) return direct;

  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  if (fenced?.[1]) {
    const inner = tryParseObject(fenced[1].trim());
    if (inner) return inner;
  }

  for (let start = text.indexOf("{"); start !== -1; start = text.indexOf("{", start + 1)) {
    const end = findMatchingBrace(text, start);
    if (end === -1) continue;
    const candidate = tryParseObject(text.slice(start, end + 1));
    if (candidate) return candidate;
  }
  return null;
}

function tryParseObject(text: string): Record<string, unknown> | null {
  if (!text.startsWith("{")) return null;
  try {
    const parsed: unknown = JSON.parse(text);
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function findMatchingBrace(text: string, start: number): number {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}
