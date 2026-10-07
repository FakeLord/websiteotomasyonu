/**
 * Windows Credential Manager tek bir credential blob'unu 2560 BAYT ile sınırlar
 * (UTF-16'da 1280 kod birimi). Gerçek bir Supabase oturumu bunu aşar; bu yüzden
 * değerler parçalara bölünüp `{key}__0`, `{key}__1`… altında saklanır
 * (Rust `commands/secrets.rs::split_into_chunks` ile aynı kural).
 */
export const SECRET_CHUNK_UNITS = 1200;

/**
 * Değeri, hiçbir parçası `maxUnits` UTF-16 kod birimini aşmayacak ve sürrogat
 * çiftleri (emoji) bölünmeyecek şekilde ayırır. Boş girdi için tek boş parça
 * döner; böylece parça sayısı hiçbir zaman 0 olmaz.
 */
export function splitIntoChunks(value: string, maxUnits: number = SECRET_CHUNK_UNITS): string[] {
  const chunks: string[] = [];
  let current = "";
  for (const char of value) {
    // for..of kod noktalarını dolaşır; length sürrogat çifti için 2 verir.
    if (current.length + char.length > maxUnits && current.length > 0) {
      chunks.push(current);
      current = "";
    }
    current += char;
  }
  chunks.push(current);
  return chunks;
}

export function joinChunks(chunks: readonly string[]): string {
  return chunks.join("");
}
