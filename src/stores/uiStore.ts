import { create } from 'zustand';

interface UIState {
  settingsOpen: boolean;
  toggleSettings: () => void;
  closeSettings: () => void;
}

export const useUIStore = create<UIState>((set) => ({
  settingsOpen: false,
  toggleSettings: () => set((s) => ({ settingsOpen: !s.settingsOpen })),
  closeSettings: () => set({ settingsOpen: false }),
}));
