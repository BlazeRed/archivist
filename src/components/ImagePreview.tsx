import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import { trimArchivePath } from '@/lib/archivePath';
import { useTimelineStore } from '../stores/timelineStore';
import { useAppConfigStore } from '../stores/appConfigStore';
import { ImageMetadata } from './ImageMetadata';

export function ImagePreview({ width }: { width: number }) {
  const { t } = useTranslation();
  const { previewImage, selectImage, setPreviewImage, updateImageFavourite, images } = useTimelineStore();
  const { config } = useAppConfigStore();

  const [imageLoaded, setImageLoaded] = useState(false);
  const [imgSrc, setImgSrc] = useState('');

  const archivePath = trimArchivePath(config.archive_path);

  useEffect(() => {
    if (!previewImage) { setImgSrc(''); setImageLoaded(false); return; }
    setImageLoaded(false);
    setImgSrc('');
    const url = archivePath
      ? convertFileSrc(`${archivePath}/${previewImage.file_path}`)
      : '';
    const id = requestAnimationFrame(() => setImgSrc(url));
    return () => cancelAnimationFrame(id);
  }, [previewImage, archivePath]);

  if (!previewImage) {
    return (
      <aside
        style={{ width }}
        className="shrink-0 flex flex-col items-center justify-center gap-2 border-l border-border bg-card text-muted-foreground"
      >
        <svg className="w-10 h-10 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2" strokeWidth={1.5} />
          <circle cx="8.5" cy="8.5" r="1.5" strokeWidth={1.5} />
          <polyline points="21 15 16 10 5 21" strokeWidth={1.5} />
        </svg>
        <p className="text-sm">{t('preview.empty')}</p>
      </aside>
    );
  }

  const currentIdx = images.findIndex(img => img.id === previewImage.id);
  const hasNav = currentIdx > -1 && images.length > 1;

  const handlePrev = () => {
    if (!hasNav) return;
    setPreviewImage(images[(currentIdx - 1 + images.length) % images.length]);
  };
  const handleNext = () => {
    if (!hasNav) return;
    setPreviewImage(images[(currentIdx + 1) % images.length]);
  };

  return (
    <aside
      style={{ width }}
      className="shrink-0 flex flex-col border-l border-border bg-card overflow-hidden"
    >
      {/* Sticky image pane */}
      <div className="relative shrink-0 bg-[#001A36]" style={{ aspectRatio: '1 / 1' }}>
        {(!imgSrc || !imageLoaded) && (
          <div className="absolute inset-0 flex items-center justify-center">
            <svg className="animate-spin size-8 text-white/40" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          </div>
        )}
        {imgSrc && (
          <img
            src={imgSrc}
            alt={previewImage.filename}
            decoding="async"
            onLoad={() => setImageLoaded(true)}
            className={`absolute inset-0 w-full h-full object-contain transition-opacity duration-200 ${imageLoaded ? 'opacity-100' : 'opacity-0'}`}
          />
        )}
        {/* Close button */}
        <button
          onClick={() => setPreviewImage(null)}
          className="absolute top-2 left-2 w-8 h-8 rounded-full bg-black/55 hover:bg-black/80 text-white flex items-center justify-center transition-colors"
          title={t('common.close')}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
        {/* Favourite toggle */}
        <button
          onClick={async () => {
            const next = !previewImage.is_favourite;
            await invoke('toggle_favourite', { imageId: previewImage.id, isFavourite: next });
            updateImageFavourite(previewImage.id, next);
          }}
          className="absolute top-2 left-12 w-8 h-8 rounded-full bg-black/55 hover:bg-black/80 text-white flex items-center justify-center transition-colors"
          title={t('preview.favourite')}
        >
          <svg className="w-4 h-4" fill={previewImage.is_favourite ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
          </svg>
        </button>
        {/* Expand button */}
        <button
          onClick={() => selectImage(previewImage)}
          className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/55 hover:bg-black/80 text-white flex items-center justify-center transition-colors"
          title={t('preview.expand')}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
          </svg>
        </button>
        {/* Prev / Next navigation */}
        {hasNav && (
          <>
            <button
              onClick={handlePrev}
              className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/55 hover:bg-black/80 text-white flex items-center justify-center transition-colors"
              title={t('common.previous')}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <button
              onClick={handleNext}
              className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/55 hover:bg-black/80 text-white flex items-center justify-center transition-colors"
              title={t('common.next')}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </>
        )}
      </div>

      {/* Scrollable metadata */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        <ImageMetadata image={previewImage} />
      </div>
    </aside>
  );
}
