import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import type { Image, GroupWithCount } from '../types';

export interface TimelineFilter {
  yearFrom: number | null;
  yearTo: number | null;
  month: number | null;
  noDate: boolean;
  groupId: number | null;
  mediaType: 'all' | 'images' | 'videos';
}

interface TimelineState {
  allImages: Image[];
  images: Image[];
  loading: boolean;
  error: string | null;
  selectedImage: Image | null;
  previewImage: Image | null;
  filter: TimelineFilter;
  availableYears: number[];
  availableGroups: GroupWithCount[];
  fetchImages: () => Promise<void>;
  fetchGroups: () => Promise<void>;
  setFilter: (partial: Partial<TimelineFilter>) => Promise<void>;
  selectImage: (image: Image | null) => void;
  setPreviewImage: (image: Image | null) => void;
  updateImageFavourite: (imageId: string, isFavourite: boolean) => void;
  updateImageWebPath: (imageId: string, webPath: string) => void;
  clearImages: () => void;
}

function applyClientFilter(all: Image[], filter: TimelineFilter, groupIds: Set<string> | null): Image[] {
  let result = all;

  if (filter.mediaType !== 'all') {
    result = result.filter(img =>
      filter.mediaType === 'images' ? img.media_type === 'image' : img.media_type === 'video'
    );
  }

  if (filter.groupId !== null && groupIds !== null) {
    result = result.filter(img => groupIds.has(img.id));
  }

  if (filter.noDate) {
    return result.filter(img => !img.taken_at);
  }

  if (filter.yearFrom !== null && filter.yearTo !== null) {
    result = result.filter(img => {
      if (!img.taken_at) return false;
      const y = new Date(img.taken_at).getFullYear();
      return y >= filter.yearFrom! && y <= filter.yearTo!;
    });
    if (filter.yearFrom === filter.yearTo && filter.month !== null) {
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
  previewImage: null,
  filter: { yearFrom: null, yearTo: null, month: null, noDate: false, groupId: null, mediaType: 'all' },
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
      const { selectedImage, previewImage } = get();
      const newIds = new Set(allImages.map(img => img.id));
      set({
        allImages,
        images,
        availableYears: years,
        loading: false,
        selectedImage: selectedImage && !newIds.has(selectedImage.id) ? null : selectedImage,
        previewImage: previewImage && !newIds.has(previewImage.id) ? null : previewImage,
      });
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
    // reset month when year range cleared or spans multiple years
    if (partial.noDate) { newFilter.yearFrom = null; newFilter.yearTo = null; newFilter.month = null; newFilter.groupId = null; }
    if (newFilter.yearFrom === null || newFilter.yearTo === null || newFilter.yearFrom !== newFilter.yearTo) newFilter.month = null;
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
  setPreviewImage: (image) => set({ previewImage: image }),
  updateImageFavourite: (imageId, isFavourite) => set((s) => ({
    allImages: s.allImages.map(img => img.id === imageId ? { ...img, is_favourite: isFavourite } : img),
    images: s.images.map(img => img.id === imageId ? { ...img, is_favourite: isFavourite } : img),
    previewImage: s.previewImage?.id === imageId ? { ...s.previewImage, is_favourite: isFavourite } : s.previewImage,
  })),
  updateImageWebPath: (imageId, webPath) => set((s) => ({
    allImages: s.allImages.map(img => img.id === imageId ? { ...img, web_path: webPath } : img),
    images: s.images.map(img => img.id === imageId ? { ...img, web_path: webPath } : img),
    previewImage: s.previewImage?.id === imageId ? { ...s.previewImage, web_path: webPath } : s.previewImage,
    selectedImage: s.selectedImage?.id === imageId ? { ...s.selectedImage, web_path: webPath } : s.selectedImage,
  })),
  clearImages: () => set({ allImages: [], images: [], previewImage: null }),
}));
