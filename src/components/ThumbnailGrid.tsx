import { useMemo, useCallback, useState, useRef, useEffect, memo } from 'react';
import { useTranslation } from 'react-i18next';
import { List, RowComponentProps } from 'react-window';
import { getThumbnailUrl } from '@/lib/archivePath';
import { yearMonthKey, parseYearMonth } from '@/lib/dateKeys';
import { useTimelineStore } from '../stores/timelineStore';
import { useAppConfigStore } from '../stores/appConfigStore';
import { useGroupUIStore } from '../stores/groupUIStore';
import type { Image } from '../types';
import { useMonthNames } from '../lib/months';
import { cn } from '@/lib/utils';

const SIZES = {
  small:  { px: 120, cols: 6, gap: 8,  rowH: 134 },
  medium: { px: 180, cols: 4, gap: 10, rowH: 196 },
  large:  { px: 280, cols: 3, gap: 12, rowH: 296 },
} as const;

type SizeKey = keyof typeof SIZES;

type HeaderRow = { type: 'header'; label: string };
type ImagesRow = { type: 'images'; images: Image[] };
type TimelineRow = HeaderRow | ImagesRow;

function buildRows(images: Image[], cols: number, noDateLabel: string, monthNames: string[]): TimelineRow[] {
  const groups = new Map<string, Image[]>();

  for (const img of images) {
    const key = yearMonthKey(img.taken_at);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(img);
  }

  // Sort: dated groups desc, No Date last
  const sortedKeys = [...groups.keys()].sort((a, b) => {
    if (a === '__nodate__') return 1;
    if (b === '__nodate__') return -1;
    return b.localeCompare(a);
  });

  const rows: TimelineRow[] = [];
  for (const key of sortedKeys) {
    const imgs = groups.get(key)!;

    let label: string;
    if (key === '__nodate__') {
      label = noDateLabel;
    } else {
      const ym = parseYearMonth(key)!;
      label = `${ym.year}  ›  ${monthNames[ym.month - 1]}`;
    }

    rows.push({ type: 'header', label });

    for (let i = 0; i < imgs.length; i += cols) {
      rows.push({ type: 'images', images: imgs.slice(i, i + cols) });
    }
  }

  return rows;
}

type RowProps = {
  rows: TimelineRow[];
  sizeKey: SizeKey;
  archivePath: string;
  isSelectionMode: boolean;
  selectedImageIds: Set<string>;
  previewImageId: string | null;
  onImageClick: (img: Image) => void;
  onToggleSelect: (id: string) => void;
};

