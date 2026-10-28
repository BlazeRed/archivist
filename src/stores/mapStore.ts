import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';

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
    if (import.meta.env.DEV && import.meta.env.VITE_MOCK_LOCATIONS) {
      set({ locations: mockLocations(), loading: false });
      return;
    }
    try {
      const locations = await invoke<ImageLocation[]>('get_image_locations');
      set({ locations, loading: false });
    } catch (e) {
      set({ error: String(e), loading: false });
    }
  },

  clearLocations: () => set({ locations: [] }),
}));

// ponytail: dev-only fake pins to test the map without geotagged photos.
// Run with `VITE_MOCK_LOCATIONS=1 npm run tauri dev`. Clicking a single pin opens an empty Timeline (ids are fake).
function mockLocations(): ImageLocation[] {
  const places: [number, number, number][] = [
    // lat, lng, photo count
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
  return places.flatMap(([lat, lng, n], p) =>
    Array.from({ length: n }, (_, i) => ({ id: `mock-${p}-${i}`, latitude: lat + rand() * 0.08, longitude: lng + rand() * 0.08 }))
  );
}
