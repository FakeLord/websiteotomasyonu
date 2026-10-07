// Elle çalıştırılan duman testi (CLAUDE.md #6 — gerçek ağ yalnızca burada):
//   pnpm exec tsx scripts/smoke/local-server-mail.ts
// Sahte hesapla gerçek Gmail SMTP (587 STARTTLS, 465 SSL) ve IMAP (993) sunucularına bağlanır; TLS el
// sıkışmasının ve kimlik doğrulamanın doğru, şifre sızdırmayan hatalara çevrildiğini doğrular.
import { sendEmail } from "../../apps/local-server/src/email";
import { fetchImap } from "../../apps/local-server/src/imap";

const fake = { username: "lbf-smoke-nonexistent-user@gmail.com", password: "not-a-real-password", from_name: "Smoke", from_email: "lbf-smoke-nonexistent-user@gmail.com" };
const message = { to_email: "lbf-smoke-alici@example.com", subject: "smoke", body: "smoke" };

async function expectFailure(label: string, run: () => Promise<unknown>, expected: RegExp) {
  try {
    await run();
    console.log(`✗ ${label}: hata bekleniyordu`);
    process.exitCode = 1;
  } catch (error) {
    const text = error instanceof Error ? error.message : String(error);
    const ok = expected.test(text) && !text.includes(fake.password);
    console.log(`${ok ? "✓" : "✗"} ${label}: ${text}`);
    if (!ok) process.exitCode = 1;
  }
}

await expectFailure("SMTP 587 (STARTTLS)", () => sendEmail({ host: "smtp.gmail.com", port: 587, ...fake }, message), /SMTP girişi başarısız/);
await expectFailure("SMTP 465 (SSL)", () => sendEmail({ host: "smtp.gmail.com", port: 465, ...fake }, message), /SMTP girişi başarısız/);
await expectFailure(
  "IMAP 993",
  () => fetchImap({ host: "imap.gmail.com", port: 993, username: fake.username, password: fake.password }, { since_uid: 1, since_date: null, limit: 1 }),
  /IMAP girişi başarısız/,
);
await expectFailure("SMTP olmayan sunucu", () => sendEmail({ host: "smtp.bu-alan-adi-yok.invalid", port: 587, ...fake }, message), /SMTP sunucusuna bağlanılamadı/);
