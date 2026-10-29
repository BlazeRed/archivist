import { useEffect, useRef, useState, useCallback, useMemo, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { MapPinIcon, MinusIcon, PlusIcon, ScanIcon } from 'lucide-react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
// maplibre v6 looks for its worker next to its own module (import.meta.url): Vite's dep pre-bundling moves it
// in dev and the tauri:// scheme disables that lookup in builds. Without a worker GeoJSON sources never load (no pins).
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import { useAppConfigStore } from '../stores/appConfigStore';
import { useMapStore, type ImageLocation } from '../stores/mapStore';
import { EMPTY_FILTER, useTimelineStore } from '../stores/timelineStore';
import { useRescan } from '../hooks/useRescan';
import { ArchiveNotSet } from '../components/ArchiveNotSet';
import { InfoPill } from '../components/FloatingSelectionBar';
import { PreviewCard } from '../components/ImagePreview';
import { ImageDetail } from '../components/ImageDetail';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { Image } from '../types';

maplibregl.setWorkerUrl(maplibreWorkerUrl);

const CLUSTER_SOURCE_ID = 'image-locations';
// OpenFreeMap: free vector basemap meant for apps, no API key (the repo is public), fonts included.
// Light/dark styles follow the app theme.
const basemapUrl = (dark: boolean) => `https://tiles.openfreemap.org/styles/${dark ? 'dark' : 'positron'}`;
const isDarkTheme = () => document.documentElement.classList.contains('dark');

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

const PREVIEW_W = 400;
const PIN_IMAGE = 'photo-pin';
const PIN_FOCUS_IMAGE = 'photo-pin-focus';
const PIN_PX = 40; // CSS px; rasterized at 2x for HiDPI
const FOCUS_ZOOM = 16; // past clusterMaxZoom: the focused photo shows as its own pin

/** Lucide's MapPin filled violet with a light outline + soft shadow, rasterized for a symbol layer:
 *  a plain dot gets lost in the OSM detail, a teardrop with a halo does not. */
async function pinImage(fill: string, outline: string): Promise<ImageData> {
  const svg = renderToStaticMarkup(<MapPinIcon size={PIN_PX} fill={fill} stroke={outline} strokeWidth={1.75} />);
  const img = new Image();
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  await img.decode();
  const scale = 2, pad = 4; // pad: room for the shadow
  const size = (PIN_PX + pad * 2) * scale;
  const ctx = new OffscreenCanvas(size, size).getContext('2d')!;
  ctx.shadowColor = 'rgba(0,0,0,.35)';
  ctx.shadowBlur = 3 * scale;
  ctx.shadowOffsetY = 1 * scale;
  ctx.drawImage(img, pad * scale, pad * scale, PIN_PX * scale, PIN_PX * scale);
  return ctx.getImageData(0, 0, size, size);
}

/** MapLibre paints on a canvas and cannot read CSS vars: copy the theme tokens into the layer paint */
async function applyThemeColors(map: maplibregl.Map) {
  if (!map.getLayer('clusters')) return;
  const style = getComputedStyle(document.documentElement);
  const token = (name: string) => style.getPropertyValue(name).trim();
  // Violet = places on the map (pins and clusters), surface-colored halo to lift them off the tiles
  const violet = token('--violet');
  const surface = token('--popover');
  map.setPaintProperty('clusters', 'circle-color', violet);
  map.setPaintProperty('clusters', 'circle-stroke-color', surface);
  map.setPaintProperty('cluster-count', 'text-color', token('--violet-foreground'));
  // Focused pin (preview open) = gold, like the gold ring of the previewed thumbnail in the Timeline
  const pins: [string, ImageData][] = [
    [PIN_IMAGE, await pinImage(violet, surface)],
    [PIN_FOCUS_IMAGE, await pinImage(token('--gold'), surface)],
  ];
  for (const [name, data] of pins) {
    if (map.hasImage(name)) map.updateImage(name, data);
    else map.addImage(name, data, { pixelRatio: 2 });
  }
}

/** Swaps the previewed photo's pin to the focus image and draws it above its neighbours. */
function highlightPin(map: maplibregl.Map, imageId: string | null) {
  if (!map.getLayer('unclustered-point')) return;
  const isFocused: maplibregl.ExpressionSpecification = ['==', ['get', 'id'], imageId ?? ''];
  map.setLayoutProperty('unclustered-point', 'icon-image', ['case', isFocused, PIN_FOCUS_IMAGE, PIN_IMAGE]);
  map.setLayoutProperty('unclustered-point', 'symbol-sort-key', ['case', isFocused, 1, 0]);
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
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}

export function MapPage() {
  const { t } = useTranslation();
  const { config } = useAppConfigStore();
  const { locations, loading, fetchLocations, clearLocations } = useMapStore();
  const { isRescanning, handleRescan } = useRescan();
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const allImages = useTimelineStore((s) => s.allImages);
  const navigate = useNavigate();
  const location = useLocation();
  // Set by the Timeline's "Map" pill: open zoomed on that photo instead of framing all pins (consumed once)
  const focusImageIdRef = useRef<string | null>(null);

  // The pin preview is the map's own (the Timeline keeps its preview while both pages stay mounted).
  // The record comes from the store, so favourite/transcode updates and trashing reach the card.
  const [pin, setPin] = useState<ImageLocation | null>(null);
  const pinRef = useRef(pin);
  pinRef.current = pin;
  const previewImage = useMemo(() => {
    const image = pin && allImages.find((img) => img.id === pin.id);
    // Pin coords win: identical for real GPS, and they show the dev mock coords in the metadata
    return image ? { ...image, latitude: pin.latitude, longitude: pin.longitude } : null;
  }, [pin, allImages]);

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  // The map outlives the page being hidden: rebuilt only for another archive
  const mapArchiveRef = useRef<string | null>(null);
  // Pins framed once per map: later refreshes (each visit, rescan) keep the user's view
  const framedRef = useRef(false);
  // Basemap the map shows (dark/light), to catch theme switches made while the page was hidden
  const mapDarkRef = useRef(false);
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

  // Esc closes the pin preview; the fullscreen viewer and open menus/dialogs own the key first
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      if ((e.target as Element | null)?.closest?.('[role="listbox"], [role="dialog"], [role="menu"]')) return;
      if (pinRef.current && !useTimelineStore.getState().selectedImage) setPin(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  /** Initial view: the photo the Timeline asked for (zoomed in, preview open), else every pin. */
  const frameView = useCallback((map: maplibregl.Map, locs: ImageLocation[]) => {
    const focus = focusImageIdRef.current && locs.find((l) => l.id === focusImageIdRef.current);
    if (!focus) {
      if (!framedRef.current && locs.length > 0) {
        fitToLocations(map, locs);
        framedRef.current = true;
      }
      return;
    }
    focusImageIdRef.current = null;
    framedRef.current = true;
    // Offset: centre the pin in the area left free by the preview card
    map.easeTo({ center: [focus.longitude, focus.latitude], zoom: FOCUS_ZOOM, offset: [-(PREVIEW_W + 24) / 2, 0], duration: 0 });
    setPin(focus);
  }, []);

  const showInTimeline = (image: Image) => {
    const { allImages, images, setFilter, setPreviewImage } = useTimelineStore.getState();
    // Active filters could hide the photo: drop them so the grid can scroll to it
    if (!images.some((img) => img.id === image.id)) setFilter(EMPTY_FILTER);
    // The stored record, without the pin coords (dev mock coords must not reach the Timeline)
    setPreviewImage(allImages.find((img) => img.id === image.id) ?? image);
    navigate('/');
  };

  // Each arrival from a "Map" pill focuses its photo; plain visits (topbar) carry no state and keep the view
  useEffect(() => {
    const id = (location.state as { focusImageId?: string } | null)?.focusImageId;
    if (!id) return;
    focusImageIdRef.current = id;
    const map = mapRef.current;
    // Map not built or not loaded yet: its load handler frames the focus
    if (!map?.getSource(CLUSTER_SOURCE_ID)) return;
    map.resize(); // the container was display:none while the page was hidden
    frameView(map, locationsRef.current);
  }, [location.key, frameView]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (config.archive_path) {
      fetchLocations();
      // Pin clicks look up the full media record here
      if (useTimelineStore.getState().allImages.length === 0) useTimelineStore.getState().fetchImages();
    } else {
      clearLocations();
    }
  }, [config.archive_path, fetchLocations, clearLocations]);

  // The map stays visible even with zero locations: the empty state floats over it
  const canShowMap = !!config.archive_path && isOnline;

  useEffect(() => {
    // The map outlives the page being hidden (this effect re-runs on every show): it's rebuilt
    // only when its container went away (offline, archive closed) or another archive is open
    if (mapRef.current && (!canShowMap || mapArchiveRef.current !== config.archive_path)) {
      mapRef.current.remove();
      mapRef.current = null;
    }
    if (!canShowMap || !mapContainerRef.current) return;

    const reused = !!mapRef.current;
    const map = mapRef.current ?? createMap(mapContainerRef.current);
    mapRef.current = map;
    mapArchiveRef.current = config.archive_path;

    function createMap(container: HTMLDivElement) {
      framedRef.current = false;
      setPin(null);
      mapDarkRef.current = isDarkTheme();
      const map = new maplibregl.Map({
        container,
        style: basemapUrl(mapDarkRef.current),
        center: [12, 42],
        zoom: 1.6,
        attributionControl: false,
      });

      // Bottom-left: the bottom-right corner hosts the zoom pill
      map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-left');

      map.on('error', (e) => {
        // Tile fetch failures (flaky connection, captive portal, etc.) — one toast (fixed id),
        // not one per failed tile, instead of leaving blank tiles with no explanation.
        console.error('MapLibre error:', e.error);
        toast.error(t('map.tileLoadError'), { id: 'map-tile-error' });
      });

      // Photo source + layers on top of the basemap. `style.load` fires on the first style and
      // again after each theme swap (setStyle drops everything not in the new basemap style).
      map.on('style.load', () => {
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
            'circle-radius': ['step', ['get', 'point_count'], 18, 10, 22, 50, 28],
            'circle-stroke-width': 3,
            'circle-stroke-opacity': 0.95,
          },
        });

        map.addLayer({
          id: 'cluster-count',
          type: 'symbol',
          source: CLUSTER_SOURCE_ID,
          filter: ['has', 'point_count'],
          layout: {
            'text-field': '{point_count_abbreviated}',
            'text-font': ['Noto Sans Bold'], // a font OpenFreeMap serves
            'text-size': 12,
          },
        });

        // Tip of the teardrop on the photo's coordinates; never hidden by collisions (clusters handle density)
        map.addLayer({
          id: 'unclustered-point',
          type: 'symbol',
          source: CLUSTER_SOURCE_ID,
          filter: ['!', ['has', 'point_count']],
          layout: {
            'icon-image': PIN_IMAGE,
            'icon-anchor': 'bottom',
            'icon-offset': [0, 3], // the shadow padding below the tip
            'icon-allow-overlap': true,
            'icon-ignore-placement': true,
          },
        });

        applyThemeColors(map);
        highlightPin(map, pinRef.current?.id ?? null);
      });

      // Listeners are on the map, not the style: register them once
      map.once('load', () => {
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

        map.on('click', (e: maplibregl.MapMouseEvent) => {
          const feature = map.queryRenderedFeatures(e.point, { layers: ['unclustered-point'] })[0];
          // Click on empty map closes the preview; cluster clicks are handled above
          if (!feature) {
            if (map.queryRenderedFeatures(e.point, { layers: ['clusters'] }).length === 0) setPin(null);
            return;
          }
          const [longitude, latitude] = (feature.geometry as GeoJSON.Point).coordinates as [number, number];
          setPin({ id: feature.properties?.id, latitude, longitude });
        });

        map.on('mouseenter', 'clusters', () => { map.getCanvas().style.cursor = 'pointer'; });
        map.on('mouseleave', 'clusters', () => { map.getCanvas().style.cursor = ''; });
        map.on('mouseenter', 'unclustered-point', () => { map.getCanvas().style.cursor = 'pointer'; });
        map.on('mouseleave', 'unclustered-point', () => { map.getCanvas().style.cursor = ''; });

        frameView(map, locationsRef.current);
      });
      return map;
    }

    // Theme switch (Settings or OS while on 'system') toggles `.dark` on <html>:
    // swap the basemap (style.load then rebuilds the photo layers), else just recolor them
    const syncTheme = () => {
      if (isDarkTheme() === mapDarkRef.current) { applyThemeColors(map); return; }
      mapDarkRef.current = isDarkTheme();
      map.setStyle(basemapUrl(mapDarkRef.current), { diff: false });
    };
    // The theme may have changed while the page was hidden
    if (reused && isDarkTheme() !== mapDarkRef.current) syncTheme();
    const themeObserver = new MutationObserver(syncTheme);
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

    return () => themeObserver.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canShowMap, config.archive_path]);

  useEffect(() => {
    if (mapRef.current) highlightPin(mapRef.current, previewImage?.id ?? null);
  }, [previewImage?.id]);

  // Refresh pins on an already-loaded map (fetchLocations resolved after load, rescan)
  useEffect(() => {
    const map = mapRef.current;
    const source = map?.getSource(CLUSTER_SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
    if (!map || !source) return;
    source.setData(locationsToGeoJSON(locations));
    frameView(map, locations);
  }, [locations, frameView]);

  if (!config.archive_path) return <ArchiveNotSet />;

  return (
    // Full-height, pulled up under the fixed topbar so the map runs beneath the floating chrome (like Timeline)
    <div className="relative h-screen -mt-[var(--topbar-offset)] bg-muted" style={{ '--map-preview-w': `${PREVIEW_W}px` } as React.CSSProperties}>
      {/* h-full, not absolute inset-0: maplibre's unlayered CSS forces `position: relative` on the container */}
      {canShowMap && <div ref={mapContainerRef} className="h-full w-full" />}

      {canShowMap && locations.length > 0 && (
        <>
          <div className="absolute right-4 z-10 top-[calc(var(--topbar-offset)+8px)]">
            <InfoPill className="gap-1.5 pl-3 text-violet-ink"><MapPinIcon />{t('map.located', { count: locations.length })}</InfoPill>
          </div>

          {/* Top-left, on the floating row of the count pill: clear of the preview card (right) and the attribution (bottom-left) */}
          <div className="absolute left-3 top-[calc(var(--topbar-offset)+8px)] z-10 flex flex-col p-1 rounded-full bg-popover shadow-float">
            <MapControl label={t('map.zoomIn')} onClick={() => mapRef.current?.zoomIn()}><PlusIcon /></MapControl>
            <MapControl label={t('map.zoomOut')} onClick={() => mapRef.current?.zoomOut()}><MinusIcon /></MapControl>
            <MapControl label={t('map.fitAll')} onClick={() => mapRef.current && fitToLocations(mapRef.current, locations, 300)}><ScanIcon /></MapControl>
          </div>

          {/* Floating preview of the clicked pin, same card as the Timeline column; below the count pill */}
          {previewImage && (
            <div className="squircle absolute right-3 bottom-3 z-10 w-(--map-preview-w) top-[calc(var(--topbar-offset)+52px)] rounded-xl bg-popover shadow-float ring-1 ring-frame overflow-hidden animate-in fade-in slide-in-from-right-4 duration-200">
              <PreviewCard
                image={previewImage}
                navImages={[previewImage]}
                onShowInTimeline={() => showInTimeline(previewImage)}
              />
            </div>
          )}
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

      {previewImage && <ImageDetail navImages={[previewImage]} />}
    </div>
  );
}
