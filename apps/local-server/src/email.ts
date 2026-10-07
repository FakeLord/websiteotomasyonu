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
  } catch {
    // Hata ayrıntısı sunucu yanıtındaki parametreleri/kimlik bilgilerini içerebilir; gövdeye taşınmaz.
    throw new Error("e-posta gönderilemedi (SMTP sunucusu veya kimlik bilgileri reddedildi)");
  } finally {
    transport.close?.();
  }
  return messageId;
}
