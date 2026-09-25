/**
 * `robots.txt`'i minimal biçimde ayrıştırır: yalnızca `User-agent: *` (ve
 * tanınırsa bot adımız) altındaki `Disallow` kurallarına bakar. Ayrıştırma
 * başarısız olursa ya da robots.txt yoksa izinli kabul edilir (SPEC.md → H.5:
 * "robots.txt izin veriyorsa").
 */
export function isPathAllowed(robotsTxt: string, path: string, userAgent = "LocalBusinessFinderBot"): boolean {
  const lines = robotsTxt.split(/\r?\n/).map((l) => l.trim());
  const groups: Array<{ agents: string[]; disallow: string[] }> = [];
  let current: { agents: string[]; disallow: string[] } | null = null;

  for (const rawLine of lines) {
    const line = rawLine.split("#")[0]?.trim();
    if (!line) continue;
    const [rawKey, ...rest] = line.split(":");
    const key = rawKey?.trim().toLowerCase();
    const value = rest.join(":").trim();
    if (!key) continue;

    if (key === "user-agent") {
      if (!current || current.disallow.length > 0) {
        current = { agents: [value.toLowerCase()], disallow: [] };
        groups.push(current);
      } else {
        current.agents.push(value.toLowerCase());
      }
    } else if (key === "disallow" && current) {
      current.disallow.push(value);
    }
  }

  const applicable = groups.filter(
    (g) => g.agents.includes("*") || g.agents.some((a) => userAgent.toLowerCase().includes(a)),
  );

  for (const group of applicable) {
    for (const rule of group.disallow) {
      if (rule === "") continue;
      if (path.startsWith(rule)) return false;
    }
  }

  return true;
}
