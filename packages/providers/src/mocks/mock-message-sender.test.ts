import { describe, expect, it } from "vitest";
import { MockMessageSender } from "./mock-message-sender";

describe("MockMessageSender", () => {
  it("records sent messages and returns a synthetic external id", async () => {
    const sender = new MockMessageSender();

    const result = await sender.send({
      channel: "EMAIL",
      to: "info@example.com",
      subject: "Merhaba",
      body: "Test mesajı",
    });

    expect(sender.sent).toHaveLength(1);
    expect(result.externalMessageId).toBe("mock-1");
  });
});
