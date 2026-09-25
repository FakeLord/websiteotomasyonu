function trigrams(value: string): Set<string> {
  const padded = `  ${value}  `;
  const grams = new Set<string>();
  for (let i = 0; i < padded.length - 2; i += 1) {
    grams.add(padded.slice(i, i + 3));
  }
  return grams;
}

/**
 * Postgres `pg_trgm.similarity()`'nin yaklaşık bir istemci-taraflı karşılığı
 * (Dice katsayısı, trigram tabanlı). Yalnızca CSV önizleme UX'inde kullanılır;
 * asıl yetkili eşik kontrolü `find_possible_duplicate_business()` SQL
 * fonksiyonundadır.
 */
export function trigramSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  const setA = trigrams(a);
  const setB = trigrams(b);
  if (setA.size === 0 || setB.size === 0) return 0;

  let shared = 0;
  for (const gram of setA) {
    if (setB.has(gram)) shared += 1;
  }

  return (2 * shared) / (setA.size + setB.size);
}
