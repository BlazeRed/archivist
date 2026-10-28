import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import { toast } from 'sonner';
import { trimArchivePath, getThumbnailUrl } from '@/lib/archivePath';
import { makeVideoUrl } from '@/lib/mediaServer';
import { useTimelineStore } from '../stores/timelineStore';
import { useAppConfigStore } from '../stores/appConfigStore';
import { useGroupUIStore } from '../stores/groupUIStore';
import { useUIStore } from '../stores/uiStore';
import { ImageMetadataView, useImageGroups, useShowInFolder, type ImageGroups } from './ImageMetadata';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import type { Image } from '../types';

// Opaque theme-following buttons (popover fill + shadow) for the photo chrome: visible on any photo and
// on both the light and the dark frame/backdrop, unlike the translucent `onMedia` circles.
export const CHROME_BUTTON = 'pointer-events-auto bg-popover text-popover-foreground shadow-float hover:bg-accent';

// Content layer of the card: swaps between skeleton and preview, fading in on each swap.
// The card itself (frame, shadow) never moves.
const CONTENT = 'absolute inset-0 flex flex-col gap-3 p-3 animate-in fade-in duration-200';

/** Always-visible preview column: the selected item, or a static skeleton with the same geometry. */
export function ImagePreview() {
  const previewImage = useTimelineStore((s) => s.previewImage);
  const isSelectionMode = useGroupUIStore((s) => s.isSelectionMode);
  return (
    <aside className="flex-1 min-w-0 h-full pr-3 pb-3">
      <div className="squircle relative h-full rounded-xl bg-popover shadow-float ring-1 ring-frame overflow-hidden">
        {/* ponytail: multi-select shows the skeleton (the selection bar holds the actions); stacked thumbs + count if that proves too bare */}
        {previewImage && !isSelectionMode ? <PreviewCard image={previewImage} /> : <PreviewSkeleton />}
      </div>
    </aside>
  );
}

// Placeholder widths for the metadata rows, in the order ImageMetadataView renders them
const SKELETON_ROWS: [label: string, width: string][] = [
  ['detail.filename', '70%'],
  ['detail.dateTaken', '45%'],
  ['detail.dimensions', '35%'],
  ['detail.fileSize', '25%'],
  ['detail.location', '55%'],
  ['detail.imported', '45%'],
];

function PreviewSkeleton() {
  const { t } = useTranslation();
  return (
    <div className={CONTENT}>
      <div className="shrink-0 rounded-md bg-muted flex flex-col items-center justify-center gap-2 px-6 text-muted-foreground" style={{ aspectRatio: '1 / 1' }}>
        <svg className="size-8 opacity-60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <circle cx="8.5" cy="8.5" r="1.5" />
          <path d="M21 15l-5-5L5 21" />
        </svg>
        <p className="text-xs text-center">{t('preview.empty')}</p>
      </div>

      {/* Same rows as the metadata, values as static bars (no pulse: nothing is loading) */}
      <div className="flex-1 min-h-0 overflow-hidden px-1 space-y-3 text-sm" aria-hidden>
        {SKELETON_ROWS.map(([label, w]) => (
          <div key={label}>
            <p className="text-[11px] text-muted-foreground/60 mb-0.5">{t(label)}</p>
            <Skeleton className="h-5 animate-none rounded-full" style={{ width: w }} />
          </div>
        ))}
        <div>
          <p className="text-[11px] text-muted-foreground/60 mb-0.5">{t('detail.id')}</p>
          <Skeleton className="h-4 w-1/2 animate-none rounded-full" />
        </div>
      </div>

      <div className="pointer-events-none absolute bottom-3 inset-x-3 flex items-center justify-end gap-2">
        <Button variant="secondary" disabled className="h-9 px-4">{t('preview.folder')}</Button>
        <Button variant="violet" disabled className="h-9 pl-3.5 pr-3">{t('nav.groups')}</Button>
      </div>
    </div>
  );
}

