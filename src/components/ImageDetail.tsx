import { useState, useEffect, useRef } from 'react';
import { ArrowLeftIcon, ChevronLeftIcon, ChevronRightIcon, InfoIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import { toast } from 'sonner';
import { trimArchivePath } from '@/lib/archivePath';
import { makeVideoUrl } from '@/lib/mediaServer';
import { useTimelineStore } from '../stores/timelineStore';
import { useAppConfigStore } from '../stores/appConfigStore';
import { ImageMetadataView, useImageGroups, formatDate } from './ImageMetadata';
import { FavouriteButton, FolderButton, GroupsButton, MediaButton, Spinner, CHROME_BUTTON } from './ImagePreview';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { Image } from '../types';

const EASE_OUT = 'cubic-bezier(.2,.8,.2,1)';
const EASE_IN = 'cubic-bezier(.4,0,1,1)';
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Where the photo is drawn inside the Timeline preview frame (object-contain); null off the Timeline. */
function previewPhotoRect(img: HTMLImageElement): DOMRect | null {
  const frame = document.querySelector('[data-preview-media]')?.getBoundingClientRect();
  if (!frame || !img.naturalWidth) return null;
  const s = Math.min(frame.width / img.naturalWidth, frame.height / img.naturalHeight);
  const w = img.naturalWidth * s;
  const h = img.naturalHeight * s;
  return new DOMRect(frame.left + (frame.width - w) / 2, frame.top + (frame.height - h) / 2, w, h);
}

/** FLIP keyframe that draws an element laid out at `to` on top of `from` (same aspect, origin top-left). */
function placedAt(from: DOMRect, to: DOMRect): Keyframe {
  return { opacity: 1, transform: `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${from.width / to.width})` };
}

/** Fullscreen viewer. Opens when `selectedImage` is set; navigation stops at the ends of `navImages`. */
export function ImageDetail({ hideGroups, navImages }: { hideGroups?: boolean; navImages?: Image[] }) {
  const selectedImage = useTimelineStore((s) => s.selectedImage);
  if (!selectedImage) return null;
  return <Viewer image={selectedImage} hideGroups={hideGroups} navImages={navImages} />;
}

function Viewer({ image, hideGroups, navImages }: { image: Image; hideGroups?: boolean; navImages?: Image[] }) {
  const { t } = useTranslation();
  const selectImage = useTimelineStore((s) => s.selectImage);
  const { config } = useAppConfigStore();
  const groups = useImageGroups(image.id);

  const [imageLoaded, setImageLoaded] = useState(false);
  const [imgSrc, setImgSrc] = useState('');
  const [transcoding, setTranscoding] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);

  const rootRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const uiRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const openedId = useRef(image.id); // only the photo the viewer opened on zooms in
  const closing = useRef(false);

  const archivePath = trimArchivePath(config.archive_path);

  // Reset when the image changes
  useEffect(() => {
    setImageLoaded(false);
    setImgSrc('');
    setTranscoding(false);
  }, [image.id]);

  // Rebuild URL when web_path updates (without resetting transcoding)
  useEffect(() => {
    if (!archivePath) { setImgSrc(''); return; }
    if (image.media_type === 'video') {
      if (!image.web_path) { setImgSrc(''); return; }
      let cancelled = false;
      makeVideoUrl(archivePath, image.web_path).then(url => {
        if (!cancelled) setImgSrc(url);
      });
      return () => { cancelled = true; };
    }
    const url = image.file_path ? convertFileSrc(`${archivePath}/${image.file_path}`) : '';
    const id = requestAnimationFrame(() => setImgSrc(url));
    return () => cancelAnimationFrame(id);
  }, [image.id, image.media_type, image.web_path, image.file_path, archivePath]);

  // Auto-transcode when the viewer opens on an untranscoded video
  useEffect(() => {
    if (image.media_type !== 'video' || image.web_path || !archivePath) return;

    let cancelled = false;
    setTranscoding(true);
    toast.info(t('preview.transcoding'));

    invoke<string>('transcode_video', {
      imageId: image.id,
      filePath: image.file_path,
    }).then((webPath) => {
      if (cancelled) return;
      useTimelineStore.getState().updateImageWebPath(image.id, webPath);
    }).catch((e) => {
      if (cancelled) return;
      console.error('[transcode] detail failed:', e);
      toast.error(t('preview.transcodeError'));
    }).finally(() => {
      if (!cancelled) setTranscoding(false);
    });

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [image.id]);

  const idx = navImages ? navImages.findIndex(img => img.id === image.id) : -1;
  const prev = idx > 0 ? navImages![idx - 1] : null;
  const next = idx > -1 && idx < navImages!.length - 1 ? navImages![idx + 1] : null;

  // Open: the photo grows out of the preview frame (fade only when there is no preview to grow from)
  const handleLoad = () => {
    setImageLoaded(true);
    const img = imgRef.current;
    if (!img || image.id !== openedId.current) return;
    openedId.current = '';
    const from = previewPhotoRect(img);
    if (!from || reducedMotion()) return;
    img.animate([placedAt(from, img.getBoundingClientRect()), { opacity: 1, transform: 'none' }], { duration: 300, easing: EASE_OUT });
  };

  // Close: reverse — backdrop and chrome fade while the photo flies back into the preview frame
  const close = () => {
    if (closing.current) return;
    closing.current = true;
    const done = () => selectImage(null);
    if (reducedMotion()) { done(); return; }
    const opts = { duration: 200, easing: EASE_IN, fill: 'forwards' as const };
    const fade = [{ opacity: 1 }, { opacity: 0 }];
    const img = imgRef.current;
    const to = img && imageLoaded ? previewPhotoRect(img) : null;
    if (img && to) {
      backdropRef.current?.animate(fade, opts);
      uiRef.current?.animate(fade, opts);
      img.animate([{ opacity: 1, transform: 'none' }, placedAt(to, img.getBoundingClientRect())], opts).finished.then(done);
    } else {
      rootRef.current?.animate(fade, opts).finished.then(done);
    }
  };

  // Keys: ←/→ navigate (no wrap), Esc closes. Open menus/popovers keep their own keys.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      if ((e.target as Element | null)?.closest?.('input, textarea, video, [role="listbox"], [role="dialog"], [role="menu"]')) return;
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowLeft' && prev) selectImage(prev);
      else if (e.key === 'ArrowRight' && next) selectImage(next);
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  return (
    <div ref={rootRef} className="fixed inset-0 z-50">
      {/* Backdrop follows the theme: light in light theme (the viewer stays part of the app), dark letterbox in dark */}
      <div ref={backdropRef} className="absolute inset-0 bg-background dark:bg-media animate-in fade-in duration-300" />

      {/* Photo layer: as large as possible between the chrome and the (optional) info panel */}
      <div className={cn('pointer-events-none absolute inset-0 flex items-center justify-center pt-18 pb-6 pl-16', infoOpen ? 'pr-[23rem]' : 'pr-16')}>
        {image.media_type !== 'video' && !imageLoaded && (
          <div className="absolute inset-0 flex items-center justify-center"><Spinner /></div>
        )}
        {image.media_type !== 'video' && imgSrc && (
          <img
            ref={imgRef}
            src={imgSrc}
            alt={image.filename}
            decoding="async"
            onLoad={handleLoad}
            style={{ transformOrigin: '0 0' }}
            className={cn('pointer-events-auto max-w-full max-h-full object-contain shadow-float dark:shadow-none transition-opacity duration-200', imageLoaded ? 'opacity-100' : 'opacity-0')}
          />
        )}
        {image.media_type === 'video' && (transcoding || !imgSrc) && (
          <div className="flex flex-col items-center gap-2 text-muted-foreground text-sm text-center px-6">
            <Spinner />
            {transcoding && <span>{t('preview.transcoding')}</span>}
          </div>
        )}
        {image.media_type === 'video' && !transcoding && imgSrc && (
          <video
            controls
            autoPlay
            onError={(e) => {
              const v = e.currentTarget;
              console.error('[video] detail error:', v.error?.code, v.error?.message, 'networkState:', v.networkState, 'src:', imgSrc);
            }}
            className="pointer-events-auto max-w-full max-h-full object-contain"
          >
            <source src={imgSrc} type="video/webm" />
          </video>
        )}
      </div>

      {/* Floating chrome — fades in just after the photo */}
      <div ref={uiRef} className="pointer-events-none absolute inset-0 animate-in fade-in duration-300 delay-100 fill-mode-backwards">
        <div className="absolute top-3 inset-x-3 flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <MediaButton label={t('common.close')} onClick={close} className={CHROME_BUTTON}>
              <ArrowLeftIcon />
            </MediaButton>
            <Badge variant="outline" className="h-9 min-w-0 max-w-[40vw] gap-2 px-4 border-0 bg-popover text-popover-foreground shadow-float text-[13px]">
              <span className="truncate font-semibold">{image.filename}</span>
              {image.taken_at && <span className="shrink-0 text-muted-foreground">{formatDate(image.taken_at, '')}</span>}
            </Badge>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <FavouriteButton image={image} className={CHROME_BUTTON} />
            <FolderButton image={image} />
            {!hideGroups && <GroupsButton groups={groups} side="bottom" />}
            <MediaButton label={t('detail.title')} pressed={infoOpen} onClick={() => setInfoOpen(o => !o)} className={cn(CHROME_BUTTON, infoOpen && 'bg-primary text-primary-foreground hover:bg-primary')}>
              <InfoIcon />
            </MediaButton>
          </div>
        </div>

        {/* Prev/next stop at the ends: no wrap-around */}
        {prev && (
          <MediaButton label={t('common.previous')} onClick={() => selectImage(prev)} className={cn(CHROME_BUTTON, 'absolute left-4 top-1/2 -translate-y-1/2 size-11')}>
            <ChevronLeftIcon />
          </MediaButton>
        )}
        {next && (
          <MediaButton label={t('common.next')} onClick={() => selectImage(next)} className={cn(CHROME_BUTTON, 'absolute top-1/2 -translate-y-1/2 size-11', infoOpen ? 'right-[21rem]' : 'right-4')}>
            <ChevronRightIcon />
          </MediaButton>
        )}

        {/* Info panel: closed by default — opening fullscreen is about the photo */}
        {infoOpen && (
          <aside className="pointer-events-auto absolute top-18 right-3 bottom-3 w-80 animate-in fade-in slide-in-from-right-8 duration-300 ease-[cubic-bezier(.2,.8,.2,1)]">
            <div className="squircle h-full overflow-y-auto rounded-xl bg-popover p-4 shadow-float ring-1 ring-frame">
              <ImageMetadataView image={image} groups={groups} hideGroups={hideGroups} readOnly />
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
