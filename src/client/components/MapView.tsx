import { useEffect, useRef } from "react";
import L from "leaflet";
import { LocateControl } from "leaflet.locatecontrol";
import "leaflet.locatecontrol/dist/L.Control.Locate.min.css";
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
  /** Bump this to refit the map to the whole game area (e.g. on claim/reveal). */
  refitNonce?: number;
}

export function MapView({ features, fitSignature, className, refitNonce }: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const lastFitRef = useRef<string>("");
  const lastRefitRef = useRef<number>(0);

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

    // Standard Leaflet.Locate control (top-left) for the device's position.
    new LocateControl({
      position: "topleft",
      flyTo: true,
      showPopup: false,
      setView: "untilPanOrZoom",
      strings: { title: "Show my location" },
    }).addTo(map);

    mapRef.current = map;
    setTimeout(() => map.invalidateSize(), 60);
    return () => {
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
      // Reset fit tracking so a freshly recreated map instance refits.
      lastFitRef.current = "";
      lastRefitRef.current = 0;
    };
  }, []);

  // Render features whenever they change; (re)fit on signature or refit changes.
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

    const shouldInitialFit = fitSignature !== lastFitRef.current;
    const shouldRefit = (refitNonce ?? 0) !== lastRefitRef.current;
    if (bounds.isValid() && (shouldInitialFit || shouldRefit)) {
      // animate:false so the fit always applies even if rapid claims overlap.
      map.fitBounds(bounds, { padding: [24, 24], maxZoom: 15, animate: false });
      lastFitRef.current = fitSignature;
      lastRefitRef.current = refitNonce ?? 0;
    }
  }, [features, fitSignature, refitNonce]);

  return <div ref={containerRef} className={className ?? "map grow"} />;
}
