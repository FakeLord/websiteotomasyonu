export type SocialPlatform = "INSTAGRAM" | "FACEBOOK" | "LINKEDIN" | "TIKTOK";

const PLATFORM_HOSTS: Record<SocialPlatform, RegExp> = {
  INSTAGRAM: /^(www\.)?instagram\.com$/i,
  FACEBOOK: /^(www\.)?facebook\.com$/i,
  LINKEDIN: /^(www\.)?linkedin\.com$/i,
  TIKTOK: /^(www\.)?tiktok\.com$/i,
};

// Post/reel/story gibi içerik linkleri ve platformun kendi hesapları işletme
// kanalı sayılmaz (SPEC.md → I.2).
const IGNORED_SEGMENTS = new Set([
  "p",
  "reel",
  "reels",
  "stories",
  "explore",
  "tv",
  "share",
  "sharer",
  "people",
  "groups",
  "pages",
  "company",
  "in",
]);

function extractHandleFromUrl(input: string, platform: SocialPlatform): string | null {
  const withScheme = /^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(input) ? input : `https://${input}`;

  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return null;
  }

  if (!PLATFORM_HOSTS[platform].test(url.hostname)) return null;

  const first = url.pathname.split("/").filter(Boolean)[0]?.toLowerCase();
  if (!first || IGNORED_SEGMENTS.has(first)) return null;

  return first;
}

/**
 * Bir sosyal medya URL'sini veya çıplak kullanıcı adını
 * `platform:kullanici_adi` biçimine indirger. Tanınmayan/boş girdide `null`.
 */
export function normalizeSocial(input: string, platform: SocialPlatform): string | null {
  const trimmed = input.trim();
  if (trimmed.length === 0) return null;

  const looksLikeUrl = trimmed.includes("/") || trimmed.includes(".");
  const handle = looksLikeUrl
    ? extractHandleFromUrl(trimmed, platform)
    : trimmed.replace(/^@/, "").toLowerCase();

  if (!handle || handle.length === 0 || IGNORED_SEGMENTS.has(handle)) return null;

  return `${platform.toLowerCase()}:${handle}`;
}
