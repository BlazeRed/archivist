import { useEffect, useRef, useState, useCallback } from 'react';
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
import { ImagePreview } from '../components/ImagePreview';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

const PREVIEW_MIN = 280;
const PREVIEW_MAX = 720;

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
      className="w-1 shrink-0 cursor-col-resize bg-border hover:bg-primary transition-colors"
    />
  );
}

function SelectionActionBar() {
  const { t } = useTranslation();
  const { availableGroups } = useTimelineStore();
  const { selectedImageIds, clearSelection, getSelectedCount } = useGroupUIStore();
  const [addToGroupId, setAddToGroupId] = useState('');
  const [addingToGroup, setAddingToGroup] = useState(false);

  const handleAddToGroup = async () => {
    if (!addToGroupId || selectedImageIds.size === 0) return;
    setAddingToGroup(true);
    try {
      for (const imageId of selectedImageIds) {
        await invoke('add_image_to_group', { imageId, groupId: Number(addToGroupId) });
      }
      clearSelection();
      setAddToGroupId('');
    } catch (e) {
      console.error('Failed to add to group:', e);
    }
    setAddingToGroup(false);
  };

  return (
    <div className="flex-shrink-0 h-14 bg-foreground flex items-center px-6 gap-4 shadow-lg">
      <span className="text-background text-sm font-medium">
        {t('timeline.selected', { count: getSelectedCount() })}
      </span>

      {availableGroups.length > 0 && (
        <div className="flex items-center gap-2 ml-auto">
          <Select value={addToGroupId} onValueChange={setAddToGroupId}>
            <SelectTrigger className="w-48 bg-white/12 border-white/25 text-white">
              <SelectValue placeholder={`${t('timeline.filterGroups')}…`} />
            </SelectTrigger>
            <SelectContent>
              {availableGroups.map(g => (
                <SelectItem key={g.id} value={g.id.toString()}>{g.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            onClick={handleAddToGroup}
            disabled={!addToGroupId || addingToGroup || getSelectedCount() === 0}
          >
            {t('timeline.addToGroup')}
          </Button>
        </div>
      )}

      <Button
        variant="outline"
        onClick={clearSelection}
        className="border-white/30 text-background hover:text-foreground"
      >
        {t('timeline.cancelSelection')}
      </Button>
    </div>
  );
}

export function TimelinePage() {
  const { t } = useTranslation();
  const { fetchImages, fetchGroups, clearImages, selectImage, images, selectedImage } = useTimelineStore();
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
  const imagesRef = useRef(images);
  imagesRef.current = images;
  const selectedImageRef = useRef(selectedImage);
  selectedImageRef.current = selectedImage;
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

  useEffect(() => {
    if (!selectedImage) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      const imgs = imagesRef.current;
      const current = selectedImageRef.current;
      if (!current || imgs.length < 2) return;
      const idx = imgs.findIndex(img => img.id === current.id);
      if (idx === -1) return;
      if (e.key === 'ArrowLeft') {
        selectImage(imgs[(idx - 1 + imgs.length) % imgs.length]);
      } else {
        selectImage(imgs[(idx + 1) % imgs.length]);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedImage, selectImage]);

  if (!config.archive_path) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-52px)]">
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
    <div className="flex flex-col h-[calc(100vh-52px)]">
      <TimelineNavbar />

      <div className="flex-1 flex min-h-0">
        {isSelectionMode ? (
          <main className="flex-1 flex flex-col min-w-0">
            <div className="flex-1 min-h-0">
              <ThumbnailGrid />
            </div>
            <SelectionActionBar />
          </main>
        ) : (
          <>
            <main className="flex-1 min-w-0 overflow-hidden">
              <ThumbnailGrid />
            </main>
            <ResizeHandle onResize={handleResize} />
            <ImagePreview width={previewWidth} />
          </>
        )}
      </div>

      <ImageDetail hideDetails navImages={images} />
    </div>
  );
}
