import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { StarIcon, Trash2Icon, XIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { useTimelineStore } from '../stores/timelineStore';
import { useAppConfigStore } from '../stores/appConfigStore';
import { useGroupUIStore } from '../stores/groupUIStore';
import { useImportStore } from '../stores/importStore';
import { useGroupStore } from '../stores/dataStore';
import { TimelineNavbar } from '../components/TimelineNavbar';
import { ThumbnailGrid } from '../components/ThumbnailGrid';
import { ImageDetail } from '../components/ImageDetail';
import { ImagePreview, GroupsButton } from '../components/ImagePreview';
import { useBulkGroups } from '../components/ImageMetadata';
import { FloatingSelectionBar, BAR_BUTTON, BAR_LABEL } from '../components/FloatingSelectionBar';
import { useTrashImages } from '../hooks/useTrash';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

const PREVIEW_MIN = 280;
const PREVIEW_MAX = 720;
const RESIZE_HANDLE_W = 8; // w-2
// The grid keeps at least this much: on a narrow window the preview gives way, not the grid
const GRID_MIN = 360;

function ResizeHandle({ onResize }: { onResize: (w: number) => void }) {
  const dragging = useRef(false);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      const newW = window.innerWidth - e.clientX;
      onResize(Math.max(PREVIEW_MIN, Math.min(PREVIEW_MAX, newW)));
    };
    const onUp = () => {
      dragging.current = false;
      document.body.style.cursor = '';
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [onResize]);

  return (
    <div
      onMouseDown={() => {
        dragging.current = true;
        document.body.style.cursor = 'col-resize';
      }}
      className="group/handle w-2 shrink-0 cursor-col-resize flex justify-center py-6"
    >
      <div className="w-0.5 h-full rounded-full bg-transparent group-hover/handle:bg-primary transition-colors" />
    </div>
  );
}

function SelectionActionBar() {
  const { t } = useTranslation();
  const { allImages, fetchImages } = useTimelineStore();
  const { selectedImageIds, clearSelection } = useGroupUIStore();
  const trashImages = useTrashImages();
  const [busy, setBusy] = useState(false);

  const ids = useMemo(() => [...selectedImageIds], [selectedImageIds]);
  const groups = useBulkGroups(ids);
  const count = ids.length;
  // All selected already favourite → the star removes them, else it marks them all
  const allFavourite = count > 0 && allImages.filter(img => selectedImageIds.has(img.id)).every(img => img.is_favourite);
  const favouriteLabel = t(allFavourite ? 'timeline.removeFavourites' : 'timeline.addFavourites');

  // Esc leaves selection mode, unless a select/menu owns the key
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      if ((e.target as Element | null)?.closest?.('[role="listbox"], [role="dialog"], [role="menu"]')) return;
      clearSelection();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [clearSelection]);

  const handleFavourite = async () => {
    setBusy(true);
    try {
      await invoke('set_favourite_bulk', { imageIds: ids, isFavourite: !allFavourite });
      await fetchImages();
    } catch (e) {
      console.error('Failed to update favourites:', e);
    }
    setBusy(false);
  };

  const handleTrash = async () => {
    setBusy(true);
    await trashImages(ids);
    clearSelection();
    setBusy(false);
  };

  return (
    <FloatingSelectionBar count={count}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="gold"
            onClick={handleFavourite}
            disabled={busy || count === 0}
            aria-label={favouriteLabel}
            aria-pressed={allFavourite}
            className={BAR_BUTTON}
          >
            <StarIcon fill={allFavourite ? 'currentColor' : 'none'} />
            <span className={BAR_LABEL}>{favouriteLabel}</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top">{favouriteLabel}</TooltipContent>
      </Tooltip>

      <GroupsButton groups={groups} side="top" />

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="destructive"
            onClick={handleTrash}
            disabled={busy || count === 0}
            aria-label={t('trash.moveToTrash')}
            className={BAR_BUTTON}
          >
            <Trash2Icon />
            <span className={BAR_LABEL}>{t('trash.moveToTrash')}</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top">{t('trash.moveToTrash')}</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            onClick={clearSelection}
            aria-label={t('timeline.cancelSelection')}
            className={cn(BAR_BUTTON, 'ml-auto text-muted-foreground')}
          >
            <XIcon />
            <span className={BAR_LABEL}>{t('timeline.cancelSelection')}</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top">{t('timeline.cancelSelection')}</TooltipContent>
      </Tooltip>
    </FloatingSelectionBar>
  );
}

