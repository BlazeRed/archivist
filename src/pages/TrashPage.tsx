import { useCallback, useEffect, useState, type MouseEvent } from 'react';
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
import { Button } from '@/components/ui/button';
import { getThumbnailUrl } from '@/lib/archivePath';
import { cn } from '@/lib/utils';
import type { Image } from '../types';

/** Trashed items: plain grid, click selects, double-click opens the viewer. Restore only — emptying is done by hand. */
export function TrashPage() {
  const { t } = useTranslation();
  const { config } = useAppConfigStore();
  const selectImage = useTimelineStore((s) => s.selectImage);
  const thumbnailCacheBust = useUIStore((s) => s.thumbnailCacheBust);
  const [items, setItems] = useState<Image[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [anchor, setAnchor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
    setSelected(new Set());
    setAnchor(null);
    await load();
    refreshAfterMove();
    setBusy(false);
  };

  const handleClick = (img: Image, e: MouseEvent) => {
    const next = new Set(selected);
    const from = anchor ? items.findIndex(i => i.id === anchor) : -1;
    if (e.shiftKey && from !== -1) {
      const to = items.findIndex(i => i.id === img.id);
      items.slice(Math.min(from, to), Math.max(from, to) + 1).forEach(i => next.add(i.id));
    } else if (next.has(img.id)) {
      next.delete(img.id);
    } else {
      next.add(img.id);
    }
    setSelected(next);
    setAnchor(img.id);
  };

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
    <div className="relative flex flex-col h-[calc(100vh-var(--topbar-offset))]">
      <div className="shrink-0 px-6 pt-5 pb-3 flex items-center gap-3">
        <h2 className="font-semibold text-foreground">{t('trash.title')}</h2>
        {items.length > 0 && (
          <span className="text-xs text-muted-foreground tabular-nums">
            {t('trash.summary', { count: items.length, size: formatSize(totalSize) })}
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          <Button variant="outline" onClick={openFolder}>{t('trash.openFolder')}</Button>
          <Button onClick={() => restore(items.map(i => i.id))} disabled={busy || items.length === 0}>
            {t('trash.restoreAll')}
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 pt-2 pb-20">
        {items.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-muted-foreground text-sm text-center max-w-sm">{t('trash.empty')}</p>
          </div>
        ) : (
          <div className="grid gap-2 grid-cols-[repeat(auto-fill,minmax(140px,1fr))]">
            {items.map(img => {
              const url = getThumbnailUrl(config.archive_path, img.thumbnail_path, thumbnailCacheBust);
              return (
                <div
                  key={img.id}
                  onClick={(e) => handleClick(img, e)}
                  onDoubleClick={() => selectImage(img)}
                  className={cn(
                    'relative aspect-square bg-card rounded-sm overflow-hidden cursor-pointer select-none transition-[transform,box-shadow] duration-150 active:scale-[.97]',
                    selected.has(img.id) && 'shadow-[0_0_0_2px_var(--background),0_0_0_5px_var(--gold)]'
                  )}
                >
                  {url && <img src={url} alt={img.filename} className="w-full h-full object-cover" loading="lazy" />}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {selected.size > 0 && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 h-12 flex items-center gap-2 pl-5 pr-1.5 rounded-full bg-popover shadow-float animate-in fade-in slide-in-from-bottom-8 duration-300 ease-[cubic-bezier(.2,.8,.2,1)]">
          <span className="mr-1 text-sm font-medium tabular-nums whitespace-nowrap">
            {t('timeline.selected', { count: selected.size })}
          </span>
          <Button onClick={() => restore([...selected])} disabled={busy}>{t('trash.restoreSelected')}</Button>
          <Button variant="ghost" onClick={() => { setSelected(new Set()); setAnchor(null); }}>
            {t('timeline.cancelSelection')}
          </Button>
        </div>
      )}

      <ImageDetail hideGroups navImages={items} />
    </div>
  );
}
