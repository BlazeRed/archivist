import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import type { Image } from '../types';

interface TimelineFilter {
  year: number | null;
  month: number | null;
}

interface TimelineState {
  images: Image[];
  loading: boolean;
  error: string | null;
  selectedImage: Image | null;
  filter: TimelineFilter;
  availableYears: number[];
  fetchImages: () => Promise<void>;
  fetchImagesByDate: (year: number, month?: number) => Promise<void>;
  setFilter: (filter: Partial<TimelineFilter>) => void;
  selectImage: (image: Image | null) => void;
}

export const useTimelineStore = create<TimelineState>((set, get) => ({
  images: [],
  loading: false,
  error: null,
  selectedImage: null,
  filter: { year: null, month: null },
  availableYears: [],

  fetchImages: async () => {
    set({ loading: true, error: null });
    try {
      const images = await invoke<Image[]>('get_all_images');
      const years = [...new Set(images.map(img => 
        img.taken_at ? new Date(img.taken_at).getFullYear() : new Date(img.imported_at).getFullYear()
      ))].sort((a, b) => b - a);
      
      set({ images, availableYears: years, loading: false });
    } catch (e) {
      set({ error: String(e), loading: false });
    }
  },

  fetchImagesByDate: async (year: number, month?: number) => {
    set({ loading: true, error: null });
    try {
      const images = await invoke<Image[]>('get_images_by_date', { year, month });
      set({ images, loading: false });
    } catch (e) {
      set({ error: String(e), loading: false });
    }
  },

  setFilter: (filter: Partial<TimelineFilter>) => {
    const newFilter = { ...get().filter, ...filter };
    set({ filter: newFilter });
    
    if (newFilter.year) {
      get().fetchImagesByDate(newFilter.year, newFilter.month || undefined);
    } else {
      get().fetchImages();
    }
  },

  selectImage: (image) => set({ selectedImage: image }),
}));