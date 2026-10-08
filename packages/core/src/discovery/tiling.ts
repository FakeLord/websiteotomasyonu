export interface TilePoint {
  lat: number;
  lng: number;
}

/** `low` güneybatı, `high` kuzeydoğu köşedir (Places `Viewport` ile aynı). */
export interface TileBounds {
  low: TilePoint;
  high: TilePoint;
}

/** Text Search bir sorguya en çok 3 sayfa × 20 = 60 sonuç verir; karenin "dolu" sayılma eşiği. */
export const TILE_RESULT_CAP = 60;
/** Kök kare (şehir) 0'dır; 6. derinlikte kenar şehrin 1/64'üdür. Daha derine inmek çağrı israfıdır. */
export const MAX_TILE_DEPTH = 6;

function inRange(value: number, min: number, max: number): boolean {
  return Number.isFinite(value) && value >= min && value <= max;
}

/**
 * 180° boylamını aşan sınırlar (doğu ucu batıdan küçük) bilerek geçersizdir: Places dikdörtgeni bunu kabul etse
 * de orta nokta hesabı bozulur. Böyle şehirler (ör. Fiji) bu sürümde taranmaz.
 */
export function isValidBounds(bounds: TileBounds): boolean {
  const { low, high } = bounds;
  return (
    inRange(low.lat, -90, 90) &&
    inRange(high.lat, -90, 90) &&
    inRange(low.lng, -180, 180) &&
    inRange(high.lng, -180, 180) &&
    low.lat < high.lat &&
    low.lng < high.lng
  );
}

/** Kareyi dört eşit çeyreğe böler: güneybatı, güneydoğu, kuzeybatı, kuzeydoğu. */
export function splitTile(bounds: TileBounds): [TileBounds, TileBounds, TileBounds, TileBounds] {
  if (!isValidBounds(bounds)) throw new Error("geçersiz kare sınırı");
  const { low, high } = bounds;
  const midLat = (low.lat + high.lat) / 2;
  const midLng = (low.lng + high.lng) / 2;
  return [
    { low: { lat: low.lat, lng: low.lng }, high: { lat: midLat, lng: midLng } },
    { low: { lat: low.lat, lng: midLng }, high: { lat: midLat, lng: high.lng } },
    { low: { lat: midLat, lng: low.lng }, high: { lat: high.lat, lng: midLng } },
    { low: { lat: midLat, lng: midLng }, high: { lat: high.lat, lng: high.lng } },
  ];
}

/**
 * Kare üst sınıra ulaştıysa içinde görmediğimiz işletmeler olabilir; dörde bölünüp yeniden taranır.
 * En fazla derinlikte bölünmez (çok yoğun bir noktada sonsuz bölünme ve çağrı israfı olmasın).
 */
export function shouldSplitTile(resultCount: number, depth: number): boolean {
  return resultCount >= TILE_RESULT_CAP && depth < MAX_TILE_DEPTH;
}

interface PlacesLatLng {
  latitude?: number;
  longitude?: number;
}

export interface PlacesViewport {
  low?: PlacesLatLng;
  high?: PlacesLatLng;
}

/** Places `viewport` alanını sınırlara çevirir; eksik/bozuk/180°'yi aşan görünümde `null`. */
export function boundsFromViewport(viewport: PlacesViewport | undefined | null): TileBounds | null {
  const low = viewport?.low;
  const high = viewport?.high;
  if (
    typeof low?.latitude !== "number" ||
    typeof low.longitude !== "number" ||
    typeof high?.latitude !== "number" ||
    typeof high.longitude !== "number"
  ) {
    return null;
  }
  const bounds: TileBounds = {
    low: { lat: low.latitude, lng: low.longitude },
    high: { lat: high.latitude, lng: high.longitude },
  };
  return isValidBounds(bounds) ? bounds : null;
}

/** Places Text Search `locationRestriction` gövdesi (yalnızca dikdörtgen desteklenir). */
export function toPlacesRectangle(bounds: TileBounds): {
  rectangle: { low: { latitude: number; longitude: number }; high: { latitude: number; longitude: number } };
} {
  return {
    rectangle: {
      low: { latitude: bounds.low.lat, longitude: bounds.low.lng },
      high: { latitude: bounds.high.lat, longitude: bounds.high.lng },
    },
  };
}
