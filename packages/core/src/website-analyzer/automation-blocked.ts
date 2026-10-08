/** Bot koruması/hız sınırı olarak sık görülen kodlar: site ayakta olabilir, yalnızca bize kapalıdır. */
export const BOT_BLOCK_STATUSES: ReadonlySet<number> = new Set([401, 403, 406, 429]);

export function httpIssueText(httpStatus: number): string {
  return BOT_BLOCK_STATUSES.has(httpStatus)
    ? `Site HTTP ${httpStatus} döndürdü; otomatik erişimi engelliyor olabilir, tarayıcıda açılıyorsa elle kontrol edin.`
    : `Site HTTP ${httpStatus} döndürdü.`;
}

/**
 * Analizin "site bozuk" dediği ama aslında botlara kapalı olabilen durum. Bu metin işletmeye
 * söylenecek bir site sorunu değildir (site muhtemelen açılıyor); mesaj taslağına verilmez.
 */
export function isAutomationBlockedIssue(issue: string): boolean {
  const match = /^Site HTTP (\d{3}) döndürdü/.exec(issue.trim());
  return match !== null && BOT_BLOCK_STATUSES.has(Number(match[1]));
}
