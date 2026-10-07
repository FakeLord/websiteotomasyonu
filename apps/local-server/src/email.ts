import nodemailer, { type Transporter } from "nodemailer";
import type SMTPTransport from "nodemailer/lib/smtp-transport";
import { buildMessageId } from "@lbf/core";

export interface SmtpInput {
  host: string;
  port: number;
  username: string;
  password: string;
  from_name: string;
  from_email: string;
}

export interface EmailInput {
  to_email: string;
  subject: string;
  body: string;
  in_reply_to?: string | null | undefined;
}

const ADDRESS_RE = /^[^\s@<>"',;:\\]+@[^\s@<>"',;:\\]+\.[^\s@<>"',;:\\]+$/;
const HAS_LINE_BREAK = /[\r\n]/;

/**
 * 465'te örtük TLS; diğer portlarda (587, 25) STARTTLS zorunludur — sunucu
 * desteklemezse düz metne düşülmez (nodemailer `requireTLS`).
 */
export function buildTransportOptions(smtp: SmtpInput): SMTPTransport.Options {
  const implicitTls = smtp.port === 465;
  return {
    host: smtp.host,
    port: smtp.port,
    secure: implicitTls,
    requireTLS: !implicitTls,
    auth: { user: smtp.username, pass: smtp.password },
    connectionTimeout: 20_000,
    greetingTimeout: 20_000,
    socketTimeout: 45_000,
  };
}

/**
 * nodemailer hata kodunu kullanıcıya yol gösteren, ayrıntı sızdırmayan bir mesaja
 * çevirir (ham hata sunucu yanıtındaki kullanıcı adı/komutları içerebilir).
 */
export function describeSmtpFailure(code: string | undefined): string {
  switch (code) {
    case "EAUTH":
      return "SMTP girişi başarısız (kullanıcı adı/şifre veya uygulama şifresi)";
    case "ECONNECTION":
    case "ETIMEDOUT":
    case "ESOCKET":
    case "EDNS":
    case "ECONNREFUSED":
    case "ENOTFOUND":
      return "SMTP sunucusuna bağlanılamadı (sunucu adı, port veya ağ bağlantısı)";
    case "ETLS":
    case "EREQUIRETLS":
      return "güvenli bağlantı (TLS/STARTTLS) kurulamadı; 587 için STARTTLS, 465 için SSL gerekir";
    case "EENVELOPE":
      return "sunucu alıcı adresini veya gönderen adresini kabul etmedi";
    default:
      return "sunucu postayı reddetti";
  }
}

/**
 * Kişisel SMTP hesabından tek e-posta gönderir ve RFC 5322 `Message-ID`'sini
 * döner (Rust `send_email` ile aynı sözleşme). İş kuralları (DNC, limit, onay)
 * burada değil, masaüstü/web arayüzünde `outreach_guard` ile uygulanır.
 */
export async function sendEmail(
  smtp: SmtpInput,
  message: EmailInput,
  transport: Pick<Transporter, "sendMail"> & { close?: () => void } = nodemailer.createTransport(buildTransportOptions(smtp)),
): Promise<string> {
  if (!ADDRESS_RE.test(smtp.from_email) || HAS_LINE_BREAK.test(smtp.from_name)) {
    throw new Error("geçersiz gönderen adresi");
  }
  if (!ADDRESS_RE.test(message.to_email)) throw new Error("geçersiz alıcı adresi");
  if (HAS_LINE_BREAK.test(message.subject)) throw new Error("konu satır sonu içeremez");

  const messageId = buildMessageId(smtp.from_email);
  const parent = message.in_reply_to?.trim();

  try {
    await transport.sendMail({
      from: { name: smtp.from_name, address: smtp.from_email },
      to: message.to_email,
      subject: message.subject,
      text: message.body,
      messageId,
      ...(parent ? { inReplyTo: parent, references: parent } : {}),
    });
  } catch (error) {
    // Ham hata sunucu yanıtındaki parametreleri/kimlik bilgilerini içerebilir; yalnızca türü bildirilir.
    throw new Error(`e-posta gönderilemedi: ${describeSmtpFailure((error as { code?: string }).code)}`);
  } finally {
    transport.close?.();
  }
  return messageId;
}
