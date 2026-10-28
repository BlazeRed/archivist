import { useCallback, useEffect, useState, type MouseEvent } from 'react';
import { useTimelineStore } from '../stores/timelineStore';
import type { Image } from '../types';

/** Click/Shift-click selection over a plain grid (Trash, group detail, favourites). Same rules as the timeline:
 *  click toggles, Shift-click selects the range from the last clicked item, Esc clears.
 *  Pages where selection sits behind a Select button also use `isSelectionMode`: Esc / `exitSelection` leave it. */
export function useGridSelection(items: Image[]) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [anchor, setAnchor] = useState<string | null>(null);
  const [isSelectionMode, setSelectionMode] = useState(false);

  const clearSelection = useCallback(() => {
    setSelected(new Set());
    setAnchor(null);
  }, []);

  const exitSelection = useCallback(() => {
    setSelectionMode(false);
    clearSelection();
  }, [clearSelection]);

  // Nothing left to select (last item removed/restored): leave selection mode, the Select button is gone
  useEffect(() => {
    if (items.length === 0) exitSelection();
  }, [items.length, exitSelection]);

  // With the viewer open, Esc only closes the viewer
  useEffect(() => {
    if (selected.size === 0 && !isSelectionMode) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented || useTimelineStore.getState().selectedImage) return;
      if ((e.target as Element | null)?.closest?.('[role="listbox"], [role="dialog"], [role="menu"]')) return;
      exitSelection();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selected.size, isSelectionMode, exitSelection]);

  const toggle = useCallback((id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
    setAnchor(id);
  }, []);

  const handleClick = useCallback((img: Image, e: MouseEvent) => {
    const from = anchor ? items.findIndex(i => i.id === anchor) : -1;
    if (e.shiftKey && from !== -1) {
      const to = items.findIndex(i => i.id === img.id);
      setSelected(prev => new Set([...prev, ...items.slice(Math.min(from, to), Math.max(from, to) + 1).map(i => i.id)]));
      setAnchor(img.id);
    } else {
      toggle(img.id);
    }
  }, [anchor, items, toggle]);

  // Adds or removes several at once (a whole month)
  const setMany = useCallback((ids: string[], on: boolean) => {
    setSelected(prev => {
      const next = new Set(prev);
      for (const id of ids) {
        if (on) next.add(id); else next.delete(id);
      }
      return next;
    });
  }, []);

  return { selected, clearSelection, toggle, handleClick, setMany, isSelectionMode, setSelectionMode, exitSelection };
}