export function TimelinePage() {
  const { t } = useTranslation();
  const { fetchImages, fetchGroups, clearImages, selectImage, setPreviewImage, selectedImage, images } = useTimelineStore();
  const clearGroups = useGroupStore((s) => s.clearGroups);
  const { config, setConfig } = useAppConfigStore();
  const { isSelectionMode } = useGroupUIStore();
  const phase = useImportStore((s) => s.phase);
  const isImportActive = phase === 'scanning' || phase === 'analyzing' || phase === 'thumbnailing' || phase === 'importing';

  const [showImportWarning, setShowImportWarning] = useState(false);

  const [previewWidth, setPreviewWidthState] = useState(
    () => config.timeline_preview_width ?? 380
  );

  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const handleResize = useCallback((w: number) => {
    setPreviewWidthState(w);
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      setConfig({ timeline_preview_width: w });
    }, 200);
  }, [setConfig]);

  const handleOpenArchive = async () => {
    if (isImportActive) { setShowImportWarning(true); return; }
    const selected = await open({ directory: true });
    if (selected) {
      clearImages();
      selectImage(null);
      clearGroups();
      try {
        await invoke('init_archive', { archivePath: selected });
      } catch (e) {
        console.error('Failed to init archive:', e);
      }
      setConfig({ archive_path: selected as string });
    }
  };

  useEffect(() => {
    if (config.archive_path) {
      fetchImages();
      fetchGroups();
    }
  }, [config.archive_path, fetchImages, fetchGroups]);

  // Navigating in fullscreen moves the preview (and the grid selection) along, so closing lands on that photo
  useEffect(() => {
    if (selectedImage) setPreviewImage(selectedImage);
  }, [selectedImage, setPreviewImage]);


  if (!config.archive_path) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-var(--topbar-offset))]">
        <div className="bg-card px-8 py-6 rounded-xl text-center max-w-sm">
          <p className="text-muted-foreground text-sm mb-4">{t('timeline.archiveNotSet')}</p>
          <Button onClick={handleOpenArchive}>{t('timeline.openArchive')}</Button>
        </div>
        <Dialog open={showImportWarning} onOpenChange={(open) => { if (!open) setShowImportWarning(false); }}>
          <DialogContent className="w-96">
            <DialogHeader>
              <DialogTitle>{t('import.navWarningTitle')}</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">{t('import.navWarningBody')}</p>
            <div className="flex justify-end">
              <Button onClick={() => setShowImportWarning(false)} variant="outline" size="sm">
                {t('common.cancel')}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  return (
    // Full-height, pulled up under the fixed topbar so the grid scrolls beneath the floating chrome
    <div className="flex flex-col h-screen -mt-[var(--topbar-offset)]">
      <div className="flex-1 flex min-h-0">
        <main className="relative flex-1 min-w-0 overflow-hidden">
          <ThumbnailGrid toolbar={<TimelineNavbar />} />
          {isSelectionMode && <SelectionActionBar />}
        </main>

        {/* Permanent preview column: selection only changes its content, so the grid never reflows */}
        <div
          className="shrink-0 flex h-full pt-[calc(var(--topbar-offset)+8px)]"
          style={{ width: previewWidth + RESIZE_HANDLE_W, maxWidth: `calc(100vw - ${GRID_MIN}px)` }}
        >
          <ResizeHandle onResize={handleResize} />
          <ImagePreview />
        </div>
      </div>

      <ImageDetail navImages={images} />
    </div>
  );
}
