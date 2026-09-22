import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { open } from '@tauri-apps/plugin-dialog';
import { invoke } from '@tauri-apps/api/core';
import { toast } from 'sonner';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useAppConfigStore } from '../stores/appConfigStore';
import { useMapStore } from '../stores/mapStore';
import { useTimelineStore } from '../stores/timelineStore';
import { useGroupStore } from '../stores/dataStore';
import { useRescan } from '../hooks/useRescan';
import { Button } from '@/components/ui/button';

const CLUSTER_SOURCE_ID = 'image-locations';

function locationsToGeoJSON(locations: { id: string; latitude: number; longitude: number }[]): GeoJSON.FeatureCollection {
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
function fitToLocations(map: maplibregl.Map, locations: { latitude: number; longitude: number }[]) {
  if (locations.length === 0) return;
  const bounds = locations.reduce(
    (b, loc) => b.extend([loc.longitude, loc.latitude]),
    new maplibregl.LngLatBounds(
      [locations[0].longitude, locations[0].latitude],
      [locations[0].longitude, locations[0].latitude]
    )
  );
  map.fitBounds(bounds, { padding: 50, maxZoom: 12, duration: 0 });
}

export function MapPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { config, setConfig } = useAppConfigStore();
  const { locations, fetchLocations, clearLocations } = useMapStore();
  const clearGroups = useGroupStore((s) => s.clearGroups);
  const { isRescanning, handleRescan } = useRescan();
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);

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

  const handleOpenArchive = async () => {
    const selected = await open({ directory: true });
    if (selected) {
      useTimelineStore.getState().clearImages();
      useTimelineStore.getState().selectImage(null);
      clearGroups();
      clearLocations();
      try { await invoke('init_archive', { archivePath: selected }); } catch { /* non-critical */ }
      setConfig({ archive_path: selected as string });
    }
  };

  const canShowMap = !!config.archive_path && isOnline && locations.length > 0;

  useEffect(() => {
    if (!canShowMap || !mapContainerRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: {
        version: 8,
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
      center: [0, 20],
      zoom: 1.2,
    });
    mapRef.current = map;

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');

    map.on('error', (e) => {
      // Tile fetch failures (flaky connection, captive portal, etc.) — surface
      // once rather than leaving blank/grey tiles with no explanation.
      console.error('MapLibre error:', e.error);
      toast.error(t('map.tileLoadError'));
    });

    map.on('load', () => {
      map.addSource(CLUSTER_SOURCE_ID, {
        type: 'geojson',
        data: locationsToGeoJSON(locations),
        cluster: true,
        clusterRadius: 50,
        clusterMaxZoom: 14,
      });

      map.addLayer({
        id: 'clusters',
        type: 'circle',
        source: CLUSTER_SOURCE_ID,
        filter: ['has', 'point_count'],
        paint: {
          'circle-color': '#0084C5',
          'circle-radius': ['step', ['get', 'point_count'], 16, 10, 22, 50, 28],
          'circle-opacity': 0.85,
        },
      });

      map.addLayer({
        id: 'cluster-count',
        type: 'symbol',
        source: CLUSTER_SOURCE_ID,
        filter: ['has', 'point_count'],
        layout: {
          'text-field': '{point_count_abbreviated}',
          'text-size': 12,
        },
        paint: { 'text-color': '#ffffff' },
      });

      map.addLayer({
        id: 'unclustered-point',
        type: 'circle',
        source: CLUSTER_SOURCE_ID,
        filter: ['!', ['has', 'point_count']],
        paint: {
          'circle-color': '#0084C5',
          'circle-radius': 7,
          'circle-stroke-width': 2,
          'circle-stroke-color': '#ffffff',
        },
      });

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

      fitToLocations(map, locations);
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canShowMap, config.archive_path]);

  // Refresh pin data on an already-mounted map (e.g. after fetchLocations resolves later)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.getSource(CLUSTER_SOURCE_ID)) return;
    const source = map.getSource(CLUSTER_SOURCE_ID) as maplibregl.GeoJSONSource;
    source.setData(locationsToGeoJSON(locations));
  }, [locations]);

  if (!config.archive_path) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-52px)]">
        <div className="bg-card px-8 py-6 rounded-xl text-center max-w-sm">
          <p className="text-muted-foreground text-sm mb-4">{t('timeline.archiveNotSet')}</p>
          <Button onClick={handleOpenArchive}>{t('timeline.openArchive')}</Button>
        </div>
      </div>
    );
  }

  if (!isOnline) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-52px)]">
        <div className="bg-card px-8 py-6 rounded-xl text-center max-w-md">
          <p className="text-foreground font-medium mb-2">{t('map.offlineTitle')}</p>
          <p className="text-muted-foreground text-sm mb-4">{t('map.offlineBody')}</p>
          <Button onClick={retryConnection}>{t('map.retry')}</Button>
        </div>
      </div>
    );
  }

  if (locations.length === 0) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-52px)]">
        <div className="bg-card px-8 py-6 rounded-xl text-center max-w-sm">
          <p className="text-muted-foreground text-sm mb-2">{t('map.noLocations')}</p>
          <p className="text-muted-foreground text-xs mb-4">{t('map.noLocationsHint')}</p>
          <Button onClick={handleRescan} disabled={isRescanning}>
            {isRescanning ? t('common.loading') : t('settings.rescanArchive')}
          </Button>
        </div>
      </div>
    );
  }

  return <div ref={mapContainerRef} className="h-[calc(100vh-52px)] w-full" />;
}
