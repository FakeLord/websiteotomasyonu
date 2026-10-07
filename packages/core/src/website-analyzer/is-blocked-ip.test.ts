import { describe, expect, it } from "vitest";
import { isBlockedIp } from "./is-blocked-ip";

describe("isBlockedIp (SSRF engeli — Rust is_blocked_ip ile aynı kurallar)", () => {
  it.each([
    "127.0.0.1",
    "127.255.255.254",
    "10.0.0.5",
    "172.16.0.1",
    "172.31.255.255",
    "192.168.1.10",
    "169.254.169.254",
    "0.0.0.0",
    "255.255.255.255",
    "224.0.0.1",
    "100.64.0.1",
    "100.127.255.255",
  ])("engeller: IPv4 %s", (ip) => {
    expect(isBlockedIp(ip)).toBe(true);
  });

  it.each(["8.8.8.8", "93.184.216.34", "172.15.0.1", "172.32.0.1", "100.63.255.255", "100.128.0.1", "11.0.0.1"])(
    "izin verir: genel IPv4 %s",
    (ip) => {
      expect(isBlockedIp(ip)).toBe(false);
    },
  );

  it.each(["::1", "::", "ff02::1", "fc00::1", "fd12:3456::1", "fe80::1", "febf::1"])("engeller: IPv6 %s", (ip) => {
    expect(isBlockedIp(ip)).toBe(true);
  });

  it.each(["2606:4700:4700::1111", "2001:4860:4860::8888"])("izin verir: genel IPv6 %s", (ip) => {
    expect(isBlockedIp(ip)).toBe(false);
  });

  it("IPv4-eşlemeli IPv6 adreslerini IPv4 kurallarıyla değerlendirir", () => {
    expect(isBlockedIp("::ffff:127.0.0.1")).toBe(true);
    expect(isBlockedIp("::ffff:10.1.2.3")).toBe(true);
    expect(isBlockedIp("::ffff:8.8.8.8")).toBe(false);
  });

  it("geçersiz girdiyi güvenli tarafta (engelli) sayar", () => {
    expect(isBlockedIp("not-an-ip")).toBe(true);
    expect(isBlockedIp("")).toBe(true);
    expect(isBlockedIp("999.1.1.1")).toBe(true);
  });
});
