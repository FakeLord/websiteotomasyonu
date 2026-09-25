import { assert, assertEquals, assertFalse } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { generateInviteCode, isValidBody, sha256Hex } from "./validate.ts";

Deno.test("isValidBody accepts a well-formed invite body", () => {
  assert(isValidBody({ workspaceId: "ws-1", email: "a@b.com", role: "MEMBER" }));
});

Deno.test("isValidBody rejects an invalid role", () => {
  assertFalse(isValidBody({ workspaceId: "ws-1", email: "a@b.com", role: "SUPERADMIN" }));
});

Deno.test("isValidBody rejects a missing email", () => {
  assertFalse(isValidBody({ workspaceId: "ws-1", role: "MEMBER" }));
});

Deno.test("generateInviteCode returns a 12-character hex string", () => {
  const code = generateInviteCode();
  assertEquals(code.length, 12);
  assert(/^[0-9a-f]{12}$/.test(code));
});

Deno.test("sha256Hex is deterministic for the same input", async () => {
  const a = await sha256Hex("secret-code");
  const b = await sha256Hex("secret-code");
  assertEquals(a, b);
  assertEquals(a.length, 64);
});
