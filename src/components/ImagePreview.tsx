import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import { toast } from 'sonner';
import { trimArchivePath, getThumbnailUrl } from '@/lib/archivePath';
import { makeVideoUrl } from '@/lib/mediaServer';
import { useTimelineStore } from '../stores/timelineStore';
import { useAppConfigStore } from '../stores/appConfigStore';
import { useUIStore } from '../stores/uiStore';
import { ImageMetadata } from './ImageMetadata';

export function ImagePreview({ width }: { width: number }) {
  const { t } = useTranslation();
  const { previewImage, selectImage, setPreviewImage, updateImageFavourite, updateImageWebPath, images } = useTimelineStore();
  const { config } = useAppConfigStore();
  const thumbnailCacheBust = useUIStore((s) => s.thumbnailCacheBust);

  const [imageLoaded, setImageLoaded] = useState(false);
  const [imgSrc, setImgSrc] = useState('');
  const [playing, setPlaying] = useState(false);
  const [transcoding, setTranscoding] = useState(false);

  const archivePath = trimArchivePath(config.archive_path);

  // Reset all state when selected image changes
  useEffect(() => {
    setImageLoaded(false);
    setImgSrc('');
    setPlaying(false);
    setTranscoding(false);
  }, [previewImage?.id]);

  // Rebuild src URL when the playable path or archive changes (without resetting playing)
  useEffect(() => {
    if (!previewImage || !archivePath) { setImgSrc(''); return; }
    if (previewImage.media_type === 'video') {
      if (!previewImage.web_path) { setImgSrc(''); return; }
      let cancelled = false;
      makeVideoUrl(archivePath, previewImage.web_path).then(url => {
        if (!cancelled) setImgSrc(url);
      });
      return () => { cancelled = true; };
    }
    const url = previewImage.file_path
      ? convertFileSrc(`${archivePath}/${previewImage.file_path}`)
      : '';
    const id = requestAnimationFrame(() => setImgSrc(url));
    return () => cancelAnimationFrame(id);
  }, [previewImage?.id, previewImage?.web_path, previewImage?.file_path, archivePath]);

  const thumbSrc = getThumbnailUrl(archivePath, previewImage?.thumbnail_path, thumbnailCacheBust);

  const handlePlay = async () => {
    if (!previewImage || !archivePath) return;
    if (previewImage.web_path) {
      setPlaying(true);
      return;
    }
    setTranscoding(true);
    toast.info(t('preview.transcoding'));
    try {
      const webPath = await invoke<string>('transcode_video', {
        imageId: previewImage.id,
        filePath: previewImage.file_path,
      });
      updateImageWebPath(previewImage.id, webPath);
      setImgSrc(await makeVideoUrl(archivePath, webPath));
      setPlaying(true);
    } catch (e) {
      console.error('[transcode] failed:', e);
      toast.error(t('preview.transcodeError'));
    } finally {
      setTranscoding(false);
    }
  };

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
        {/* Image: loading spinner */}
        {previewImage.media_type !== 'video' && !imageLoaded && (
          <div className="absolute inset-0 flex items-center justify-center">
            <svg className="animate-spin size-8 text-white/40" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          </div>
        )}
        {previewImage.media_type !== 'video' && imgSrc && (
          <img
            src={imgSrc}
            alt={previewImage.filename}
            decoding="async"
            onLoad={() => setImageLoaded(true)}
            className={`absolute inset-0 w-full h-full object-contain transition-opacity duration-200 ${imageLoaded ? 'opacity-100' : 'opacity-0'}`}
          />
        )}
        {/* Video: transcoding in progress */}
        {previewImage.media_type === 'video' && transcoding && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
            <svg className="animate-spin size-8 text-white/40" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <span className="text-white/60 text-xs text-center px-4">{t('preview.transcoding')}</span>
          </div>
        )}
        {/* Video: not transcoding, not playing — thumbnail + play button */}
        {previewImage.media_type === 'video' && !transcoding && !playing && (
          <button
            onClick={handlePlay}
            className="absolute inset-0 flex items-center justify-center group"
            title={t('preview.play')}
          >
            {thumbSrc && (
              <img src={thumbSrc} alt="" className="absolute inset-0 w-full h-full object-contain" />
            )}
            <div className="relative z-10 w-14 h-14 rounded-full bg-black/60 group-hover:bg-black/80 flex items-center justify-center transition-colors">
              <svg className="w-6 h-6 text-white ml-1" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            </div>
          </button>
        )}
        {/* Video: playing */}
        {previewImage.media_type === 'video' && playing && imgSrc && (
          <video
            controls
            autoPlay
            onError={(e) => {
              const v = e.currentTarget;
              console.error('[video] error:', v.error?.code, v.error?.message, 'networkState:', v.networkState, 'src:', imgSrc);
            }}
            className="absolute inset-0 w-full h-full object-contain"
          >
            <source src={imgSrc} type="video/webm" />
          </video>
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
