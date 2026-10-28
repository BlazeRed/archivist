import { useEffect, useRef, useState, useCallback, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { MinusIcon, PlusIcon, ScanIcon } from 'lucide-react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useAppConfigStore } from '../stores/appConfigStore';
import { useMapStore, type ImageLocation } from '../stores/mapStore';
import { useTimelineStore } from '../stores/timelineStore';
import { useRescan } from '../hooks/useRescan';
import { ArchiveNotSet } from '../components/ArchiveNotSet';
import { InfoPill } from '../components/FloatingSelectionBar';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

const CLUSTER_SOURCE_ID = 'image-locations';
// Symbol layers (cluster counts) need a glyph server; the raster OSM style has none of its own
const GLYPHS_URL = 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf';

function locationsToGeoJSON(locations: ImageLocation[]): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: locations.map((loc) => ({
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: [loc.longitude, loc.latitude] },
      properties: { id: loc.id },
    })),
  };
}

/** Frames the view on every known pin, so the map opens already zoomed to "where you've been" instead of a blank world view. */
function fitToLocations(map: maplibregl.Map, locations: ImageLocation[], duration = 0) {
  if (locations.length === 0) return;
  const bounds = locations.reduce(
    (b, loc) => b.extend([loc.longitude, loc.latitude]),
    new maplibregl.LngLatBounds(
      [locations[0].longitude, locations[0].latitude],
      [locations[0].longitude, locations[0].latitude]
    )
  );
  // Top padding clears the floating topbar + row
  map.fitBounds(bounds, { padding: { top: 140, bottom: 60, left: 60, right: 80 }, maxZoom: 12, duration });
}

/** MapLibre paints on a canvas and cannot read CSS vars: copy the theme tokens into the layer paint */
function applyThemeColors(map: maplibregl.Map) {
  if (!map.getLayer('clusters')) return;
  const style = getComputedStyle(document.documentElement);
  const token = (name: string) => style.getPropertyValue(name).trim();
  const primary = token('--primary');
  const surface = token('--popover');
  map.setPaintProperty('clusters', 'circle-color', primary);
  map.setPaintProperty('clusters', 'circle-stroke-color', surface);
  map.setPaintProperty('cluster-count', 'text-color', token('--primary-foreground'));
  map.setPaintProperty('unclustered-point', 'circle-color', primary);
  map.setPaintProperty('unclustered-point', 'circle-stroke-color', surface);
}

/** Centered floating card over the page (offline, no locations) */
function MapCard({ children }: { children: ReactNode }) {
  return (
    <div className="squircle pointer-events-auto bg-popover ring-1 ring-frame shadow-overlay px-8 py-6 rounded-xl text-center max-w-md animate-in fade-in duration-200">
      {children}
    </div>
  );
}

function MapControl({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon-lg" onClick={onClick} aria-label={label} className="text-muted-foreground hover:text-foreground">
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="left">{label}</TooltipContent>
    </Tooltip>
  );
}

