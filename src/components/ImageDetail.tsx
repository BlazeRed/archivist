import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import { toast } from 'sonner';
import { trimArchivePath } from '@/lib/archivePath';
import { makeVideoUrl } from '@/lib/mediaServer';
import { useTimelineStore } from '../stores/timelineStore';
import { useAppConfigStore } from '../stores/appConfigStore';
import { ImageMetadata } from './ImageMetadata';
import { cn } from '@/lib/utils';
import type { Image } from '../types';

export function ImageDetail({ hideGroups, hideDetails, navImages }: {
  hideGroups?: boolean;
  hideDetails?: boolean;
  navImages?: Image[];
}) {
  const { t } = useTranslation();
  const { selectedImage, selectImage } = useTimelineStore();
  const { config } = useAppConfigStore();

  const [imageLoaded, setImageLoaded] = useState(false);
  const [imgSrc, setImgSrc] = useState('');
  const [transcoding, setTranscoding] = useState(false);

  const archivePath = trimArchivePath(config.archive_path);

  // Reset when selected image changes
  useEffect(() => {
    setImageLoaded(false);
    setImgSrc('');
    setTranscoding(false);
  }, [selectedImage?.id]);

  // Rebuild URL when web_path updates (without resetting transcoding)
  useEffect(() => {
    if (!selectedImage || !archivePath) { setImgSrc(''); return; }
    if (selectedImage.media_type === 'video') {
      if (!selectedImage.web_path) { setImgSrc(''); return; }
      let cancelled = false;
      makeVideoUrl(archivePath, selectedImage.web_path).then(url => {
        if (!cancelled) setImgSrc(url);
      });
      return () => { cancelled = true; };
    }
    const url = selectedImage.file_path
      ? convertFileSrc(`${archivePath}/${selectedImage.file_path}`)
      : '';
    const id = requestAnimationFrame(() => setImgSrc(url));
    return () => cancelAnimationFrame(id);
  }, [selectedImage?.id, selectedImage?.web_path, selectedImage?.file_path, archivePath]);

  // Auto-transcode when detail view opens for an untranscoded video
  useEffect(() => {
    if (!selectedImage || selectedImage.media_type !== 'video') return;
    if (selectedImage.web_path) return;
    if (!archivePath) return;

    let cancelled = false;
    setTranscoding(true);
    toast.info(t('preview.transcoding'));

    invoke<string>('transcode_video', {
      imageId: selectedImage.id,
      filePath: selectedImage.file_path,
    }).then((webPath) => {
      if (cancelled) return;
      useTimelineStore.getState().updateImageWebPath(selectedImage.id, webPath);
    }).catch((e) => {
      if (cancelled) return;
      console.error('[transcode] detail failed:', e);
      toast.error(t('preview.transcodeError'));
    }).finally(() => {
      if (!cancelled) setTranscoding(false);
    });

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedImage?.id]);

  if (!selectedImage) return null;

  const currentIdx = navImages ? navImages.findIndex(img => img.id === selectedImage.id) : -1;
  const hasNav = currentIdx > -1 && (navImages?.length ?? 0) > 1;

  const handlePrev = () => {
    if (!navImages || currentIdx === -1) return;
    selectImage(navImages[(currentIdx - 1 + navImages.length) % navImages.length]);
  };
  const handleNext = () => {
    if (!navImages || currentIdx === -1) return;
    selectImage(navImages[(currentIdx + 1) % navImages.length]);
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      onClick={() => selectImage(null)}
    >
      <div
        className={cn(
          'bg-card rounded-xl w-full max-h-[90vh] flex overflow-hidden',
          'max-w-5xl'
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Image */}
        <div className="flex-1 bg-[#001A36] flex items-center justify-center p-4 min-w-0 relative">
          {selectedImage.media_type !== 'video' && !imageLoaded && (
            <div className="absolute inset-0 flex items-center justify-center">
              <svg className="animate-spin size-8 text-white/40" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
              </svg>
            </div>
          )}
          {selectedImage.media_type === 'video' && transcoding && (
            <div className="flex flex-col items-center gap-2 text-white/60 text-sm text-center px-6">
              <svg className="animate-spin size-8 text-white/40" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
              </svg>
              <span>{t('preview.transcoding')}</span>
            </div>
          )}
          {selectedImage.media_type === 'video' && !transcoding && (
            imgSrc ? (
              <video
                controls
                autoPlay
                onError={(e) => {
                  const v = e.currentTarget;
                  console.error('[video] detail error:', v.error?.code, v.error?.message, 'networkState:', v.networkState, 'src:', imgSrc);
                }}
                className="max-w-full max-h-[80vh] object-contain"
              >
                <source src={imgSrc} type="video/webm" />
              </video>
            ) : (
              <div className="flex flex-col items-center gap-2 text-white/60 text-sm">
                <svg className="animate-spin size-8 text-white/40" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                </svg>
              </div>
            )
          )}
          {selectedImage.media_type !== 'video' && (
            <img
              src={imgSrc}
              alt={selectedImage.filename}
              decoding="async"
              onLoad={() => setImageLoaded(true)}
              className={`max-w-full max-h-[80vh] object-contain transition-opacity duration-200 ${imageLoaded ? 'opacity-100' : 'opacity-0'}`}
            />
          )}
          {hideDetails && (
            <button
              onClick={() => selectImage(null)}
              className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/55 hover:bg-black/80 text-white flex items-center justify-center transition-colors"
              title={t('common.close')}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
          {hasNav && (
            <>
              <button
                onClick={(e) => { e.stopPropagation(); handlePrev(); }}
                className="absolute left-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/55 hover:bg-black/80 text-white flex items-center justify-center transition-colors z-10"
                title={t('common.previous')}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); handleNext(); }}
                className="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/55 hover:bg-black/80 text-white flex items-center justify-center transition-colors z-10"
                title={t('common.next')}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </>
          )}
        </div>

        {/* Details panel — hidden when hideDetails=true */}
        {!hideDetails && (
          <div className="w-72 flex flex-col bg-card overflow-y-auto">
            {/* Header */}
            <div className="flex justify-between items-center px-4 py-3 border-b border-foreground/12">
              <h3 className="text-sm font-semibold text-foreground">{t('detail.title')}</h3>
              <button
                onClick={() => selectImage(null)}
                className="text-muted-foreground hover:text-primary transition-colors"
                title={t('common.close')}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Metadata + groups */}
            <div className="px-4 py-3 flex-1 overflow-y-auto">
              <ImageMetadata image={selectedImage} hideGroups={hideGroups} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

