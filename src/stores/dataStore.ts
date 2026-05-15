import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import type { Image, GroupWithCount } from '../types';

interface ImageStore {
  images: Image[];
  loading: boolean;
  error: string | null;
  fetchImages: () => Promise<void>;
  clearImages: () => void;
}

export const useImageStore = create<ImageStore>((set) => ({
  images: [],
  loading: false,
  error: null,

  fetchImages: async () => {
    set({ loading: true, error: null });
    try {
      const images = await invoke<Image[]>('get_all_images');
      set({ images, loading: false });
    } catch (e) {
      set({ error: String(e), loading: false });
    }
  },

  clearImages: () => set({ images: [], loading: false, error: null }),
}));

interface GroupStore {
  groups: GroupWithCount[];
  loading: boolean;
  error: string | null;
  fetchGroups: () => Promise<void>;
  createGroup: (name: string) => Promise<number>;
  updateGroup: (id: number, name: string) => Promise<void>;
  deleteGroup: (id: number) => Promise<void>;
  clearGroups: () => void;
}

export const useGroupStore = create<GroupStore>((set, get) => ({
  groups: [],
  loading: false,
  error: null,

  fetchGroups: async () => {
    set({ loading: true, error: null });
    try {
      const groups = await invoke<GroupWithCount[]>('get_all_groups');
      set({ groups, loading: false });
    } catch (e) {
      set({ error: String(e), loading: false });
    }
  },

  createGroup: async (name: string) => {
    const id = await invoke<number>('create_group', { name });
    await get().fetchGroups();
    return id;
  },

  updateGroup: async (id: number, name: string) => {
    await invoke('update_group', { id, name });
    await get().fetchGroups();
  },

  deleteGroup: async (id: number) => {
    await invoke('delete_group', { id });
    await get().fetchGroups();
  },

  clearGroups: () => set({ groups: [], loading: false, error: null }),
}));