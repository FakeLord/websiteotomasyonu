import { describe, expect, it } from "vitest";
import {
  adminInviteInputSchema,
  loginInputSchema,
  otpLinkTypeSchema,
  setPasswordInputSchema,
} from "./auth";

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

describe("setPasswordInputSchema", () => {
  const strong = "correct-horse-battery";

  it("accepts a password of at least 12 characters that matches its confirmation", () => {
    expect(setPasswordInputSchema.parse({ password: strong, confirm: strong }).password).toBe(strong);
  });

  it("rejects a password shorter than 12 characters", () => {
    expect(() => setPasswordInputSchema.parse({ password: "short-pass1", confirm: "short-pass1" })).toThrow();
  });

  it("rejects a confirmation that differs from the password", () => {
    expect(() => setPasswordInputSchema.parse({ password: strong, confirm: `${strong}x` })).toThrow();
  });
});

describe("otpLinkTypeSchema", () => {
  it("accepts only the link types the e-mail templates produce", () => {
    expect(otpLinkTypeSchema.parse("invite")).toBe("invite");
    expect(otpLinkTypeSchema.parse("recovery")).toBe("recovery");
    expect(() => otpLinkTypeSchema.parse("signup")).toThrow();
  });
});