export function MapPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { config } = useAppConfigStore();
  const { locations, loading, fetchLocations, clearLocations } = useMapStore();
  const { isRescanning, handleRescan } = useRescan();
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  // Read by the map's load handler, which runs after locations may already have changed
  const locationsRef = useRef(locations);
  locationsRef.current = locations;

  useEffect(() => {
    const goOnline = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  const retryConnection = useCallback(() => setIsOnline(navigator.onLine), []);

  useEffect(() => {
    if (config.archive_path) {
      fetchLocations();
    } else {
      clearLocations();
    }
  }, [config.archive_path, fetchLocations, clearLocations]);

  // The map stays visible even with zero locations: the empty state floats over it
  const canShowMap = !!config.archive_path && isOnline;

  useEffect(() => {
    if (!canShowMap || !mapContainerRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: {
        version: 8,
        glyphs: GLYPHS_URL,
        sources: {
          osm: {
            type: 'raster',
            tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
            tileSize: 256,
            attribution: '&copy; OpenStreetMap contributors',
          },
        },
        layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
      },
      center: [12, 42],
      zoom: 1.6,
      attributionControl: false,
    });
    mapRef.current = map;

    // Bottom-left: the bottom-right corner hosts the zoom pill
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-left');

    map.on('error', (e) => {
      // Tile fetch failures (flaky connection, captive portal, etc.) — one toast (fixed id),
      // not one per failed tile, instead of leaving blank tiles with no explanation.
      console.error('MapLibre error:', e.error);
      toast.error(t('map.tileLoadError'), { id: 'map-tile-error' });
    });

    map.on('load', () => {
      map.addSource(CLUSTER_SOURCE_ID, {
        type: 'geojson',
        data: locationsToGeoJSON(locationsRef.current),
        cluster: true,
        clusterRadius: 50,
        clusterMaxZoom: 14,
      });

      // Colors are placeholders, set from the theme tokens by applyThemeColors
      map.addLayer({
        id: 'clusters',
        type: 'circle',
        source: CLUSTER_SOURCE_ID,
        filter: ['has', 'point_count'],
        paint: {
          'circle-radius': ['step', ['get', 'point_count'], 16, 10, 22, 50, 28],
          'circle-stroke-width': 3,
        },
      });

      map.addLayer({
        id: 'cluster-count',
        type: 'symbol',
        source: CLUSTER_SOURCE_ID,
        filter: ['has', 'point_count'],
        layout: {
          'text-field': '{point_count_abbreviated}',
          'text-font': ['Open Sans Semibold'],
          'text-size': 12,
        },
      });

      map.addLayer({
        id: 'unclustered-point',
        type: 'circle',
        source: CLUSTER_SOURCE_ID,
        filter: ['!', ['has', 'point_count']],
        paint: {
          'circle-radius': 7,
          'circle-stroke-width': 2,
        },
      });

      applyThemeColors(map);

      map.on('click', 'clusters', (e: maplibregl.MapLayerMouseEvent) => {
        const features = map.queryRenderedFeatures(e.point, { layers: ['clusters'] });
        const clusterId = features[0]?.properties?.cluster_id;
        if (clusterId == null) return;
        const source = map.getSource(CLUSTER_SOURCE_ID) as maplibregl.GeoJSONSource;
        source.getClusterExpansionZoom(clusterId).then((zoom: number) => {
          const coords = (features[0].geometry as GeoJSON.Point).coordinates as [number, number];
          map.easeTo({ center: coords, zoom });
        });
      });

      map.on('click', 'unclustered-point', (e: maplibregl.MapLayerMouseEvent) => {
        const feature = e.features?.[0];
        if (!feature) return;
        const [lng, lat] = (feature.geometry as GeoJSON.Point).coordinates as [number, number];
        useTimelineStore.getState().setFilter({ location: { lat, lng } });
        navigate('/');
      });

      map.on('mouseenter', 'clusters', () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', 'clusters', () => { map.getCanvas().style.cursor = ''; });
      map.on('mouseenter', 'unclustered-point', () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', 'unclustered-point', () => { map.getCanvas().style.cursor = ''; });

      fitToLocations(map, locationsRef.current);
    });

    // Theme switch (Settings or OS while on 'system') toggles `.dark` on <html>
    const themeObserver = new MutationObserver(() => applyThemeColors(map));
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

    return () => {
      themeObserver.disconnect();
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canShowMap, config.archive_path]);

  // Refresh pins on an already-loaded map (fetchLocations resolved after load, rescan)
  useEffect(() => {
    const map = mapRef.current;
    const source = map?.getSource(CLUSTER_SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
    if (!map || !source) return;
    source.setData(locationsToGeoJSON(locations));
    fitToLocations(map, locations);
  }, [locations]);

  if (!config.archive_path) return <ArchiveNotSet />;

  return (
    // Full-height, pulled up under the fixed topbar so the map runs beneath the floating chrome (like Timeline)
    <div className="relative h-screen -mt-[var(--topbar-offset)] bg-muted">
      {/* h-full, not absolute inset-0: maplibre's unlayered CSS forces `position: relative` on the container */}
      {canShowMap && <div ref={mapContainerRef} className="h-full w-full" />}

      {canShowMap && locations.length > 0 && (
        <>
          <div className="absolute right-4 z-10 top-[calc(var(--topbar-offset)+8px)]">
            <InfoPill>{t('map.located', { count: locations.length })}</InfoPill>
          </div>

          <div className="absolute bottom-3 right-3 z-10 flex flex-col p-1 rounded-full bg-popover shadow-float">
            <MapControl label={t('map.zoomIn')} onClick={() => mapRef.current?.zoomIn()}><PlusIcon /></MapControl>
            <MapControl label={t('map.zoomOut')} onClick={() => mapRef.current?.zoomOut()}><MinusIcon /></MapControl>
            <MapControl label={t('map.fitAll')} onClick={() => mapRef.current && fitToLocations(mapRef.current, locations, 300)}><ScanIcon /></MapControl>
          </div>
        </>
      )}

      {(!isOnline || (!loading && locations.length === 0)) && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center pt-[var(--topbar-offset)]">
          {!isOnline ? (
            <MapCard>
              <p className="text-foreground font-medium mb-2">{t('map.offlineTitle')}</p>
              <p className="text-muted-foreground text-sm mb-4">{t('map.offlineBody')}</p>
              <Button onClick={retryConnection}>{t('map.retry')}</Button>
            </MapCard>
          ) : (
            <MapCard>
              <p className="text-foreground text-sm mb-2">{t('map.noLocations')}</p>
              <p className="text-muted-foreground text-xs mb-4">{t('map.noLocationsHint')}</p>
              <Button variant="secondary" onClick={handleRescan} disabled={isRescanning}>
                {isRescanning ? t('common.loading') : t('settings.rescanArchive')}
              </Button>
            </MapCard>
          )}
        </div>
      )}
    </div>
  );
}
