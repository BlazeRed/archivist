import { useCallback, useEffect, useState, type MouseEvent } from 'react';
import { FolderIcon, Undo2Icon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/core';
import { revealItemInDir } from '@tauri-apps/plugin-opener';
import { toast } from 'sonner';
import { useTimelineStore } from '../stores/timelineStore';
import { useAppConfigStore } from '../stores/appConfigStore';
import { useUIStore } from '../stores/uiStore';
import { refreshAfterMove, type MoveResult } from '../hooks/useTrash';
import { useGridSelection } from '../hooks/useGridSelection';
import { ImageDetail } from '../components/ImageDetail';
import { formatSize } from '../components/ImageMetadata';
import { FloatingScroll, PlainGrid } from '../components/ThumbnailGrid';
import { ArchiveNotSet } from '../components/ArchiveNotSet';
import { SelectModeButton } from '../components/TimelineNavbar';
import { InfoPill, SelectionCountPill, ROW_BUTTON } from '../components/FloatingSelectionBar';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import type { Image } from '../types';

/** Trashed items, styled like the timeline (grid under the floating chrome) without its infrastructure:
 *  plain CSS grid, no virtualization, no preview column. Click opens the viewer; selection sits behind
 *  the Select button. Restore only: emptying the Trash folder is the user's manual act. */
export function TrashPage() {
  const { t } = useTranslation();
  const { config } = useAppConfigStore();
  const selectImage = useTimelineStore((s) => s.selectImage);
  const [items, setItems] = useState<Image[]>([]);
  const [busy, setBusy] = useState(false);
  // Restore all undoes the whole trash history in one click: confirm first (Restore selected is deliberate already)
  const [confirmRestoreAll, setConfirmRestoreAll] = useState(false);
  const { selected, clearSelection, toggle, handleClick, isSelectionMode, setSelectionMode, exitSelection } = useGridSelection(items);

  // Click opens the viewer; in selection mode it toggles (Shift-click = range), as in Favourites
  const handleImageClick = useCallback((img: Image, e: MouseEvent) => {
    if (isSelectionMode) handleClick(img, e);
    else selectImage(img);
  }, [isSelectionMode, handleClick, selectImage]);

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
    clearSelection();
    await load();
    refreshAfterMove();
    setBusy(false);
  };

  const openFolder = () => revealItemInDir(`${config.archive_path}/Trash`).catch(() => toast.error(t('trash.openFolderError')));

  if (!config.archive_path) return <ArchiveNotSet />;

  const totalSize = items.reduce((sum, img) => sum + (img.file_size ?? 0), 0);

  return (
    // Full-height, pulled up under the fixed topbar so the grid scrolls beneath the floating chrome (as in the timeline)
    <div className="relative h-screen -mt-[var(--topbar-offset)]">
      <FloatingScroll
        toolbar={
          <>
            {isSelectionMode ? (
              <>
                {selected.size > 0 && <SelectionCountPill count={selected.size} onClear={clearSelection} />}
                <Button onClick={() => restore([...selected])} disabled={busy || selected.size === 0} className={ROW_BUTTON}>
                  <Undo2Icon />
                  {t('trash.restoreSelected')}
                </Button>
              </>
            ) : (
              <>
                {items.length > 0 && (
                  <>
                    <InfoPill>{t('trash.summary', { count: items.length, size: formatSize(totalSize) })}</InfoPill>
                    <Button onClick={() => setConfirmRestoreAll(true)} disabled={busy} className={ROW_BUTTON}>
                      <Undo2Icon />
                      {t('trash.restoreAll')}
                    </Button>
                  </>
                )}
                <Button variant="outline" onClick={openFolder} className={cn(ROW_BUTTON, 'bg-popover hover:bg-card')}>
                  <FolderIcon />
                  {t('trash.openFolder')}
                </Button>
              </>
            )}
            {items.length > 0 && (
              <SelectModeButton active={isSelectionMode} onToggle={() => isSelectionMode ? exitSelection() : setSelectionMode(true)} />
            )}
          </>
        }
      >
        {items.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-muted-foreground text-sm text-center max-w-sm">{t('trash.empty')}</p>
          </div>
        ) : (
          <PlainGrid
            images={items}
            isSelectionMode={isSelectionMode}
            selectedIds={selected}
            onImageClick={handleImageClick}
            onToggleSelect={toggle}
          />
        )}
      </FloatingScroll>

      <ImageDetail hideGroups navImages={items} />

      <Dialog open={confirmRestoreAll} onOpenChange={setConfirmRestoreAll}>
        <DialogContent className="w-96">
          <DialogHeader>
            <DialogTitle>{t('trash.restoreAllTitle')}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">{t('trash.restoreAllConfirm', { count: items.length })}</p>
          <div className="flex gap-3 justify-end">
            <Button variant="outline" onClick={() => setConfirmRestoreAll(false)}>{t('common.cancel')}</Button>
            <Button onClick={() => { setConfirmRestoreAll(false); restore(items.map(i => i.id)); }}>
              {t('trash.restoreAll')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
