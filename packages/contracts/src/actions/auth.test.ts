import { describe, expect, it } from "vitest";
import { adminInviteInputSchema, loginInputSchema } from "./auth";

describe("loginInputSchema", () => {
  it("accepts a valid email/password pair", () => {
    const result = loginInputSchema.parse({ email: "a@b.com", password: "secret" });
    expect(result.email).toBe("a@b.com");
  });

  it("rejects an invalid email", () => {
    expect(() => loginInputSchema.parse({ email: "not-an-email", password: "x" })).toThrow();
  });
});

describe("adminInviteInputSchema", () => {
  it("accepts a valid role", () => {
    expect(adminInviteInputSchema.parse({ email: "a@b.com", role: "MEMBER" }).role).toBe(
      "MEMBER",
    );
  });

  it("rejects an invalid role", () => {
    expect(() =>
      adminInviteInputSchema.parse({ email: "a@b.com", role: "SUPERADMIN" }),
    ).toThrow();
  });
});
