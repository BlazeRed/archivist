import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import type { Image } from '../types';

export interface ImageLocation {
  id: string;
  latitude: number;
  longitude: number;
}

interface MapState {
  locations: ImageLocation[];
  loading: boolean;
  error: string | null;
  fetchLocations: () => Promise<void>;
  clearLocations: () => void;
}

export const useMapStore = create<MapState>((set) => ({
  locations: [],
  loading: false,
  error: null,

  fetchLocations: async () => {
    set({ loading: true, error: null });
    try {
      let locations = await invoke<ImageLocation[]>('get_image_locations');
      if (import.meta.env.DEV && locations.length === 0) {
        locations = mockLocations(await invoke<Image[]>('get_all_images'));
      }
      set({ locations, loading: false });
    } catch (e) {
      set({ error: String(e), loading: false });
    }
  },

  clearLocations: () => set({ locations: [] }),
}));

// ponytail: dev-only fake coordinates for the archive's real media, so the map (pins, clusters, preview)
// can be tested without geotagged photos. Kicks in only in `tauri dev` and only when no media has GPS.
function mockLocations(images: Image[]): ImageLocation[] {
  const places: [number, number, number][] = [
    // lat, lng, weight
    [45.4642, 9.19, 40],    // Milano
    [41.9028, 12.4964, 25], // Roma
    [43.7696, 11.2558, 12], // Firenze
    [46.4983, 11.3548, 8],  // Bolzano
    [48.8566, 2.3522, 15],  // Paris
    [40.7128, -74.006, 6],  // New York
    [35.6762, 139.6503, 3], // Tokyo
  ];
  let seed = 1;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5;
  // Each place gets a share of the media proportional to its weight
  const slots = places.flatMap(([lat, lng, n]) => Array.from({ length: n }, () => [lat, lng] as const));
  return images.map((img, i) => {
    const [lat, lng] = slots[i % slots.length];
    return { id: img.id, latitude: lat + rand() * 0.08, longitude: lng + rand() * 0.08 };
  });
}
