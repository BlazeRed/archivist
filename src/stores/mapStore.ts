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
    try {
      const locations = await invoke<ImageLocation[]>('get_image_locations');
      set({ locations, loading: false });
    } catch (e) {
      set({ error: String(e), loading: false });
    }
  },

  clearLocations: () => set({ locations: [] }),
}));
