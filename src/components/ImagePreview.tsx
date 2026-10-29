import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeftIcon, ChevronRightIcon, ChevronUpIcon, FolderIcon, ImageIcon, LoaderCircleIcon, Maximize2Icon, PlayIcon, StarIcon, Trash2Icon, XIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import { toast } from 'sonner';
import { trimArchivePath, getThumbnailUrl } from '@/lib/archivePath';
import { makeVideoUrl } from '@/lib/mediaServer';
import { useTimelineStore } from '../stores/timelineStore';
import { useAppConfigStore } from '../stores/appConfigStore';
import { useGroupUIStore } from '../stores/groupUIStore';
import { useUIStore } from '../stores/uiStore';
import { useMapStore } from '../stores/mapStore';
import { useTrashImages } from '../hooks/useTrash';
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
// Hover stays opaque (bg-card, like the timeline filter button): `accent` is translucent and would let the photo show through.
export const CHROME_BUTTON = 'pointer-events-auto bg-popover text-popover-foreground shadow-float hover:bg-card';

// Content layer of the card: swaps between skeleton and preview, fading in on each swap.
// The card itself (frame, shadow) never moves.
const CONTENT = 'absolute inset-0 flex flex-col gap-3 p-3 animate-in fade-in duration-200';
// Bottom pills concentric with the card corner: inset = card radius (xl, 24) − pill radius (h-9, 18) = 6px
const ACTION_BAR = 'pointer-events-none absolute bottom-1.5 inset-x-1.5 flex items-center justify-end gap-1.5';

/** Always-visible preview column: the selected item, or a static skeleton with the same geometry. */
export function ImagePreview() {
  const previewImage = useTimelineStore((s) => s.previewImage);
  const isSelectionMode = useGroupUIStore((s) => s.isSelectionMode);
  return (
    <aside className="flex-1 min-w-0 h-full pr-3 pb-3">
      <div className="squircle relative h-full rounded-xl bg-popover shadow-float ring-1 ring-frame overflow-hidden">
        {/* ponytail: multi-select shows the skeleton (the selection bar holds the actions); stacked thumbs + count if that proves too bare */}
        {previewImage && !isSelectionMode
          ? <PreviewCard image={previewImage} showOnMap />
          : <PreviewSkeleton />}
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
        <ImageIcon className="size-8 opacity-60" strokeWidth={1.5} />
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

      <div className={ACTION_BAR}>
        <Button variant="secondary" disabled className="h-9 px-4">{t('preview.folder')}</Button>
        <Button variant="violet" disabled className="h-9 pl-3.5 pr-3">{t('nav.groups')}</Button>
      </div>
    </div>
  );
}

/** `navImages`: what prev/next walk over (default: the Timeline's filtered images).
 *  Cross-links live in the metadata rows: `showOnMap` = location row opens the map (Timeline → Map),
 *  `onShowInTimeline` = date row opens the Timeline on this photo (Map → Timeline). */
export function PreviewCard({ image: previewImage, navImages, showOnMap, onShowInTimeline }: {
  image: Image;
  navImages?: Image[];
  onShowInTimeline?: () => void;
  showOnMap?: boolean;
}) {
  const showOnMapHandler = useShowOnMap(previewImage);
  const { t } = useTranslation();
  const { selectImage, setPreviewImage, updateImageWebPath, images: timelineImages } = useTimelineStore();
  const images = navImages ?? timelineImages;
  const groups = useImageGroups(previewImage.id);
  const { config } = useAppConfigStore();
  const trashImages = useTrashImages();
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
                  <PlayIcon className="ml-1" fill="currentColor" />
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
          <XIcon />
        </MediaButton>
        {/* Favourite toggle — top-right like the star on grid thumbnails */}
        <FavouriteButton image={previewImage} className={cn(CHROME_BUTTON, 'absolute top-2 right-12')} />
        <MediaButton label={t('trash.moveToTrash')} onClick={() => trashImages([previewImage.id])} className={cn(CHROME_BUTTON, 'absolute top-2 right-22 text-destructive')}>
          <Trash2Icon />
        </MediaButton>
        <MediaButton label={t('preview.expand')} onClick={() => selectImage(previewImage)} className={cn(CHROME_BUTTON, 'absolute top-2 right-2')}>
          <Maximize2Icon />
        </MediaButton>
        {/* Prev/next stop at the ends: no wrap-around */}
        {currentIdx > 0 && (
          <MediaButton label={t('common.previous')} onClick={() => setPreviewImage(images[currentIdx - 1])} className={cn(CHROME_BUTTON, 'absolute left-2 top-1/2 -translate-y-1/2')}>
            <ChevronLeftIcon />
          </MediaButton>
        )}
        {currentIdx > -1 && currentIdx < images.length - 1 && (
          <MediaButton label={t('common.next')} onClick={() => setPreviewImage(images[currentIdx + 1])} className={cn(CHROME_BUTTON, 'absolute right-2 top-1/2 -translate-y-1/2')}>
            <ChevronRightIcon />
          </MediaButton>
        )}
      </div>

      {/* Scrollable metadata — bottom padding keeps the last rows clear of the floating bar.
          -mx-2 px-3: reaches into the card padding (text stays put) so link rows' hover fill has 8px each side unclipped */}
      <div className="flex-1 min-h-0 overflow-y-auto -mx-2 px-3 pb-14 scroll-inset [--scroll-inset-bottom:2.75rem]">
        <ImageMetadataView image={previewImage} groups={groups} readOnly onShowOnMap={showOnMap ? showOnMapHandler : undefined} onShowInTimeline={onShowInTimeline} />
      </div>

      {/* Floating actions: two separate pills, each styled by its role (DS §7) */}
      <div className={ACTION_BAR}>
        <FolderButton image={previewImage} />
        <GroupsButton groups={groups} side="top" />
      </div>
    </div>
  );
}

/** Opens the map zoomed on this photo; undefined when the photo has no location. */
function useShowOnMap(image: Image): (() => void) | undefined {
  const navigate = useNavigate();
  // Map pins also cover the dev mock coordinates, which never reach the Image record
  const hasPin = useMapStore((s) => s.locations.some((l) => l.id === image.id));
  if (!hasPin && (image.latitude == null || image.longitude == null)) return undefined;
  return () => navigate('/map', { state: { focusImageId: image.id } });
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
          <StarIcon fill={image.is_favourite ? 'currentColor' : 'none'} className={cn(image.is_favourite && 'animate-in zoom-in-50 duration-200')} />
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
          <FolderIcon />
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
          <ChevronUpIcon className={cn('opacity-80', side === 'bottom' && 'rotate-180')} />
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
    <LoaderCircleIcon className="animate-spin size-8 text-muted-foreground" />
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
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );
}
