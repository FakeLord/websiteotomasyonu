import { useEffect } from "react";
import { Circle, CircleMarker, MapContainer, Popup, TileLayer, useMap, useMapEvents } from "react-leaflet";
import type { LatLng } from "../../lib/geo";
import { tr } from "../../i18n/tr";
import { THEME, scoreColor } from "../../lib/theme-colors";

export interface MapBusiness {
  id: string;
  name: string;
  category: string | null;
  district: string | null;
  lat: number;
  lng: number;
  lead_score: number;
  website_status: string | null;
  rating: number | null;
  review_count: number | null;
  contact_channels?: Array<{ channel: string; status: string | null }>;
}

function CenterTracker({ onCenterChange }: { onCenterChange: (center: LatLng) => void }) {
  useMapEvents({
    moveend: (e) => {
      const c = e.target.getCenter();
      onCenterChange({ lat: c.lat, lng: c.lng });
    },
  });
  return null;
}

function FlyTo({ target, zoom }: { target: LatLng | null; zoom: number }) {
  const map = useMap();
  useEffect(() => {
    if (target) map.flyTo([target.lat, target.lng], zoom, { duration: 0.6 });
  }, [map, target, zoom]);
  return null;
}

function FitToResults({ fitKey, businesses }: { fitKey: string | null; businesses: MapBusiness[] }) {
  const map = useMap();
  const hasResults = businesses.length > 0;
  useEffect(() => {
    if (!fitKey || !hasResults) return;
    const lats = businesses.map((b) => b.lat);
    const lngs = businesses.map((b) => b.lng);
    map.fitBounds(
      [
        [Math.min(...lats), Math.min(...lngs)],
        [Math.max(...lats), Math.max(...lngs)],
      ],
      { padding: [40, 40], maxZoom: 15 },
    );
    // Yalnızca arama (fitKey) değiştiğinde odaklan; filtre değişiminde harita yerinde kalsın.
  }, [fitKey, hasResults, map]);
  return null;
}

interface DiscoverMapProps {
  fitKey: string | null;
  initialCenter: LatLng;
  flyTarget: LatLng | null;
  flyZoom: number;
  businesses: MapBusiness[];
  selectedId: string | null;
  radiusMeters: number | null;
  searchCenter: LatLng;
  onCenterChange: (center: LatLng) => void;
  onSelect: (id: string) => void;
  renderPopup: (business: MapBusiness) => React.ReactNode;
}

export function DiscoverMap({
  fitKey,
  initialCenter,
  flyTarget,
  flyZoom,
  businesses,
  selectedId,
  radiusMeters,
  searchCenter,
  onCenterChange,
  onSelect,
  renderPopup,
}: DiscoverMapProps) {
  return (
    <MapContainer center={[initialCenter.lat, initialCenter.lng]} zoom={11} className="h-full w-full" zoomControl>
      <TileLayer
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution={tr.discover.mapAttribution}
        maxZoom={19}
      />
      <CenterTracker onCenterChange={onCenterChange} />
      <FlyTo target={flyTarget} zoom={flyZoom} />
      <FitToResults fitKey={fitKey} businesses={businesses} />
      {radiusMeters && (
        <Circle
          center={[searchCenter.lat, searchCenter.lng]}
          radius={radiusMeters}
          pathOptions={{ color: THEME.primary, weight: 1, fillColor: THEME.primary, fillOpacity: 0.06 }}
        />
      )}
      {businesses.map((b) => (
        <CircleMarker
          key={b.id}
          center={[b.lat, b.lng]}
          radius={selectedId === b.id ? 10 : 7}
          pathOptions={{
            color: selectedId === b.id ? THEME.text : THEME.surface,
            weight: 2,
            fillColor: scoreColor(b.lead_score),
            fillOpacity: 0.95,
          }}
          eventHandlers={{ click: () => onSelect(b.id) }}
        >
          <Popup>{renderPopup(b)}</Popup>
        </CircleMarker>
      ))}
    </MapContainer>
  );
}