const ThumbnailCell = memo(function ThumbnailCell({
  image,
  archivePath,
  sizeKey,
  isSelectionMode,
  isSelected,
  isPreviewed,
  onImageClick,
  onToggleSelect,
}: {
  image: Image;
  archivePath: string;
  sizeKey: SizeKey;
  isSelectionMode: boolean;
  isSelected: boolean;
  isPreviewed: boolean;
  onImageClick: (img: Image) => void;
  onToggleSelect: (id: string) => void;
}) {
  const { t } = useTranslation();
  const { px } = SIZES[sizeKey];
  const thumbnailUrl = getThumbnailUrl(archivePath, image.thumbnail_path);

  return (
    <div
      style={{ width: px, height: px }}
      onClick={() => onImageClick(image)}
      className={cn(
        'group/thumb relative bg-card border rounded-md overflow-hidden cursor-pointer flex-shrink-0 transition-shadow hover:shadow-lg',
        isSelected
          ? 'ring-2 ring-primary border-primary'
          : isPreviewed
            ? 'ring-2 ring-primary/60 border-primary/60'
            : 'border-border'
      )}
    >
      {thumbnailUrl ? (
        <img
          src={thumbnailUrl}
          alt={image.filename}
          className="w-full h-full object-cover"
          loading="lazy"
        />
      ) : (
        <div className="w-full h-full flex flex-col items-center justify-center gap-1 text-foreground/40">
          <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
            <line x1="3" y1="3" x2="21" y2="21"/>
            <circle cx="8.5" cy="8.5" r="1.5"/>
          </svg>
          <p className="text-[8px] text-center px-1 leading-tight">{t('common.noThumbnail')}</p>
        </div>
      )}

      {/* Hover dark overlay */}
      <div className="absolute inset-0 bg-black/30 opacity-0 group-hover/thumb:opacity-100 transition-opacity pointer-events-none" />


      {/* Favourite indicator */}
      {image.is_favourite && (
        <div className="absolute bottom-6 right-1 w-5 h-5 rounded-full bg-black/50 flex items-center justify-center pointer-events-none">
          <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 24 24">
            <path d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
          </svg>
        </div>
      )}

      {/* Selection checkbox */}
      {isSelectionMode && (
        <div
          className="absolute top-1 left-1"
          onClick={(e) => { e.stopPropagation(); onToggleSelect(image.id); }}
        >
          <div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${
            isSelected ? 'bg-primary border-primary' : 'bg-white/80 border-foreground/40'
          }`}>
            {isSelected && (
              <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
            )}
          </div>
        </div>
      )}

      {/* Filename bar — always visible when previewed, hover only otherwise */}
      <div className={cn(
        'absolute bottom-0 left-0 right-0 bg-foreground px-1 py-0.5 transition-opacity pointer-events-none',
        isPreviewed ? 'opacity-100' : 'opacity-0 group-hover/thumb:opacity-100'
      )}>
        <p className="text-[10px] text-white truncate">{image.filename}</p>
      </div>
    </div>
  );
});

function TimelineRowComponent({
  index,
  style,
  rows,
  sizeKey,
  archivePath,
  isSelectionMode,
  selectedImageIds,
  previewImageId,
  onImageClick,
  onToggleSelect,
}: RowComponentProps<RowProps>) {
  const row = rows[index];
  const size = SIZES[sizeKey];

  if (row.type === 'header') {
    return (
      <div style={style} className="flex items-center px-6 bg-background border-b border-foreground/12">
        <span className="text-[13px] font-semibold text-foreground tracking-wide">{row.label}</span>
      </div>
    );
  }

  return (
    <div style={style} className="flex items-start px-6 pt-2">
      <div className="flex flex-wrap" style={{ gap: size.gap }}>
        {row.images.map(img => (
          <ThumbnailCell
            key={img.id}
            image={img}
            archivePath={archivePath}
            sizeKey={sizeKey}
            isSelectionMode={isSelectionMode}
            isSelected={selectedImageIds.has(img.id)}
            isPreviewed={previewImageId === img.id}
            onImageClick={onImageClick}
            onToggleSelect={onToggleSelect}
          />
        ))}
      </div>
    </div>
  );
}

export function ThumbnailGrid() {
  const { t } = useTranslation();
  const { images, setPreviewImage, previewImage, loading } = useTimelineStore();
  const { config } = useAppConfigStore();
  const { isSelectionMode, selectedImageIds, toggleSelection } = useGroupUIStore();
  const [stickyLabel, setStickyLabel] = useState('');
  const [scrollVisible, setScrollVisible] = useState(false);
  const [scrollFraction, setScrollFraction] = useState(0);
  const scrollHideTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const el = e.target as HTMLElement;
    const max = el.scrollHeight - el.clientHeight;
    if (max <= 0) return;
    setScrollFraction(el.scrollTop / max);
    setScrollVisible(true);
    clearTimeout(scrollHideTimer.current);
    scrollHideTimer.current = setTimeout(() => setScrollVisible(false), 1500);
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    if (e.clientX >= rect.right - 20) {
      setScrollVisible(true);
      clearTimeout(scrollHideTimer.current);
      scrollHideTimer.current = setTimeout(() => setScrollVisible(false), 1500);
    }
  }, []);

  const monthNames = useMonthNames();
  const sizeKey = config.thumbnail_size as SizeKey;
  const size = SIZES[sizeKey];

  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      setContainerWidth(entries[0].contentRect.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const PADDING = 48; // px-6 both sides
  const dynamicCols = containerWidth > 0
    ? Math.max(1, Math.floor((containerWidth - PADDING) / (size.px + size.gap)))
    : size.cols;

  const rows = useMemo(
    () => buildRows(images, dynamicCols, t('timeline.noDateHeader'), monthNames),
    [images, dynamicCols, t, monthNames]
  );

  const getRowHeight = useCallback(
    (index: number) => (rows[index]?.type === 'header' ? 40 : size.rowH),
    [rows, size.rowH]
  );

  const handleImageClick = useCallback(
    (img: Image) => {
      if (isSelectionMode) {
        toggleSelection(img.id);
      } else {
        setPreviewImage(img);
      }
    },
    [isSelectionMode, toggleSelection, setPreviewImage]
  );

  const rowProps = useMemo<RowProps>(
    () => ({
      rows,
      sizeKey,
      archivePath: config.archive_path,
      isSelectionMode,
      selectedImageIds,
      previewImageId: previewImage?.id ?? null,
      onImageClick: handleImageClick,
      onToggleSelect: toggleSelection,
    }),
    [rows, sizeKey, config.archive_path, isSelectionMode, selectedImageIds, previewImage?.id, handleImageClick, toggleSelection]
  );

  const handleRowsRendered = useCallback(
    (visibleRows: { startIndex: number; stopIndex: number }) => {
      for (let i = visibleRows.startIndex; i >= 0; i--) {
        if (rows[i]?.type === 'header') {
          setStickyLabel((rows[i] as HeaderRow).label);
          return;
        }
      }
    },
    [rows]
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">{t('common.loading')}</p>
      </div>
    );
  }

  if (images.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">{t('timeline.noPhotos')}</p>
      </div>
    );
  }

  const containerH = containerRef.current?.clientHeight ?? 0;
  const thumbH = Math.max(40, containerH * 0.05);
  const labelTop = scrollFraction * (containerH - thumbH) + thumbH / 2;

  return (
    <div
      ref={containerRef}
      className="relative h-full"
      onScrollCapture={handleScroll}
      onMouseMove={handleMouseMove}
    >
      {/* Sticky header overlay */}
      {stickyLabel && (
        <div className="absolute top-0 left-0 right-0 z-10 h-10 flex items-center px-6 bg-background/95 backdrop-blur-sm border-b border-foreground/12 pointer-events-none">
          <span className="text-[13px] font-semibold text-foreground tracking-wide">{stickyLabel}</span>
        </div>
      )}

      <List
        rowComponent={TimelineRowComponent}
        rowCount={rows.length}
        rowHeight={getRowHeight}
        rowProps={rowProps}
        onRowsRendered={handleRowsRendered}
        className="h-full"
        style={{ height: '100%' }}
      />

      {/* Scrollbar date label */}
      {stickyLabel && (
        <div
          className={cn(
            'pointer-events-none absolute right-5 z-20 px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap',
            'bg-foreground/80 text-background shadow-sm',
            'transition-opacity duration-150',
            scrollVisible ? 'opacity-100' : 'opacity-0'
          )}
          style={{ top: labelTop, transform: 'translateY(-50%)' }}
        >
          {stickyLabel}
        </div>
      )}
    </div>
  );
}
