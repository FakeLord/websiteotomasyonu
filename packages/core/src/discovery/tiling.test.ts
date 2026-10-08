import { describe, expect, it } from "vitest";
import {
  MAX_TILE_DEPTH,
  TILE_RESULT_CAP,
  boundsFromViewport,
  isValidBounds,
  shouldSplitTile,
  splitTile,
  toPlacesRectangle,
  type TileBounds,
} from "./tiling";

const AUSTIN: TileBounds = { low: { lat: 30.0987, lng: -97.9384 }, high: { lat: 30.5169, lng: -97.5614 } };

describe("isValidBounds", () => {
  it("güneybatı köşesi kuzeydoğunun altında ve solundaysa geçerlidir", () => {
    expect(isValidBounds(AUSTIN)).toBe(true);
  });

  it("ters, sıfır alanlı veya aralık dışı sınırları reddeder", () => {
    expect(isValidBounds({ low: AUSTIN.high, high: AUSTIN.low })).toBe(false);
    expect(isValidBounds({ low: { lat: 10, lng: 10 }, high: { lat: 10, lng: 20 } })).toBe(false);
    expect(isValidBounds({ low: { lat: -91, lng: 0 }, high: { lat: 0, lng: 1 } })).toBe(false);
    expect(isValidBounds({ low: { lat: 0, lng: -181 }, high: { lat: 1, lng: 0 } })).toBe(false);
    expect(isValidBounds({ low: { lat: Number.NaN, lng: 0 }, high: { lat: 1, lng: 1 } })).toBe(false);
  });

  it("180° boylamı aşan (doğu ucu batıdan küçük) sınırı reddeder: Places dikdörtgeni 180°'den geniş olamaz ve bölme bozulur", () => {
    // Fiji çevresi: batı ucu 177°, doğu ucu -178°.
    expect(isValidBounds({ low: { lat: -19, lng: 177 }, high: { lat: -16, lng: -178 } })).toBe(false);
  });
});

describe("splitTile", () => {
  it("kareyi dört eşit çeyreğe böler; çeyrekler örtüşmez ve tüm alanı kaplar", () => {
    const tiles = splitTile(AUSTIN);
    expect(tiles).toHaveLength(4);
    for (const tile of tiles) expect(isValidBounds(tile)).toBe(true);

    const midLat = (AUSTIN.low.lat + AUSTIN.high.lat) / 2;
    const midLng = (AUSTIN.low.lng + AUSTIN.high.lng) / 2;
    expect(tiles).toEqual([
      { low: AUSTIN.low, high: { lat: midLat, lng: midLng } },
      { low: { lat: AUSTIN.low.lat, lng: midLng }, high: { lat: midLat, lng: AUSTIN.high.lng } },
      { low: { lat: midLat, lng: AUSTIN.low.lng }, high: { lat: AUSTIN.high.lat, lng: midLng } },
      { low: { lat: midLat, lng: midLng }, high: AUSTIN.high },
    ]);

    const area = (t: TileBounds) => (t.high.lat - t.low.lat) * (t.high.lng - t.low.lng);
    expect(tiles.reduce((sum, t) => sum + area(t), 0)).toBeCloseTo(area(AUSTIN), 10);
  });

  it("güney yarımkürede ve ekvator/başlangıç meridyeni üzerinde de doğru böler", () => {
    const sydney: TileBounds = { low: { lat: -34.1, lng: 150.9 }, high: { lat: -33.6, lng: 151.4 } };
    expect(splitTile(sydney).every(isValidBounds)).toBe(true);
    const across: TileBounds = { low: { lat: -1, lng: -1 }, high: { lat: 1, lng: 1 } };
    expect(splitTile(across)[3]).toEqual({ low: { lat: 0, lng: 0 }, high: { lat: 1, lng: 1 } });
  });

  it("geçersiz sınırda hata fırlatır", () => {
    expect(() => splitTile({ low: AUSTIN.high, high: AUSTIN.low })).toThrow();
  });
});

describe("shouldSplitTile", () => {
  it("sonuç üst sınıra (60) ulaştıysa ve derinlik izin veriyorsa böler", () => {
    expect(TILE_RESULT_CAP).toBe(60);
    expect(shouldSplitTile(60, 0)).toBe(true);
    expect(shouldSplitTile(59, 0)).toBe(false);
    expect(shouldSplitTile(0, 0)).toBe(false);
  });

  it("en fazla derinlikte artık bölmez (sonsuz bölünme yok)", () => {
    expect(shouldSplitTile(60, MAX_TILE_DEPTH - 1)).toBe(true);
    expect(shouldSplitTile(60, MAX_TILE_DEPTH)).toBe(false);
  });
});

describe("Places biçimleri", () => {
  it("Places `viewport` yanıtını sınırlara çevirir", () => {
    expect(
      boundsFromViewport({ low: { latitude: 30.0987, longitude: -97.9384 }, high: { latitude: 30.5169, longitude: -97.5614 } }),
    ).toEqual(AUSTIN);
  });

  it("eksik, bozuk veya 180°'yi aşan viewport için null döner", () => {
    expect(boundsFromViewport(undefined)).toBeNull();
    expect(boundsFromViewport({ low: { latitude: 1 }, high: { latitude: 2, longitude: 3 } })).toBeNull();
    expect(boundsFromViewport({ low: { latitude: -19, longitude: 177 }, high: { latitude: -16, longitude: -178 } })).toBeNull();
  });

  it("sınırları Places `locationRestriction.rectangle` gövdesine çevirir", () => {
    expect(toPlacesRectangle(AUSTIN)).toEqual({
      rectangle: { low: { latitude: 30.0987, longitude: -97.9384 }, high: { latitude: 30.5169, longitude: -97.5614 } },
    });
  });
});
