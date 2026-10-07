import { assert, assertEquals, assertFalse } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildSearchRequest, isValidBody } from "./validate.ts";

const base = { workspaceId: "ws-1", textQuery: "dentist in Austin TX" };

Deno.test("geçerli en küçük gövde kabul edilir", () => {
  assert(isValidBody(base));
});

Deno.test("boş sorgu veya workspace reddedilir", () => {
  assertFalse(isValidBody({ ...base, textQuery: "  " }));
  assertFalse(isValidBody({ ...base, workspaceId: "" }));
  assertFalse(isValidBody(null));
});

Deno.test("regionCode yalnızca iki büyük harf, languageCode BCP-47 olabilir", () => {
  assert(isValidBody({ ...base, regionCode: "US", languageCode: "en" }));
  assert(isValidBody({ ...base, regionCode: "GB", languageCode: "en-GB" }));
  assertFalse(isValidBody({ ...base, regionCode: "usa" }));
  assertFalse(isValidBody({ ...base, regionCode: "us" }));
  assertFalse(isValidBody({ ...base, languageCode: "English" }));
  assertFalse(isValidBody({ ...base, languageCode: "e" }));
});

Deno.test("konum yarıçapı 50 km'yi aşamaz", () => {
  assert(isValidBody({ ...base, location: { lat: 30, lng: -97, radiusMeters: 50000 } }));
  assertFalse(isValidBody({ ...base, location: { lat: 30, lng: -97, radiusMeters: 50001 } }));
  assertFalse(isValidBody({ ...base, location: { lat: 99, lng: -97, radiusMeters: 1000 } }));
});

Deno.test("ülke/dil verilmezse eski davranış: Türkiye ve Türkçe", () => {
  const request = buildSearchRequest(base as never);
  assertEquals(request.regionCode, "TR");
  assertEquals(request.languageCode, "tr");
  assertEquals(request.pageSize, 20);
});

Deno.test("ülke ve dil isteğe aktarılır, sayfa belirteci ve konum eklenir", () => {
  const request = buildSearchRequest({
    ...base,
    regionCode: "AU",
    languageCode: "en",
    pageToken: "tok",
    location: { lat: -33.87, lng: 151.21, radiusMeters: 3000 },
  } as never);
  assertEquals(request.regionCode, "AU");
  assertEquals(request.languageCode, "en");
  assertEquals(request.pageToken, "tok");
  assertEquals(request.locationBias, { circle: { center: { latitude: -33.87, longitude: 151.21 }, radius: 3000 } });
});
