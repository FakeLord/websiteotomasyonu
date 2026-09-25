export type MessageChannel =
  | "EMAIL"
  | "INSTAGRAM"
  | "FACEBOOK"
  | "LINKEDIN"
  | "TIKTOK"
  | "WHATSAPP"
  | "PHONE"
  | "WEBSITE_FORM";

export interface OutboundMessage {
  channel: MessageChannel;
  to: string;
  subject?: string;
  body: string;
}

export interface SendResult {
  externalMessageId: string;
  sentAt: string;
}

/**
 * Kanal başına gönderim sözleşmesi (SPEC.md → I.3/L). MVP'de yalnızca EMAIL
 * (SMTP) otomatik gönderir; diğer kanallar "assisted" akışta kullanıcı
 * tarafından tetiklenir ama sözleşme aynı kalır.
 */
export interface MessageSender {
  send(message: OutboundMessage): Promise<SendResult>;
}
