import { useEffect, useRef } from "react";
import L from "leaflet";
import type { Vendor } from "@/lib/vendors";
import { BOBO_CENTER } from "@/lib/vendors";

// Fix default marker icon paths (we use custom DivIcon anyway)
delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl;

interface VendorMapProps {
  vendors: Vendor[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function VendorMap({ vendors, selectedId, onSelect }: VendorMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<Map<string, L.Marker>>(new Map());

  // Init map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, {
      center: BOBO_CENTER,
      zoom: 13,
      zoomControl: true,
    });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://osm.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map);
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      markersRef.current.clear();
    };
  }, []);

  // Sync markers with vendors
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const existingIds = new Set(markersRef.current.keys());
    const nextIds = new Set(vendors.map((v) => v.id));

    // Remove gone
    existingIds.forEach((id) => {
      if (!nextIds.has(id)) {
        markersRef.current.get(id)?.remove();
        markersRef.current.delete(id);
      }
    });

    // Add/update
    vendors.forEach((v) => {
      const isSelected = v.id === selectedId;
      const icon = L.divIcon({
        className: "",
        html: `<div class="gaz-marker stock-${v.stock}" style="${isSelected ? "transform:scale(1.25);outline:3px solid var(--color-primary);outline-offset:2px;" : ""}">${
          v.stock === "out" ? "✕" : v.stock === "low" ? "!" : "✓"
        }</div>`,
        iconSize: [36, 36],
        iconAnchor: [18, 18],
      });
      let marker = markersRef.current.get(v.id);
      if (!marker) {
        marker = L.marker([v.lat, v.lng], { icon }).addTo(map);
        marker.on("click", () => onSelect(v.id));
        markersRef.current.set(v.id, marker);
      } else {
        marker.setLatLng([v.lat, v.lng]);
        marker.setIcon(icon);
      }
    });
  }, [vendors, selectedId, onSelect]);

  // Pan to selection
  useEffect(() => {
    if (!mapRef.current || !selectedId) return;
    const v = vendors.find((x) => x.id === selectedId);
    if (v) mapRef.current.flyTo([v.lat, v.lng], 15, { duration: 0.6 });
  }, [selectedId, vendors]);

  return <div ref={containerRef} className="h-full w-full" />;
}
