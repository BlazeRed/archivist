import { create } from 'zustand';

interface GroupUIState {
  selectedImageIds: Set<string>;
  isSelectionMode: boolean;
  toggleSelection: (imageId: string) => void;
  clearSelection: () => void;
  setSelectionMode: (enabled: boolean) => void;
  getSelectedCount: () => number;
}

export const useGroupUIStore = create<GroupUIState>((set, get) => ({
  selectedImageIds: new Set(),
  isSelectionMode: false,

  toggleSelection: (imageId) => {
    const newSet = new Set(get().selectedImageIds);
    if (newSet.has(imageId)) {
      newSet.delete(imageId);
    } else {
      newSet.add(imageId);
    }
    set({ selectedImageIds: newSet });
  },

  clearSelection: () => {
    set({ selectedImageIds: new Set(), isSelectionMode: false });
  },

  setSelectionMode: (enabled) => {
    if (!enabled) {
      set({ isSelectionMode: false, selectedImageIds: new Set() });
    } else {
      set({ isSelectionMode: true });
    }
  },

  getSelectedCount: () => get().selectedImageIds.size,
}));