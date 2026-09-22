import { create } from 'zustand';

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
}

export const useUIStore = create<UIState>((set) => ({
  settingsOpen: false,
  toggleSettings: () => set((s) => ({ settingsOpen: !s.settingsOpen })),
  closeSettings: () => set({ settingsOpen: false }),
  isRescanning: false,
  setIsRescanning: (v) => set({ isRescanning: v }),
  thumbnailCacheBust: 0,
  bumpThumbnailCacheBust: () => set({ thumbnailCacheBust: Date.now() }),
}));
