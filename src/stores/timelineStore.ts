import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import type { Image, GroupWithCount } from '../types';

export interface TimelineFilter {
  year: number | null;
  month: number | null;
  noDate: boolean;
  groupId: number | null;
}

interface TimelineState {
  allImages: Image[];
  images: Image[];
  loading: boolean;
  error: string | null;
  selectedImage: Image | null;
  filter: TimelineFilter;
  availableYears: number[];
  availableGroups: GroupWithCount[];
  fetchImages: () => Promise<void>;
  fetchGroups: () => Promise<void>;
  setFilter: (partial: Partial<TimelineFilter>) => Promise<void>;
  selectImage: (image: Image | null) => void;
}

function applyClientFilter(all: Image[], filter: TimelineFilter, groupIds: Set<string> | null): Image[] {
  let result = all;

  if (filter.groupId !== null && groupIds !== null) {
    result = result.filter(img => groupIds.has(img.id));
  }

  if (filter.noDate) {
    return result.filter(img => !img.taken_at);
  }

  if (filter.year !== null) {
    result = result.filter(img => {
      if (!img.taken_at) return false;
      return new Date(img.taken_at).getFullYear() === filter.year;
    });
    if (filter.month !== null) {
      result = result.filter(img => {
        if (!img.taken_at) return false;
        return new Date(img.taken_at).getMonth() + 1 === filter.month;
      });
    }
  }

  return result;
}

export const useTimelineStore = create<TimelineState>((set, get) => ({
  allImages: [],
  images: [],
  loading: false,
  error: null,
  selectedImage: null,
  filter: { year: null, month: null, noDate: false, groupId: null },
  availableYears: [],
  availableGroups: [],

  fetchImages: async () => {
    set({ loading: true, error: null });
    try {
      const allImages = await invoke<Image[]>('get_all_images');
      const years = [...new Set(
        allImages.filter(img => img.taken_at).map(img => new Date(img.taken_at!).getFullYear())
      )].sort((a, b) => b - a);

      const { filter } = get();
      let groupIds: Set<string> | null = null;
      if (filter.groupId !== null) {
        const ids = await invoke<string[]>('get_images_in_group', { groupId: filter.groupId });
        groupIds = new Set(ids);
      }

      const images = applyClientFilter(allImages, filter, groupIds);
      set({ allImages, images, availableYears: years, loading: false });
    } catch (e) {
      set({ error: String(e), loading: false });
    }
  },

  fetchGroups: async () => {
    try {
      const availableGroups = await invoke<GroupWithCount[]>('get_all_groups');
      set({ availableGroups });
    } catch {
      // non-critical
    }
  },

  setFilter: async (partial) => {
    const newFilter = { ...get().filter, ...partial };
    // reset month when year cleared, reset noDate/groupId when incompatible
    if (partial.year !== undefined && partial.year === null) newFilter.month = null;
    if (partial.noDate) { newFilter.year = null; newFilter.month = null; newFilter.groupId = null; }
    if (partial.groupId !== undefined && partial.groupId !== null) newFilter.noDate = false;

    set({ filter: newFilter });

    const { allImages } = get();
    let groupIds: Set<string> | null = null;
    if (newFilter.groupId !== null) {
      try {
        const ids = await invoke<string[]>('get_images_in_group', { groupId: newFilter.groupId });
        groupIds = new Set(ids);
      } catch {
        groupIds = new Set();
      }
    }

    set({ images: applyClientFilter(allImages, newFilter, groupIds) });
  },

  selectImage: (image) => set({ selectedImage: image }),
}));
