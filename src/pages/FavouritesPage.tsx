import { useEffect, useMemo, useState, useCallback, type MouseEvent } from 'react';
import { StarOffIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/core';
import { useTimelineStore } from '../stores/timelineStore';
import { useAppConfigStore } from '../stores/appConfigStore';
import { useGridSelection } from '../hooks/useGridSelection';
import { ImageDetail } from '../components/ImageDetail';
import { ArchiveNotSet } from '../components/ArchiveNotSet';
import { FloatingScroll, PlainGrid } from '../components/ThumbnailGrid';
import { SelectModeButton } from '../components/TimelineNavbar';
import { InfoPill, SelectionCountPill, ROW_BUTTON } from '../components/FloatingSelectionBar';
import { Button } from '@/components/ui/button';
import type { Image } from '../types';

export function FavouritesPage() {
  const { t } = useTranslation();
  const { allImages, fetchImages, selectImage, updateImageFavourite } = useTimelineStore();
  const { config } = useAppConfigStore();
  const [busy, setBusy] = useState(false);

  const favourites = useMemo(() => allImages.filter(img => img.is_favourite), [allImages]);
  const { selected, clearSelection, toggle, handleClick, isSelectionMode, setSelectionMode, exitSelection } = useGridSelection(favourites);

  // Images are loaded by the Timeline: landing here first (or after opening an archive here) would show nothing
  useEffect(() => {
    if (config.archive_path && allImages.length === 0) fetchImages();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.archive_path]);

  // Click opens the viewer; in selection mode it toggles (Shift-click = range)
  const handleImageClick = useCallback((img: Image, e: MouseEvent) => {
    if (isSelectionMode) handleClick(img, e);
    else selectImage(img);
  }, [isSelectionMode, handleClick, selectImage]);

  // Reversible (star again from the timeline), so no confirmation
  const handleRemove = async () => {
    setBusy(true);
    const ids = [...selected];
    try {
      await invoke('set_favourite_bulk', { imageIds: ids, isFavourite: false });
      ids.forEach(id => updateImageFavourite(id, false));
      clearSelection();
    } catch (e) {
      console.error('Failed to update favourites:', e);
    }
    setBusy(false);
  };

  if (!config.archive_path) return <ArchiveNotSet />;

  return (
    // Full-height, pulled up under the fixed topbar so the grid scrolls beneath the floating chrome (like Timeline)
    <div className="relative h-screen -mt-[var(--topbar-offset)]">
      <FloatingScroll
        toolbar={favourites.length > 0 && (
          <>
            {isSelectionMode ? (
              <>
                {selected.size > 0 && <SelectionCountPill count={selected.size} onClear={clearSelection} />}
                <Button variant="gold" onClick={handleRemove} disabled={busy || selected.size === 0} className={ROW_BUTTON}>
                  <StarOffIcon />
                  {t('timeline.removeFavourites')}
                </Button>
              </>
            ) : (
              <InfoPill>{favourites.length} {t('timeline.items')}</InfoPill>
            )}
            <SelectModeButton active={isSelectionMode} onToggle={() => isSelectionMode ? exitSelection() : setSelectionMode(true)} />
          </>
        )}
      >
        {favourites.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-muted-foreground text-sm text-center max-w-sm">{t('favourites.empty')}</p>
          </div>
        ) : (
          <PlainGrid
            images={favourites}
            isSelectionMode={isSelectionMode}
            selectedIds={selected}
            onImageClick={handleImageClick}
            onToggleSelect={toggle}
          />
        )}
      </FloatingScroll>

      <ImageDetail navImages={favourites} />
    </div>
  );
}
