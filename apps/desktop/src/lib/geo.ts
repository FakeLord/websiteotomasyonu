export interface LatLng {
  lat: number;
  lng: number;
}

/** Şehir seçicisindeki illerin yaklaşık merkezleri (harita ilk konumu için). */
export const CITY_CENTERS: Record<string, LatLng> = {
  İstanbul: { lat: 41.0082, lng: 28.9784 },
  Ankara: { lat: 39.9334, lng: 32.8597 },
  İzmir: { lat: 38.4237, lng: 27.1428 },
  Bursa: { lat: 40.1885, lng: 29.061 },
  Antalya: { lat: 36.8969, lng: 30.7133 },
  Kocaeli: { lat: 40.7654, lng: 29.9408 },
  Konya: { lat: 37.8746, lng: 32.4932 },
  Adana: { lat: 37.0, lng: 35.3213 },
  Gaziantep: { lat: 37.0662, lng: 37.3833 },
  Mersin: { lat: 36.8121, lng: 34.6415 },
  Kayseri: { lat: 38.7205, lng: 35.4826 },
  Eskişehir: { lat: 39.7767, lng: 30.5206 },
  Tekirdağ: { lat: 40.978, lng: 27.511 },
  Muğla: { lat: 37.2153, lng: 28.3636 },
  Sakarya: { lat: 40.7569, lng: 30.3781 },
  Samsun: { lat: 41.2867, lng: 36.33 },
  Trabzon: { lat: 41.0027, lng: 39.7168 },
  Diyarbakır: { lat: 37.9144, lng: 40.2306 },
};

export const TURKEY_CENTER: LatLng = { lat: 39.0, lng: 35.2433 };
