import { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import "maplibre-gl/dist/maplibre-gl.css";
import type { CollegeMapProgram, MapBounds } from "@/lib/college-map";
import { Button } from "@/components/ui/button";
import { RotateCcw } from "lucide-react";

export default function CollegeMapCanvas({ programs, selectedId, onSelect, onBounds }: {
  programs: CollegeMapProgram[]; selectedId: string | null;
  onSelect: (id: string) => void; onBounds: (bounds: MapBounds) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const latest = useRef({ programs, selectedId, onSelect, onBounds });
  latest.current = { programs, selectedId, onSelect, onBounds };
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!container.current) return;
    maplibregl.setWorkerUrl(workerUrl);
    const map = new maplibregl.Map({ container: container.current,
      style: "https://tiles.openfreemap.org/styles/positron", center: [-97, 38], zoom: 3.4,
      attributionControl: { compact: true }, maxZoom: 16 });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    const publishBounds = () => {
      const b = map.getBounds();
      latest.current.onBounds([b.getWest(), b.getSouth(), b.getEast(), b.getNorth()]);
    };
    map.on("moveend", publishBounds);
    map.on("load", () => {
      const tokens = getComputedStyle(container.current ?? document.documentElement);
      const primary = tokens.getPropertyValue("--org-primary").trim();
      const accent = tokens.getPropertyValue("--org-accent").trim();
      const surface = tokens.getPropertyValue("--chalk").trim();
      map.addSource("colleges", { type: "geojson", data: { type: "FeatureCollection", features: [] }, cluster: true, clusterMaxZoom: 12, clusterRadius: 45 });
      map.addLayer({ id: "clusters", type: "circle", source: "colleges", filter: ["has", "point_count"], paint: {
        "circle-color": primary, "circle-radius": ["step", ["get", "point_count"], 18, 25, 23, 100, 29], "circle-stroke-color": surface, "circle-stroke-width": 2 } });
      map.addLayer({ id: "cluster-count", type: "symbol", source: "colleges", filter: ["has", "point_count"], layout: { "text-field": ["get", "point_count_abbreviated"], "text-size": 12 }, paint: { "text-color": surface } });
      map.addLayer({ id: "college-pins", type: "circle", source: "colleges", filter: ["!", ["has", "point_count"]], paint: {
        "circle-color": ["case", ["==", ["get", "selected"], true], accent, primary],
        "circle-radius": ["case", ["==", ["get", "selected"], true], 11, 7], "circle-stroke-color": surface, "circle-stroke-width": 2 } });
      map.on("click", "college-pins", (e) => {
        const id = e.features?.[0]?.properties?.["id"];
        if (typeof id === "string") latest.current.onSelect(id);
      });
      map.on("click", "clusters", async (e) => {
        const feature = e.features?.[0];
        const source = map.getSource("colleges") as maplibregl.GeoJSONSource | undefined;
        if (!feature || !source || feature.geometry.type !== "Point") return;
        const zoom = await source.getClusterExpansionZoom(Number(feature.properties?.["cluster_id"]));
        map.easeTo({ center: feature.geometry.coordinates as [number, number], zoom });
      });
      for (const layer of ["clusters", "college-pins"]) {
        map.on("mouseenter", layer, () => { map.getCanvas().style.cursor = "pointer"; });
        map.on("mouseleave", layer, () => { map.getCanvas().style.cursor = ""; });
      }
      setReady(true);
      publishBounds();
    });
    map.on("error", () => { if (!map.isStyleLoaded()) setFailed(true); });
    const observer = new ResizeObserver(() => map.resize());
    observer.observe(container.current);
    return () => { observer.disconnect(); map.remove(); mapRef.current = null; };
  }, []);

  useEffect(() => {
    const source = mapRef.current?.getSource("colleges") as maplibregl.GeoJSONSource | undefined;
    if (!ready || !source) return;
    source.setData({ type: "FeatureCollection", features: programs.flatMap((p) => p.coordinates ? [{
      type: "Feature" as const, geometry: { type: "Point" as const, coordinates: p.coordinates },
      properties: { id: p.id, selected: p.id === selectedId },
    }] : []) });
  }, [programs, selectedId, ready]);

  useEffect(() => {
    const p = latest.current.programs.find((p) => p.id === selectedId);
    if (p?.coordinates && mapRef.current && ready) mapRef.current.easeTo({ center: p.coordinates, zoom: Math.max(mapRef.current.getZoom(), 8) });
  }, [selectedId, ready]);

  return <div className="relative h-full min-h-80 w-full overflow-hidden bg-muted">
    <div ref={container} className="h-full w-full" aria-label="Interactive college map" />
    <Button variant="secondary" size="icon" aria-label="Reset map" title="Reset map" className="absolute right-3 top-24 z-10" onClick={() => mapRef.current?.easeTo({ center: [-97, 38], zoom: 3.4 })}><RotateCcw className="size-4" /></Button>
    {!ready && !failed ? <div className="pointer-events-none absolute left-4 top-4 rounded-md bg-background px-3 py-2 text-sm text-foreground">Loading map…</div> : null}
    {failed && !ready ? <div role="alert" className="absolute left-4 right-16 top-4 rounded-md bg-background p-3 text-sm text-foreground">The map couldn’t load. College results are still available in List.</div> : null}
  </div>;
}