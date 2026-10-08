export interface CheckedDraft {
  ok: boolean;
  reasons: string[];
}

/** Model çıktısından bağımsız retler; yeniden üretmek sonucu değiştirmez. */
const PERMANENT_REASONS = new Set(["STOP_REQUEST"]);

/**
 * Güvenlik kontrolünden geçemeyen taslağı kullanıcıya göstermeden önce yeniden üretir.
 * Model aynı girdiyle her seferinde farklı yazar; adı yanlış yazmak veya uydurma bir ayrıntı eklemek gibi
 * hatalar çoğunlukla bir sonraki denemede kaybolur. Kontrol gevşetilmez: geçemeyen taslak yine gösterilmez.
 * `run(attempt)`: 0 ilk deneme; sonrakilerde önbellek atlanmalıdır.
 */
export async function retryRejected<T extends CheckedDraft>(run: (attempt: number) => Promise<T>, maxAttempts = 3): Promise<T> {
  let result = await run(0);
  for (let attempt = 1; attempt < maxAttempts && !result.ok; attempt += 1) {
    if (result.reasons.some((reason) => PERMANENT_REASONS.has(reason))) break;
    result = await run(attempt);
  }
  return result;
}
