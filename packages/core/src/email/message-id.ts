function randomHex32(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * RFC 5322 `Message-ID`: `<uuid@gönderen-domain>`. Gelen cevaplar bu kimliğe
 * `In-Reply-To`/`References` ile eşlenir (SPEC.md → L). Domain gönderen
 * adresinden alınır; alınamazsa `localhost` kullanılır. Rust
 * `commands/email.rs::build_message_id` ile aynı biçim.
 */
export function buildMessageId(fromEmail: string, random: () => string = randomHex32): string {
  const at = fromEmail.lastIndexOf("@");
  const domain = at === -1 ? "" : fromEmail.slice(at + 1).trim();
  const valid = domain !== "" && !/[<>\s]/.test(domain);
  return `<${random()}@${valid ? domain : "localhost"}>`;
}
