const SOCIAL_HOSTS = ["instagram.com", "facebook.com", "fb.com"];
const LINK_IN_BIO_HOSTS = ["linktr.ee", "bio.link", "linkin.bio"];

/**
 * Places'tan gelen `websiteUri` sosyal/link-in-bio ise site yok sayılır
 * (SPEC.md → H.1). `null` dönerse çağıran `NO_WEBSITE` sınıflandırmalıdır.
 */
export function normalizeWebsiteInput(url: string | undefined | null): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  if (trimmed.length === 0) return null;

  const withScheme = /^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(trimmed) ? trimmed : `https://${trimmed}`;

  let host: string;
  try {
    host = new URL(withScheme).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }

  if (SOCIAL_HOSTS.includes(host) || LINK_IN_BIO_HOSTS.includes(host)) return null;

  return withScheme;
}
