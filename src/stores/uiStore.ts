import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';

interface UIState {
  settingsOpen: boolean;
  toggleSettings: () => void;
  closeSettings: () => void;
  isRescanning: boolean;
  setIsRescanning: (v: boolean) => void;
  /** Bumped after thumbnails are regenerated in place, so every thumbnail
   *  <img> can append it as a cache-busting query param — the asset-protocol
   *  URL is otherwise unchanged (thumbnail paths are deterministic) and the
   *  WebView may keep serving the stale cached image. */
  thumbnailCacheBust: number;
  bumpThumbnailCacheBust: () => void;
  /** Items in the archive's Trash folder (topbar dot) */
  trashCount: number;
  refreshTrashCount: () => Promise<void>;
}

export const useUIStore = create<UIState>((set) => ({
  settingsOpen: false,
  toggleSettings: () => set((s) => ({ settingsOpen: !s.settingsOpen })),
  closeSettings: () => set({ settingsOpen: false }),
  isRescanning: false,
  setIsRescanning: (v) => set({ isRescanning: v }),
  thumbnailCacheBust: 0,
  bumpThumbnailCacheBust: () => set({ thumbnailCacheBust: Date.now() }),
  trashCount: 0,
  refreshTrashCount: async () => {
    try {
      set({ trashCount: await invoke<number>('get_trash_count') });
    } catch {
      set({ trashCount: 0 });
    }
  },
}));
