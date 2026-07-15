import { useEffect, useRef } from "react";
import L from "leaflet";
import type { Area } from "../../shared/types";

export interface MapFeature {
  area: Area;
  style: L.PathOptions;
  onClick?: () => void;
  tooltip?: string;
}

interface MapViewProps {
  features: MapFeature[];
  /** When this string changes, the map refits its bounds to the features. */
  fitSignature: string;
  className?: string;
}

export function MapView({ features, fitSignature, className }: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const lastFitRef = useRef<string>("");

  // Create the map once.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, {
      zoomControl: true,
      attributionControl: true,
    }).setView([20, 0], 2);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap contributors",
    }).addTo(map);
    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    // Leaflet often mounts inside a flex/absolute container before layout settles.
    setTimeout(() => map.invalidateSize(), 60);
    return () => {
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
  }, []);

  // Render features whenever they change.
  useEffect(() => {
    const map = mapRef.current;
    const group = layerRef.current;
    if (!map || !group) return;
    group.clearLayers();
    const bounds = L.latLngBounds([]);

    for (const f of features) {
      const gj = L.geoJSON(
        { type: "Feature", properties: {}, geometry: f.area.geometry } as never,
        {
          style: () => f.style,
          onEachFeature: (_feat, layer) => {
            if (f.onClick) layer.on("click", f.onClick);
            if (f.tooltip)
              layer.bindTooltip(f.tooltip, { direction: "center", sticky: false });
          },
        },
      );
      gj.addTo(group);
      const b = gj.getBounds();
      if (b.isValid()) bounds.extend(b);
    }

    if (bounds.isValid() && fitSignature !== lastFitRef.current) {
      map.fitBounds(bounds, { padding: [24, 24], maxZoom: 15 });
      lastFitRef.current = fitSignature;
    }
  }, [features, fitSignature]);

  return <div ref={containerRef} className={className ?? "map grow"} />;
}
