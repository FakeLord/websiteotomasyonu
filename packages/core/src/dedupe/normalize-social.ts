export type SocialPlatform = "INSTAGRAM" | "FACEBOOK" | "LINKEDIN" | "TIKTOK";

// Alt alan adları da kabul edilir (m.facebook.com, tr.linkedin.com).
const PLATFORM_HOSTS: Record<SocialPlatform, RegExp> = {
  INSTAGRAM: /^([a-z0-9-]+\.)?instagram\.com$/i,
  FACEBOOK: /^([a-z0-9-]+\.)?facebook\.com$/i,
  LINKEDIN: /^([a-z0-9-]+\.)?linkedin\.com$/i,
  TIKTOK: /^([a-z0-9-]+\.)?tiktok\.com$/i,
};

// Post/reel/story gibi içerik linkleri, paylaş düğmeleri ve platformun kendi sayfaları işletme
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
  "sharer.php",
  "share.php",
  "sharearticle",
  "profile.php",
  "people",
  "groups",
  "pages",
  "company",
  "school",
  "in",
  "accounts",
  "login",
  "plugins",
  "dialog",
  "hashtag",
  "watch",
  "events",
  "tr",
  "tag",
  "discover",
  "feed",
  "jobs",
  "legal",
  "help",
  "policies",
  "privacy",
  "about",
]);

// LinkedIn'de hesap ikinci parçadadır: /company/acme, /in/ada, /school/x.
const LINKEDIN_PREFIXES = new Set(["company", "in", "school"]);

// `%`: Latin dışı harf içeren sayfa adları adreste yüzde kodlu gelir (g%c3%bcl-di%c5%9f-…).
const HANDLE = /^[a-z0-9%][a-z0-9._%-]{0,199}$/;

function extractHandleFromUrl(input: string, platform: SocialPlatform): string | null {
  const withScheme = /^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(input) ? input : `https://${input.replace(/^\/\//, "")}`;

  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return null;
  }

  if (!/^https?:$/.test(url.protocol) || !PLATFORM_HOSTS[platform].test(url.hostname)) return null;

  const segments = url.pathname
    .split("/")
    .filter(Boolean)
    .map((segment) => segment.toLowerCase());
  let handle = segments[0];
  if (platform === "LINKEDIN" && handle && LINKEDIN_PREFIXES.has(handle)) handle = segments[1];
  handle = handle?.replace(/^@/, "");

  if (!handle || IGNORED_SEGMENTS.has(handle) || !HANDLE.test(handle)) return null;
  return handle;
}

/**
 * Yalnızca ilgili platformun ADRESİNDEN hesap çıkarır. Web sitesi taramasında bu kullanılır: sayfadaki
 * `#bolum`, `mailto:` veya `hizmetler` gibi sıradan bağlantılar kullanıcı adı sanılmasın.
 */
export function normalizeSocialUrl(input: string, platform: SocialPlatform): string | null {
  const handle = extractHandleFromUrl(input.trim(), platform);
  return handle ? `${platform.toLowerCase()}:${handle}` : null;
}

/**
 * Bir sosyal medya URL'sini veya çıplak kullanıcı adını (elle giriş)
 * `platform:kullanici_adi` biçimine indirger. Tanınmayan/boş girdide `null`.
 */
export function normalizeSocial(input: string, platform: SocialPlatform): string | null {
  const trimmed = input.trim();
  if (trimmed.length === 0) return null;

  const looksLikeUrl = trimmed.includes("/") || trimmed.includes(".com");
  if (looksLikeUrl) return normalizeSocialUrl(trimmed, platform);

  const handle = trimmed.replace(/^@/, "").toLowerCase();
  if (IGNORED_SEGMENTS.has(handle) || !HANDLE.test(handle)) return null;
  return `${platform.toLowerCase()}:${handle}`;
}
