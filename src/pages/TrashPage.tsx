import { useCallback, useEffect, useState, type CSSProperties, type MouseEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/core';
import { revealItemInDir } from '@tauri-apps/plugin-opener';
import { toast } from 'sonner';
import { useTimelineStore } from '../stores/timelineStore';
import { useAppConfigStore } from '../stores/appConfigStore';
import { useUIStore } from '../stores/uiStore';
import { refreshAfterMove, type MoveResult } from '../hooks/useTrash';
import { ImageDetail } from '../components/ImageDetail';
import { formatSize } from '../components/ImageMetadata';
import { ThumbnailCell, SIZES, FLOATING_TOP, type SizeKey } from '../components/ThumbnailGrid';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { Image } from '../types';

/** Trashed items, styled like the timeline (grid under the floating chrome) without its infrastructure:
 *  plain CSS grid, no virtualization, no preview column. Click selects, double-click opens the viewer.
 *  Restore only: emptying the Trash folder is the user's manual act. */
export function TrashPage() {
  const { t } = useTranslation();
  const { config } = useAppConfigStore();
  const selectImage = useTimelineStore((s) => s.selectImage);
  const thumbnailCacheBust = useUIStore((s) => s.thumbnailCacheBust);
  const [items, setItems] = useState<Image[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [anchor, setAnchor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const size = SIZES[config.thumbnail_size as SizeKey];

  const load = useCallback(async () => {
    try {
      setItems(await invoke<Image[]>('get_trashed_images'));
    } catch (e) {
      console.error('Failed to load trash:', e);
    }
    useUIStore.getState().refreshTrashCount();
  }, []);

  useEffect(() => {
    if (config.archive_path) load();
  }, [config.archive_path, load]);

  const clearSelection = useCallback(() => {
    setSelected(new Set());
    setAnchor(null);
  }, []);

  // Esc clears the selection. With the viewer open, Esc only closes the viewer.
  useEffect(() => {
    if (selected.size === 0) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented || useTimelineStore.getState().selectedImage) return;
      if ((e.target as Element | null)?.closest?.('[role="listbox"], [role="dialog"], [role="menu"]')) return;
      clearSelection();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selected.size, clearSelection]);

  const restore = async (ids: string[]) => {
    setBusy(true);
    try {
      const result = await invoke<MoveResult>('restore_images', { imageIds: ids });
      if (result.moved > 0) toast.success(t('trash.restored', { count: result.moved }));
      if (result.failed > 0) toast.error(t('trash.restoreError'));
    } catch (e) {
      console.error('Failed to restore:', e);
      toast.error(t('trash.restoreError'));
    }
    clearSelection();
    await load();
    refreshAfterMove();
    setBusy(false);
  };

  const toggle = useCallback((id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
    setAnchor(id);
  }, []);

  // Same rules as the timeline: click toggles, Shift-click selects the range from the last clicked item
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

  const openFolder = () => revealItemInDir(`${config.archive_path}/Trash`).catch(() => toast.error(t('trash.openFolderError')));

  if (!config.archive_path) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-var(--topbar-offset))]">
        <p className="text-muted-foreground text-sm">{t('timeline.archiveNotSet')}</p>
      </div>
    );
  }

  const totalSize = items.reduce((sum, img) => sum + (img.file_size ?? 0), 0);

  return (
    // Full-height, pulled up under the fixed topbar so the grid scrolls beneath the floating chrome (as in the timeline)
    <div className="relative h-screen -mt-[var(--topbar-offset)]">
      {items.length === 0 ? (
        <div className="flex items-center justify-center h-full px-6">
          <p className="text-muted-foreground text-sm text-center max-w-sm">{t('trash.empty')}</p>
        </div>
      ) : (
        <div
          className="h-full overflow-y-auto scroll-inset px-6"
          style={{ paddingTop: FLOATING_TOP, paddingBottom: 12, '--scroll-inset-top': `${FLOATING_TOP}px`, '--scroll-inset-bottom': '12px' } as CSSProperties}
        >
          <div className="grid" style={{ gap: size.gap, gridTemplateColumns: `repeat(auto-fill, minmax(${size.px}px, 1fr))` }}>
            {items.map(img => (
              <div key={img.id} onDoubleClick={() => selectImage(img)}>
                <ThumbnailCell
                  image={img}
                  archivePath={config.archive_path}
                  cacheBust={thumbnailCacheBust}
                  isSelectionMode
                  isSelected={selected.has(img.id)}
                  isPreviewed={false}
                  onImageClick={handleClick}
                  onToggleSelect={toggle}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Scroll-edge fade: photos dissolve as they pass under the floating chrome */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 z-10 bg-linear-to-b from-background from-55% to-transparent"
        style={{ height: FLOATING_TOP + 8 }}
      />

      {/* Floating row. Left: one pill with the title and the restore action, which turns from "Restore all"
          into "Restore" + selected count while items are selected. Right: summary + open folder. */}
      <div className="pointer-events-none absolute inset-x-0 z-20 flex items-start justify-between gap-3 px-4 top-[calc(var(--topbar-offset)+8px)]">
        <div className="pointer-events-auto flex items-center gap-2">
          {/* Ends on the button with a 3px inset */}
          <div className={cn('h-9 flex items-center gap-2 pl-4 rounded-full bg-popover shadow-float', items.length > 0 ? 'pr-[3px]' : 'pr-4')}>
            <span className="cursor-default select-none text-[13px] font-semibold text-popover-foreground whitespace-nowrap">
              {t('trash.title')}
            </span>
            {items.length > 0 && (
              <Button
                onClick={() => restore(selected.size > 0 ? [...selected] : items.map(i => i.id))}
                disabled={busy}
                className="h-[30px] pl-3 pr-3.5 text-xs"
              >
                <RestoreIcon />
                {t(selected.size > 0 ? 'trash.restoreSelected' : 'trash.restoreAll')}
              </Button>
            )}
          </div>
          {/* Selected count: own pill, same look as the timeline count badge */}
          {selected.size > 0 && (
            <Badge variant="outline" className="cursor-default select-none h-9 px-4 border-0 bg-popover shadow-float text-xs font-normal text-muted-foreground tabular-nums animate-in fade-in duration-200">
              {t('timeline.selected', { count: selected.size })}
            </Badge>
          )}
        </div>
        <div className="pointer-events-auto flex items-center gap-2">
          {items.length > 0 && (
            <Badge variant="outline" className="cursor-default select-none h-9 px-4 border-0 bg-popover shadow-float text-xs font-normal text-muted-foreground tabular-nums">
              {t('trash.summary', { count: items.length, size: formatSize(totalSize) })}
            </Badge>
          )}
          <Button variant="outline" onClick={openFolder} className="h-9 pl-3.5 pr-4 text-xs shadow-float bg-popover hover:bg-card">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
                d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
            </svg>
            {t('trash.openFolder')}
          </Button>
        </div>
      </div>

      <ImageDetail hideGroups navImages={items} />
    </div>
  );
}

function RestoreIcon() {
  return (
    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a5 5 0 010 10H9M3 10l4-4M3 10l4 4" />
    </svg>
  );
}
