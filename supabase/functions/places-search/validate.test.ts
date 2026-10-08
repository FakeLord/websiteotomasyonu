import { assert, assertEquals, assertFalse } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildSearchRequest, fieldMaskFor, isValidBody } from "./validate.ts";

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

const rect = { low: { lat: 30.0, lng: -98.0 }, high: { lat: 30.4, lng: -97.6 } };

Deno.test("kare kısıtı: geçerli dikdörtgen kabul edilir, ters/aralık dışı/180°'yi aşan reddedilir", () => {
  assert(isValidBody({ ...base, restriction: rect }));
  assertFalse(isValidBody({ ...base, restriction: { low: rect.high, high: rect.low } }));
  assertFalse(isValidBody({ ...base, restriction: { low: { lat: -91, lng: 0 }, high: { lat: 0, lng: 1 } } }));
  assertFalse(isValidBody({ ...base, restriction: { low: { lat: -19, lng: 177 }, high: { lat: -16, lng: -178 } } }));
  assertFalse(isValidBody({ ...base, restriction: { low: { lat: 1 }, high: { lat: 2, lng: 3 } } }));
});

Deno.test("kare kısıtı ile yarıçaplı konum birlikte verilemez (Places ikisini aynı istekte kabul etmez)", () => {
  assertFalse(isValidBody({ ...base, restriction: rect, location: { lat: 30, lng: -97, radiusMeters: 1000 } }));
});

Deno.test("kare kısıtı isteğe locationRestriction.rectangle olarak eklenir, locationBias eklenmez", () => {
  const request = buildSearchRequest({ ...base, restriction: rect } as never);
  assertEquals(request.locationRestriction, {
    rectangle: { low: { latitude: 30.0, longitude: -98.0 }, high: { latitude: 30.4, longitude: -97.6 } },
  });
  assertEquals(request.locationBias, undefined);
});

Deno.test("mode yalnızca 'search' veya 'cityBounds' olabilir", () => {
  assert(isValidBody({ ...base, mode: "cityBounds" }));
  assert(isValidBody({ ...base, mode: "search" }));
  assertFalse(isValidBody({ ...base, mode: "details" }));
});

Deno.test("şehir sınırı sorgusu yalnızca ucuz alanları ister ve tek sonuç alır", () => {
  const mask = fieldMaskFor("cityBounds");
  assert(mask.includes("places.viewport"));
  assertFalse(mask.includes("websiteUri"));
  assertFalse(mask.includes("PhoneNumber"));
  assertFalse(mask.includes("rating"));
  assertEquals(buildSearchRequest({ ...base, mode: "cityBounds" } as never).pageSize, 1);
});

Deno.test("normal arama maskesi site, telefon ve sayfalama belirtecini içerir", () => {
  const mask = fieldMaskFor("search");
  assert(mask.includes("places.websiteUri"));
  assert(mask.includes("places.nationalPhoneNumber"));
  assert(mask.includes("nextPageToken"));
});