function PreviewCard({ image: previewImage }: { image: Image }) {
  const { t } = useTranslation();
  const { selectImage, setPreviewImage, updateImageWebPath, images } = useTimelineStore();
  const groups = useImageGroups(previewImage.id);
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

  // ponytail: store order = grid order (backend sorts taken_at DESC, NULLs last = month groups desc, No Date last).
  // If the grid ever sorts differently, navigate over the grid's rows instead.
  const currentIdx = images.findIndex(img => img.id === previewImage.id);

  return (
    <div className={CONTENT}>
      {/* Sticky image pane — data-preview-media: the fullscreen viewer zooms from/to this frame.
          Follows the theme like the fullscreen backdrop: light (= skeleton frame) in light, dark letterbox in dark */}
      <div data-preview-media className="relative shrink-0 rounded-md overflow-hidden bg-muted dark:bg-media" style={{ aspectRatio: '1 / 1' }}>
        {/* Image: the cached grid thumbnail shows at once, the full image fades in over it once decoded */}
        {previewImage.media_type !== 'video' && thumbSrc && (
          <img src={thumbSrc} alt="" className="absolute inset-0 w-full h-full object-contain" />
        )}
        {previewImage.media_type !== 'video' && !thumbSrc && !imageLoaded && (
          <div className="absolute inset-0 flex items-center justify-center">
            <Spinner />
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
            <Spinner />
            <span className="text-muted-foreground text-xs text-center px-4">{t('preview.transcoding')}</span>
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
                <Button variant="onMedia" onClick={handlePlay} aria-label={t('preview.play')} className={cn(CHROME_BUTTON, 'relative size-14 [&_svg]:size-6!')}>
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
        {/* Overlay controls: opaque theme-following buttons (CHROME_BUTTON) */}
        <MediaButton label={t('common.close')} onClick={() => setPreviewImage(null)} className={cn(CHROME_BUTTON, 'absolute top-2 left-2')}>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </MediaButton>
        {/* Favourite toggle — top-right like the star on grid thumbnails */}
        <FavouriteButton image={previewImage} className={cn(CHROME_BUTTON, 'absolute top-2 right-12')} />
        <MediaButton label={t('preview.expand')} onClick={() => selectImage(previewImage)} className={cn(CHROME_BUTTON, 'absolute top-2 right-2')}>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
        </MediaButton>
        {/* Prev/next stop at the ends: no wrap-around */}
        {currentIdx > 0 && (
          <MediaButton label={t('common.previous')} onClick={() => setPreviewImage(images[currentIdx - 1])} className={cn(CHROME_BUTTON, 'absolute left-2 top-1/2 -translate-y-1/2')}>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </MediaButton>
        )}
        {currentIdx > -1 && currentIdx < images.length - 1 && (
          <MediaButton label={t('common.next')} onClick={() => setPreviewImage(images[currentIdx + 1])} className={cn(CHROME_BUTTON, 'absolute right-2 top-1/2 -translate-y-1/2')}>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </MediaButton>
        )}
      </div>

      {/* Scrollable metadata — bottom padding keeps the last rows clear of the floating bar */}
      <div className="flex-1 min-h-0 overflow-y-auto px-1 pb-14 scroll-inset [--scroll-inset-bottom:2.75rem]">
        <ImageMetadataView image={previewImage} groups={groups} readOnly />
      </div>

      {/* Floating actions: two separate pills, each styled by its role (DS §7) */}
      <div className="pointer-events-none absolute bottom-3 inset-x-3 flex items-center justify-end gap-2">
        <FolderButton image={previewImage} />
        <GroupsButton groups={groups} side="top" />
      </div>
    </div>
  );
}

/** Favourite toggle laid over the photo (preview card, fullscreen viewer). */
export function FavouriteButton({ image, className }: { image: Image; className?: string }) {
  const { t } = useTranslation();
  const updateImageFavourite = useTimelineStore((s) => s.updateImageFavourite);
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="onMedia"
          size="icon"
          aria-label={t('preview.favourite')}
          aria-pressed={image.is_favourite}
          onClick={async () => {
            const next = !image.is_favourite;
            await invoke('toggle_favourite', { imageId: image.id, isFavourite: next });
            updateImageFavourite(image.id, next);
          }}
          className={cn(className, image.is_favourite && 'bg-gold text-gold-foreground hover:bg-gold')}
        >
          <StarIcon filled={image.is_favourite} className={cn(image.is_favourite && 'animate-in zoom-in-50 duration-200')} />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{t('preview.favourite')}</TooltipContent>
    </Tooltip>
  );
}

/** "Folder" pill: reveals the file in the system file manager. */
export function FolderButton({ image }: { image: Image }) {
  const { t } = useTranslation();
  const handleShowInFolder = useShowInFolder(image);
  return (
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
  );
}

/** Group membership: checkbox list in a popover — several groups can be toggled in one go. */
export function GroupsButton({ groups, side }: { groups: ImageGroups; side: 'top' | 'bottom' }) {
  const { t } = useTranslation();
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="violet" className="pointer-events-auto h-9 min-w-0 pl-3.5 pr-3 shadow-float">
          <span className="truncate">{t('nav.groups')}</span>
          {groups.currentGroups.length > 0 && (
            <Badge variant="outline" className="h-4.5 min-w-4.5 px-1 border-0 bg-violet-foreground text-violet text-[10px] font-semibold tabular-nums">
              {groups.currentGroups.length}
            </Badge>
          )}
          <svg className={cn('opacity-80', side === 'bottom' && 'rotate-180')} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
          </svg>
        </Button>
      </PopoverTrigger>
      <PopoverContent side={side} align="end" sideOffset={8} className="w-auto min-w-60 gap-0.5 p-1.5">
        <p className="px-2.5 pt-1 pb-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-violet-ink">
          {t('nav.groups')}
        </p>
        {groups.allGroups.length === 0 ? (
          <p className="px-2.5 pb-2 text-muted-foreground">{t('groups.noGroups')}</p>
        ) : groups.allGroups.map(g => (
          <Label
            key={g.id}
            htmlFor={`group-toggle-${g.id}`}
            className="cursor-pointer gap-2.5 rounded-lg px-2.5 py-2 font-normal hover:bg-violet-soft hover:text-violet-ink"
          >
            <Checkbox
              id={`group-toggle-${g.id}`}
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
  );
}

export function Spinner() {
  return (
    <svg className="animate-spin size-8 text-muted-foreground" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
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
export function MediaButton({ label, onClick, className, pressed, children }: {
  label: string;
  onClick: () => void;
  className?: string;
  pressed?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="onMedia" size="icon" aria-label={label} aria-pressed={pressed} onClick={onClick} className={className}>
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">{children}</svg>
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );
}
