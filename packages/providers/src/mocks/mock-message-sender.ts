import type { MessageSender, OutboundMessage, SendResult } from "../message-sender";

export class MockMessageSender implements MessageSender {
  public readonly sent: OutboundMessage[] = [];

  async send(message: OutboundMessage): Promise<SendResult> {
    this.sent.push(message);
    return {
      externalMessageId: `mock-${this.sent.length}`,
      sentAt: new Date().toISOString(),
    };
  }
}
