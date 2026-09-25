import { useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { useTimelineStore } from '../stores/timelineStore';
import { useAppConfigStore } from '../stores/appConfigStore';
import { useGroupStore } from '../stores/dataStore';
import { useMapStore } from '../stores/mapStore';
import { ImageDetail } from '../components/ImageDetail';
import { Button } from '@/components/ui/button';
import { getThumbnailUrl } from '@/lib/archivePath';
import { useUIStore } from '../stores/uiStore';
import type { Image } from '../types';

function FavouriteThumb({ image, archivePath, cacheBust }: { image: Image; archivePath: string; cacheBust: number }) {
  const { t } = useTranslation();
  const { selectImage, updateImageFavourite } = useTimelineStore();
  const thumbnailUrl = getThumbnailUrl(archivePath, image.thumbnail_path, cacheBust);

  const handleRemove = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await invoke('toggle_favourite', { imageId: image.id, isFavourite: false });
    updateImageFavourite(image.id, false);
  };

  return (
    <div
      onClick={() => selectImage(image)}
      className="group/img bg-card rounded-lg border border-border overflow-hidden cursor-pointer hover:shadow-lg transition-shadow"
    >
      <div className="aspect-square bg-[#001A36] overflow-hidden relative">
        {thumbnailUrl ? (
          <img src={thumbnailUrl} alt={image.filename} className="w-full h-full object-cover" loading="lazy" />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-1 text-white/40">
            <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <line x1="3" y1="3" x2="21" y2="21" />
              <circle cx="8.5" cy="8.5" r="1.5" />
            </svg>
          </div>
        )}
        <div className="absolute inset-0 bg-black/30 opacity-0 group-hover/img:opacity-100 transition-opacity pointer-events-none" />
        <button
          onClick={handleRemove}
          title={t('preview.favourite')}
          className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover/img:opacity-100 transition-opacity hover:bg-destructive"
        >
          <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
          </svg>
        </button>
      </div>
      <div className="p-2">
        <p className="text-xs text-foreground truncate font-medium">{image.filename}</p>
        <p className="text-[10px] text-muted-foreground mt-0.5">
          {image.taken_at ? new Date(image.taken_at).toLocaleDateString() : t('detail.noDate')}
        </p>
      </div>
    </div>
  );
}

export function FavouritesPage() {
  const { t } = useTranslation();
  const { allImages, clearImages, selectImage, selectedImage } = useTimelineStore();
  const { config, setConfig } = useAppConfigStore();
  const clearGroups = useGroupStore((s) => s.clearGroups);
  const clearLocations = useMapStore((s) => s.clearLocations);
  const thumbnailCacheBust = useUIStore((s) => s.thumbnailCacheBust);

  const handleOpenArchive = async () => {
    const selected = await open({ directory: true });
    if (selected) {
      clearImages();
      selectImage(null);
      clearGroups();
      clearLocations();
      try { await invoke('init_archive', { archivePath: selected }); } catch {}
      setConfig({ archive_path: selected as string });
    }
  };

  if (!config.archive_path) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-52px)]">
        <div className="bg-card px-8 py-6 rounded-xl text-center max-w-sm">
          <p className="text-muted-foreground text-sm mb-4">{t('timeline.archiveNotSet')}</p>
          <Button onClick={handleOpenArchive}>{t('timeline.openArchive')}</Button>
        </div>
      </div>
    );
  }

  const favourites = allImages.filter(img => img.is_favourite);

  const favouritesRef = useRef(favourites);
  favouritesRef.current = favourites;
  const selectedImageRef = useRef(selectedImage);
  selectedImageRef.current = selectedImage;

  useEffect(() => {
    if (!selectedImage) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      const imgs = favouritesRef.current;
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

  return (
    <div className="flex flex-col h-[calc(100vh-52px)]">
      <div className="shrink-0 h-12 px-4 flex items-center border-b border-border bg-card">
        <h2 className="font-semibold text-sm text-foreground">{t('favourites.title')}</h2>
        {favourites.length > 0 && (
          <span className="ml-2 text-xs text-muted-foreground">{favourites.length}</span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {favourites.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-muted-foreground text-sm">{t('favourites.empty')}</p>
          </div>
        ) : (
          <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))' }}>
            {favourites.map(img => (
              <FavouriteThumb key={img.id} image={img} archivePath={config.archive_path} cacheBust={thumbnailCacheBust} />
            ))}
          </div>
        )}
      </div>

      <ImageDetail navImages={favourites} />
    </div>
  );
}
