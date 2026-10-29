import { create } from 'zustand';

interface GroupUIState {
  selectedImageIds: Set<string>;
  isSelectionMode: boolean;
  /** Anchor for Shift-click range selection */
  lastSelectedId: string | null;
  toggleSelection: (imageId: string) => void;
  addToSelection: (imageIds: string[], anchorId: string) => void;
  clearSelection: () => void;
  setSelectionMode: (enabled: boolean) => void;
  getSelectedCount: () => number;
}

export const useGroupUIStore = create<GroupUIState>((set, get) => ({
  selectedImageIds: new Set(),
  isSelectionMode: false,
  lastSelectedId: null,

  toggleSelection: (imageId) => {
    const newSet = new Set(get().selectedImageIds);
    if (newSet.has(imageId)) {
      newSet.delete(imageId);
    } else {
      newSet.add(imageId);
    }
    set({ selectedImageIds: newSet, lastSelectedId: imageId });
  },

  addToSelection: (imageIds, anchorId) => {
    set({ selectedImageIds: new Set([...get().selectedImageIds, ...imageIds]), lastSelectedId: anchorId });
  },

  clearSelection: () => {
    set({ selectedImageIds: new Set(), isSelectionMode: false, lastSelectedId: null });
  },

  setSelectionMode: (enabled) => {
    if (!enabled) {
      set({ isSelectionMode: false, selectedImageIds: new Set(), lastSelectedId: null });
    } else {
      set({ isSelectionMode: true });
    }
  },

  getSelectedCount: () => get().selectedImageIds.size,
}));
