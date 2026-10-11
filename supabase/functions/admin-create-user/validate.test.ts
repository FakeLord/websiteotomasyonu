import { assert, assertEquals, assertFalse } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { generatePassword, isValidBody } from "./validate.ts";

const base = { workspaceId: "ws-1", email: "yeni@hostlys.com", role: "MEMBER" };

Deno.test("isValidBody: geçerli gövde ve isteğe bağlı alanlar", () => {
  assert(isValidBody(base));
  assert(isValidBody({ ...base, fullName: "Ayşe Yılmaz", password: "uzun-bir-sifre-123" }));
  assert(isValidBody({ ...base, password: "" }));
});

Deno.test("isValidBody: geçersiz e-posta, rol ve kısa şifre reddedilir", () => {
  assertFalse(isValidBody({ ...base, email: "yok" }));
  assertFalse(isValidBody({ ...base, role: "SUPERADMIN" }));
  assertFalse(isValidBody({ ...base, password: "kisa" }));
  assertFalse(isValidBody({ ...base, workspaceId: "" }));
  assertFalse(isValidBody(null));
});

Deno.test("generatePassword: uzunluk, karakter kümesi ve rastgelelik", () => {
  const a = generatePassword();
  const b = generatePassword();
  assertEquals(a.length, 16);
  assert(/^[A-HJ-NP-Za-km-z2-9]+$/.test(a));
  assert(a !== b);
});
