import nodemailer from "nodemailer";
type MailTransport = Parameters<typeof sendEmail>[2] & object;
import { describe, expect, it } from "vitest";
import { buildTransportOptions, sendEmail } from "./email";

const smtp = { host: "smtp.ajans.com", port: 587, username: "satis@ajans.com", password: "gizli", from_name: "Ajans Satış", from_email: "satis@ajans.com" };
const message = { to_email: "info@klinik.com", subject: "Web siteniz hakkında", body: "Merhaba,\nöğrendik ki…" };

const jsonTransport = () => nodemailer.createTransport({ jsonTransport: true });

describe("buildTransportOptions (STARTTLS/TLS seçimi)", () => {
  it("465'te örtük TLS kullanır", () => {
    expect(buildTransportOptions({ ...smtp, port: 465 })).toMatchObject({ secure: true, host: "smtp.ajans.com", port: 465 });
    expect(buildTransportOptions({ ...smtp, port: 465 }).requireTLS).toBeFalsy();
  });

  it("587 ve diğer portlarda STARTTLS'i zorunlu kılar (düz metne düşmez)", () => {
    expect(buildTransportOptions(smtp)).toMatchObject({ secure: false, requireTLS: true, port: 587 });
    expect(buildTransportOptions({ ...smtp, port: 25 })).toMatchObject({ secure: false, requireTLS: true });
  });

  it("kimlik bilgilerini ve makul zaman aşımlarını verir", () => {
    const options = buildTransportOptions(smtp);
    expect(options.auth).toEqual({ user: "satis@ajans.com", pass: "gizli" });
    expect(options.connectionTimeout).toBeLessThanOrEqual(30_000);
    expect(options.socketTimeout).toBeLessThanOrEqual(60_000);
  });
});

describe("sendEmail", () => {
  it("Message-ID üretir, gönderen domain'ine bağlar ve döndürür", async () => {
    const result = await sendEmail(smtp, message, jsonTransport());
    expect(result).toMatch(/^<[0-9a-f]{32}@ajans\.com>$/);
  });

  it("gönderen adı, alıcı, konu, düz metin gövde ve üretilen Message-ID'yi taşıyıcıya verir", async () => {
    const sentMails: Array<Record<string, unknown>> = [];
    const spy = { sendMail: async (mail: Record<string, unknown>) => void sentMails.push(mail) } as unknown as MailTransport;
    const messageId = await sendEmail(smtp, message, spy);
    expect(sentMails[0]).toEqual({
      from: { name: "Ajans Satış", address: "satis@ajans.com" },
      to: "info@klinik.com",
      subject: "Web siteniz hakkında",
      text: "Merhaba,\nöğrendik ki…",
      messageId,
    });
  });

  it("gerçek MIME çıktısında başlıklar doğru yazılır (jsonTransport)", async () => {
    const transport = nodemailer.createTransport({ jsonTransport: true });
    const raw: string[] = [];
    const original = transport.sendMail.bind(transport);
    transport.sendMail = (async (mail: Parameters<typeof original>[0]) => {
      const info = (await original(mail)) as { message: string };
      raw.push(info.message);
      return info;
    }) as typeof transport.sendMail;

    const messageId = await sendEmail(smtp, { ...message, in_reply_to: "<m-1@klinik.com>" }, transport);
    const sent = JSON.parse(raw[0] ?? "{}") as { messageId: string; inReplyTo: string; references: string[] | string; subject: string };
    expect(sent.messageId).toBe(messageId);
    expect(sent.inReplyTo).toBe("<m-1@klinik.com>");
    expect(String(sent.references)).toContain("<m-1@klinik.com>");
    expect(sent.subject).toBe("Web siteniz hakkında");
  });

  it("cevap e-postasında In-Reply-To ve References ekler", async () => {
    const sentMails: Array<Record<string, unknown>> = [];
    const spy = { sendMail: async (mail: Record<string, unknown>) => void sentMails.push(mail) } as unknown as MailTransport;
    await sendEmail(smtp, { ...message, in_reply_to: "<musteri-1@klinik.com>" }, spy);
    expect(sentMails[0]).toMatchObject({ inReplyTo: "<musteri-1@klinik.com>", references: "<musteri-1@klinik.com>" });
  });

  it("boş veya yok in_reply_to'da thread başlığı eklemez", async () => {
    const sentMails: Array<Record<string, unknown>> = [];
    const spy = { sendMail: async (mail: Record<string, unknown>) => void sentMails.push(mail) } as unknown as MailTransport;
    await sendEmail(smtp, { ...message, in_reply_to: "  " }, spy);
    await sendEmail(smtp, { ...message, in_reply_to: null }, spy);
    for (const mail of sentMails) {
      expect(mail).not.toHaveProperty("inReplyTo");
      expect(mail).not.toHaveProperty("references");
    }
  });

  it("gönderen veya alıcı adresi geçersizse açık hata verir (SMTP'ye gitmeden)", async () => {
    await expect(sendEmail({ ...smtp, from_email: "gecersiz" }, message, jsonTransport())).rejects.toThrow(/gönderen adresi/);
    await expect(sendEmail(smtp, { ...message, to_email: "yok" }, jsonTransport())).rejects.toThrow(/alıcı adresi/);
  });

  it("başlık enjeksiyonunu (satır sonu) reddeder", async () => {
    await expect(sendEmail(smtp, { ...message, subject: "Merhaba\r\nBcc: kurban@x.com" }, jsonTransport())).rejects.toThrow(/konu/i);
    await expect(sendEmail(smtp, { ...message, to_email: "a@b.com\r\nBcc: x@y.com" }, jsonTransport())).rejects.toThrow(/alıcı adresi/);
  });

  it("taşıyıcı hatasını şifre sızdırmadan Türkçe mesaja çevirir", async () => {
    const failing = { sendMail: async () => { throw new Error("Invalid login: 535 gizli"); } } as unknown as MailTransport;
    const error = await sendEmail(smtp, message, failing).then(() => new Error("hata beklenmişti"), (e: unknown) => e as Error);
    expect(error.message).toMatch(/^e-posta gönderilemedi/);
    expect(error.message).not.toContain("gizli");
  });
});
