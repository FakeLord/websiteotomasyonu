import { assert, assertEquals, assertFalse } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { isPlausibleToken, messageFor, pickLang, statusCodeFor } from "./parse.ts";

Deno.test("isPlausibleToken yalnızca 32-128 onaltılık karakteri kabul eder", () => {
  assert(isPlausibleToken("a".repeat(64)));
  assertFalse(isPlausibleToken("a".repeat(31)));
  assertFalse(isPlausibleToken("g".repeat(64)));
  assertFalse(isPlausibleToken("abc'; drop table x;--"));
  assertFalse(isPlausibleToken(null));
});

Deno.test("pickLang: açık parametre, yoksa Accept-Language, yoksa İngilizce", () => {
  assertEquals(pickLang("tr"), "tr");
  assertEquals(pickLang("en", "tr-TR"), "en");
  assertEquals(pickLang(null, "tr-TR,tr;q=0.9"), "tr");
  assertEquals(pickLang(null, null), "en");
});

Deno.test("durum kodları ve mesajlar", () => {
  assertEquals(statusCodeFor("unsubscribed"), 200);
  assertEquals(statusCodeFor("already"), 200);
  assertEquals(statusCodeFor("invalid"), 404);
  assertEquals(statusCodeFor("error"), 500);
  assert(messageFor("unsubscribed", "tr").includes("Listeden çıkarıldınız"));
  assert(messageFor("unsubscribed", "en").includes("unsubscribed"));
});
