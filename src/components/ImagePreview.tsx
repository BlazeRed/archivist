import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import { toast } from 'sonner';
import { trimArchivePath, getThumbnailUrl } from '@/lib/archivePath';
import { makeVideoUrl } from '@/lib/mediaServer';
import { useTimelineStore } from '../stores/timelineStore';
import { useAppConfigStore } from '../stores/appConfigStore';
import { useUIStore } from '../stores/uiStore';
import { ImageMetadataView, useImageGroups, useShowInFolder } from './ImageMetadata';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import type { Image } from '../types';

export function ImagePreview({ width }: { width: number }) {
  const previewImage = useTimelineStore((s) => s.previewImage);
  // While the column animates closed, keep showing the last image instead of an empty card
  const [shownImage, setShownImage] = useState(previewImage);
  if (previewImage && previewImage !== shownImage) setShownImage(previewImage);
  if (!shownImage) return null;
  return <PreviewCard image={shownImage} width={width} />;
}

function PreviewCard({ image: previewImage, width }: { image: Image; width: number }) {
  const { t } = useTranslation();
  const { selectImage, setPreviewImage, updateImageFavourite, updateImageWebPath, images } = useTimelineStore();
  const groups = useImageGroups(previewImage.id);
  const handleShowInFolder = useShowInFolder(previewImage);
  const { config } = useAppConfigStore();
  const thumbnailCacheBust = useUIStore((s) => s.thumbnailCacheBust);

  const [imageLoaded, setImageLoaded] = useState(false);
  const [imgSrc, setImgSrc] = useState('');
  const [playing, setPlaying] = useState(false);
  const [transcoding, setTranscoding] = useState(false);

  const archivePath = trimArchivePath(config.archive_path);

  // Esc closes the preview — unless an overlay on top of it (detail view, settings, open dropdown) owns the key
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      if (useTimelineStore.getState().selectedImage || useUIStore.getState().settingsOpen) return;
      if ((e.target as Element | null)?.closest?.('[role="listbox"], [role="dialog"], [role="menu"]')) return;
      setPreviewImage(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [setPreviewImage]);

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
    <aside style={{ width }} className="shrink-0 h-full pr-3 pb-3">
    <div className="squircle relative h-full flex flex-col gap-3 p-3 rounded-xl bg-popover shadow-float ring-1 ring-frame overflow-hidden">
      {/* Sticky image pane */}
      <div className="relative shrink-0 rounded-md overflow-hidden bg-media" style={{ aspectRatio: '1 / 1' }}>
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
          <div className="absolute inset-0 flex items-center justify-center">
            {thumbSrc && (
              <img src={thumbSrc} alt="" className="absolute inset-0 w-full h-full object-contain" />
            )}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="onMedia" onClick={handlePlay} aria-label={t('preview.play')} className="relative size-14 [&_svg]:size-6!">
                  <svg className="ml-1" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">{t('preview.play')}</TooltipContent>
            </Tooltip>
          </div>
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
        {/* Overlay controls (Button `onMedia`) */}
        <MediaButton label={t('common.close')} onClick={() => setPreviewImage(null)} className="absolute top-2 left-2">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </MediaButton>
        {/* Favourite toggle — top-right like the star on grid thumbnails */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="onMedia"
              size="icon"
              aria-label={t('preview.favourite')}
              aria-pressed={previewImage.is_favourite}
              onClick={async () => {
                const next = !previewImage.is_favourite;
                await invoke('toggle_favourite', { imageId: previewImage.id, isFavourite: next });
                updateImageFavourite(previewImage.id, next);
              }}
              className={cn('absolute top-2 right-12', previewImage.is_favourite && 'bg-gold text-gold-foreground hover:bg-gold')}
            >
              <StarIcon filled={previewImage.is_favourite} className={cn(previewImage.is_favourite && 'animate-in zoom-in-50 duration-200')} />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">{t('preview.favourite')}</TooltipContent>
        </Tooltip>
        <MediaButton label={t('preview.expand')} onClick={() => selectImage(previewImage)} className="absolute top-2 right-2">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
        </MediaButton>
        {hasNav && (
          <>
            <MediaButton label={t('common.previous')} onClick={handlePrev} className="absolute left-2 top-1/2 -translate-y-1/2">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </MediaButton>
            <MediaButton label={t('common.next')} onClick={handleNext} className="absolute right-2 top-1/2 -translate-y-1/2">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </MediaButton>
          </>
        )}
      </div>

      {/* Scrollable metadata — bottom padding keeps the last rows clear of the floating bar */}
      <div className="flex-1 min-h-0 overflow-y-auto px-1 pb-14 scroll-inset [--scroll-inset-bottom:2.75rem]">
        <ImageMetadataView image={previewImage} groups={groups} readOnly />
      </div>

      {/* Floating actions: two separate pills, each styled by its role (DS §7) */}
      <div className="pointer-events-none absolute bottom-3 inset-x-3 flex items-center justify-end gap-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="secondary"
              onClick={handleShowInFolder}
              className="pointer-events-auto h-9 min-w-0 px-4 shadow-float"
            >
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
                  d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
              </svg>
              <span className="truncate">{t('preview.folder')}</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">{t('detail.showInFolder')}</TooltipContent>
        </Tooltip>

        {/* Group membership: checkbox list in a popover — several groups can be toggled in one go */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="violet" className="pointer-events-auto h-9 min-w-0 pl-3.5 pr-3 shadow-float">
              <span className="truncate">{t('nav.groups')}</span>
              {groups.currentGroups.length > 0 && (
                <Badge variant="outline" className="h-4.5 min-w-4.5 px-1 border-0 bg-violet-foreground text-violet text-[10px] font-semibold tabular-nums">
                  {groups.currentGroups.length}
                </Badge>
              )}
              <svg className="opacity-80" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
              </svg>
            </Button>
          </PopoverTrigger>
          <PopoverContent side="top" align="end" sideOffset={8} className="w-auto min-w-60 gap-0.5 p-1.5">
            <p className="px-2.5 pt-1 pb-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-violet-ink">
              {t('nav.groups')}
            </p>
            {groups.allGroups.length === 0 ? (
              <p className="px-2.5 pb-2 text-muted-foreground">{t('groups.noGroups')}</p>
            ) : groups.allGroups.map(g => (
              <Label
                key={g.id}
                htmlFor={`preview-group-${g.id}`}
                className="cursor-pointer gap-2.5 rounded-lg px-2.5 py-2 font-normal hover:bg-violet-soft hover:text-violet-ink"
              >
                <Checkbox
                  id={`preview-group-${g.id}`}
                  checked={groups.isMember(g.id)}
                  onCheckedChange={() => groups.toggle(g.id)}
                  className="data-checked:border-violet data-checked:bg-violet data-checked:text-violet-foreground dark:data-checked:bg-violet"
                />
                <span className="truncate">{g.name}</span>
                <span className="ml-auto pl-3 text-xs text-muted-foreground tabular-nums">{g.image_count}</span>
              </Label>
            ))}
          </PopoverContent>
        </Popover>
      </div>
    </div>
    </aside>
  );
}

function StarIcon({ filled, className }: { filled: boolean; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={2} strokeLinejoin="round">
      <path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z" />
    </svg>
  );
}

/** Icon button laid over the photo, with its tooltip. */
function MediaButton({ label, onClick, className, children }: {
  label: string;
  onClick: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="onMedia" size="icon" aria-label={label} onClick={onClick} className={className}>
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">{children}</svg>
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );
}
