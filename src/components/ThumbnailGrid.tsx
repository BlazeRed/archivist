import { useMemo, useCallback, useState, useRef, useEffect, memo, type ReactNode, type CSSProperties, type MouseEvent, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { flushSync } from 'react-dom';
import { List, RowComponentProps, useListRef } from 'react-window';
import { getThumbnailUrl } from '@/lib/archivePath';
import { gridNeighbour } from '@/lib/gridNav';
import { yearMonthKey, parseYearMonth } from '@/lib/dateKeys';
import { useTimelineStore } from '../stores/timelineStore';
import { useAppConfigStore } from '../stores/appConfigStore';
import { useGroupUIStore } from '../stores/groupUIStore';
import { useUIStore } from '../stores/uiStore';
import type { Image } from '../types';
import { useMonthNames } from '../lib/months';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { formatDuration } from '@/lib/formatDuration';

export const SIZES = {
  small:  { px: 120, cols: 6, gap: 8,  rowH: 134 },
  medium: { px: 180, cols: 4, gap: 10, rowH: 196 },
  large:  { px: 280, cols: 3, gap: 12, rowH: 296 },
} as const;

export type SizeKey = keyof typeof SIZES;

// The grid scrolls under the floating chrome: topbar (--topbar-offset 64) + 8 gap + FLOATING_ROW
export const FLOATING_TOP = 128;
// Floating pill row (36) + gap to the first row (20): the row sits this far above the content inset
export const FLOATING_ROW = 56;

export type DateField = 'taken_at' | 'imported_at';
// Thumbnails that already faded in once. Cells remount when the column count changes (images move
// between rows); without this they would all fade in again and the grid would flash.
const loadedThumbs = new Set<string>();

// Room at the end so the last row clears the floating selection bar: 12 margin + 48 bar + 8 gap + 36 count pill + 8
export const FLOATING_BOTTOM = 112;

type HeaderRow = { type: 'header'; label: string; images: Image[] };
type ImagesRow = { type: 'images'; images: Image[] };
type SpacerRow = { type: 'spacer'; height: number };
type TimelineRow = HeaderRow | ImagesRow | SpacerRow;

function buildRows(images: Image[], cols: number, noDateLabel: string, monthNames: string[], dateField: DateField): TimelineRow[] {
  const groups = new Map<string, Image[]>();

  for (const img of images) {
    const key = yearMonthKey(img[dateField]);
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

    rows.push({ type: 'header', label, images: imgs });

    for (let i = 0; i < imgs.length; i += cols) {
      rows.push({ type: 'images', images: imgs.slice(i, i + cols) });
    }
  }

  return rows;
}

type RowProps = {
  rows: TimelineRow[];
  sizeKey: SizeKey;
  cols: number;
  cellPx: number;
  archivePath: string;
  cacheBust: number;
  isSelectionMode: boolean;
  selectedImageIds: Set<string>;
  previewImageId: string | null;
  onImageClick: (img: Image, e: MouseEvent) => void;
  onToggleSelect: (id: string) => void;
  onSelectMonth?: (images: Image[]) => void;
};

export const ThumbnailCell = memo(function ThumbnailCell({
  image,
  archivePath,
  cacheBust,
  isSelectionMode,
  isSelected,
  isPreviewed,
  onImageClick,
  onToggleSelect,
}: {
  image: Image;
  archivePath: string;
  cacheBust: number;
  isSelectionMode: boolean;
  isSelected: boolean;
  isPreviewed: boolean;
  onImageClick: (img: Image, e: MouseEvent) => void;
  onToggleSelect: (id: string) => void;
}) {
  const { t } = useTranslation();
  const thumbnailUrl = getThumbnailUrl(archivePath, image.thumbnail_path, cacheBust);

  return (
    <div
      onClick={(e) => onImageClick(image, e)}
      className={cn(
        'group/thumb relative w-full aspect-square bg-card rounded-sm overflow-hidden cursor-pointer select-none flex-shrink-0 transition-[transform,box-shadow] duration-150 active:scale-[.97]',
        (isSelected || isPreviewed) && 'shadow-[0_0_0_2px_var(--background),0_0_0_5px_var(--gold)]'
      )}
    >
      {thumbnailUrl ? (
        <img
          src={thumbnailUrl}
          alt={image.filename}
          className={cn('w-full h-full object-cover transition-opacity duration-200', !loadedThumbs.has(thumbnailUrl) && 'opacity-0')}
          loading="lazy"
          onLoad={(e) => {
            loadedThumbs.add(thumbnailUrl);
            e.currentTarget.classList.remove('opacity-0');
          }}
        />
      ) : image.media_type === 'video' ? (
        <div className="w-full h-full flex flex-col items-center justify-center gap-1 text-foreground/40">
          <svg className="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="6" width="14" height="12" rx="2" />
            <path d="M16 10l6-3v10l-6-3V10z" />
          </svg>
          <svg className="w-4 h-4 opacity-60" viewBox="0 0 24 24" fill="currentColor">
            <path d="M8 5v14l11-7z" />
          </svg>
        </div>
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
      <div className="absolute inset-0 bg-black/15 opacity-0 group-hover/thumb:opacity-100 transition-opacity pointer-events-none" />


      {/* Video: duration pill (play glyph when duration is unknown) */}
      {image.media_type === 'video' && (
        <span className="absolute bottom-1.5 left-1.5 flex items-center gap-0.5 text-[10px] font-semibold tabular-nums text-white bg-[rgba(0,20,45,.55)] rounded-full px-1.5 leading-4 pointer-events-none">
          <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
          {image.duration_ms != null && formatDuration(image.duration_ms)}
        </span>
      )}

      {/* Favourite indicator: solid gold disc (same look as the active star in the preview), readable on any photo */}
      {image.is_favourite && (
        <Badge aria-hidden className="absolute top-1.5 right-1.5 size-5 p-0 bg-gold text-gold-foreground shadow-[0_1px_3px_rgba(0,0,0,.4)] pointer-events-none">
          <svg fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z" />
          </svg>
        </Badge>
      )}

      {/* Selection checkbox: same opaque disc as the favourite badge (readable on any photo); gold when checked, like the selection ring */}
      {isSelectionMode && (
        <Checkbox
          checked={isSelected}
          onClick={(e) => e.stopPropagation()}
          onCheckedChange={() => onToggleSelect(image.id)}
          aria-label={image.filename}
          className="absolute top-1.5 left-1.5 size-5 rounded-full border-0 bg-popover shadow-[0_1px_3px_rgba(0,0,0,.4)] dark:bg-popover data-checked:bg-gold data-checked:text-gold-foreground dark:data-checked:bg-gold"
        />
      )}

    </div>
  );
});

function TimelineRowComponent({
  index,
  style,
  rows,
  sizeKey,
  cols,
  cellPx,
  archivePath,
  cacheBust,
  isSelectionMode,
  selectedImageIds,
  previewImageId,
  onImageClick,
  onToggleSelect,
  onSelectMonth,
}: RowComponentProps<RowProps>) {
  const { t } = useTranslation();
  const row = rows[index];
  const size = SIZES[sizeKey];

  if (row.type === 'spacer') return <div style={style} />;

  if (row.type === 'header') {
    return (
      <div style={style} className="flex items-end pb-1 px-6 bg-background">
        {onSelectMonth ? (
          <Button
            variant="ghost"
            size="xs"
            onClick={() => onSelectMonth(row.images)}
            className="group/month -mx-2 text-xs font-semibold text-muted-foreground tracking-[0.02em]"
          >
            {row.label}
            <span className="font-normal opacity-0 group-hover/month:opacity-100 group-focus-visible/month:opacity-100 transition-opacity">
              · {t(row.images.every(img => selectedImageIds.has(img.id)) ? 'timeline.deselectMonth' : 'timeline.selectMonth')}
            </span>
          </Button>
        ) : (
          <span className="text-xs font-semibold text-muted-foreground tracking-[0.02em]">{row.label}</span>
        )}
      </div>
    );
  }

  return (
    <div style={style} className="flex items-start px-6 pt-2">
      <div className="grid w-full" style={{ gap: size.gap, gridTemplateColumns: `repeat(${cols}, ${cellPx}px)` }}>
        {row.images.map(img => (
          <ThumbnailCell
            key={img.id}
            image={img}
            archivePath={archivePath}
            cacheBust={cacheBust}
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

type MonthGridProps = {
  images: Image[];
  dateField?: DateField;
  emptyText: string;
  isSelectionMode: boolean;
  selectedIds: Set<string>;
  previewImageId?: string | null;
  onImageClick: (img: Image, e: MouseEvent) => void;
  onToggleSelect: (id: string) => void;
  /** Makes month headers clickable (select/deselect the whole month) */
  onSelectMonth?: (images: Image[]) => void;
  /** Left of the floating row, before the current month pill */
  leading?: ReactNode;
  /** Right of the floating row */
  toolbar?: ReactNode;
  /** Distance from the top of the scroller to the first row. The floating row sits FLOATING_ROW above it */
  insetTop?: number;
  /** Receives the image rows on every render (for keyboard navigation in grid order) */
  gridRowsRef?: RefObject<Image[][]>;
};

/** Virtualized grid grouped by month. Scrolls under floating chrome: renders the scroll-edge fade and the
 *  floating row (leading + current month pill left, toolbar right), and keeps `previewImageId` in view. */
export function MonthGrid({
  images,
  dateField = 'taken_at',
  emptyText,
  isSelectionMode,
  selectedIds,
  previewImageId = null,
  onImageClick,
  onToggleSelect,
  onSelectMonth,
  leading,
  toolbar,
  insetTop = FLOATING_TOP,
  gridRowsRef,
}: MonthGridProps) {
  const { t } = useTranslation();
  const { config } = useAppConfigStore();
  const thumbnailCacheBust = useUIStore((s) => s.thumbnailCacheBust);
  const [stickyLabel, setStickyLabel] = useState('');

  const monthNames = useMonthNames();
  const sizeKey = config.thumbnail_size as SizeKey;
  const size = SIZES[sizeKey];

  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    // flushSync: re-layout before the browser paints. Otherwise one frame shows the old columns
    // stretched to the new width (visible size jump when the preview card closes).
    const ro = new ResizeObserver(entries => {
      flushSync(() => setContainerWidth(entries[0].contentRect.width));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const PADDING = 48; // px-6 both sides
  // size.px is the minimum cell size: cells stretch so the row always fills the width
  const innerWidth = containerWidth - PADDING;
  const dynamicCols = containerWidth > 0
    ? Math.max(1, Math.floor((innerWidth + size.gap) / (size.px + size.gap)))
    : size.cols;
  const cellPx = containerWidth > 0
    ? (innerWidth - size.gap * (dynamicCols - 1)) / dynamicCols
    : size.px;
  const rowH = Math.ceil(cellPx) + (size.rowH - size.px);

  const rows = useMemo<TimelineRow[]>(
    () => [
      { type: 'spacer', height: insetTop },
      ...buildRows(images, dynamicCols, t('timeline.noDateHeader'), monthNames, dateField),
      { type: 'spacer', height: FLOATING_BOTTOM },
    ],
    [images, dynamicCols, t, monthNames, dateField, insetTop]
  );

  const getRowHeight = useCallback(
    (index: number) => {
      const row = rows[index];
      if (row?.type === 'spacer') return row.height;
      return row?.type === 'header' ? 40 : rowH;
    },
    [rows, rowH]
  );

  const listRef = useListRef(null);
  // Image rows only, plus each one's index in `rows` (for scrolling)
  const { gridRows, listIndex } = useMemo(() => {
    const listIndex: number[] = [];
    const gridRows: Image[][] = [];
    rows.forEach((row, i) => {
      if (row.type === 'images') { listIndex.push(i); gridRows.push(row.images); }
    });
    return { gridRows, listIndex };
  }, [rows]);
  if (gridRowsRef) gridRowsRef.current = gridRows;

  // Keep the previewed item in view, whatever moved it (keys, preview arrows, fullscreen navigation)
  useEffect(() => {
    if (!previewImageId) return;
    const r = gridRows.findIndex(row => row.some(img => img.id === previewImageId));
    if (r !== -1) listRef.current?.scrollToRow({ index: listIndex[r], align: 'smart' });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewImageId]);

  const rowProps = useMemo<RowProps>(
    () => ({
      rows,
      sizeKey,
      cols: dynamicCols,
      cellPx: Math.floor(cellPx),
      archivePath: config.archive_path,
      cacheBust: thumbnailCacheBust,
      isSelectionMode,
      selectedImageIds: selectedIds,
      previewImageId,
      onImageClick,
      onToggleSelect,
      onSelectMonth,
    }),
    [rows, sizeKey, dynamicCols, cellPx, config.archive_path, thumbnailCacheBust, isSelectionMode, selectedIds, previewImageId, onImageClick, onToggleSelect, onSelectMonth]
  );

  const handleRowsRendered = useCallback(
    (visibleRows: { startIndex: number; stopIndex: number }) => {
      for (let i = visibleRows.startIndex; i >= 0; i--) {
        if (rows[i]?.type === 'header') {
          setStickyLabel((rows[i] as HeaderRow).label);
          return;
        }
      }
      // At the very top only the spacer precedes the first month
      const first = rows.find((r): r is HeaderRow => r.type === 'header');
      setStickyLabel(first?.label ?? '');
    },
    [rows]
  );

  let body: ReactNode;
  // Reloads (after trash/restore/bulk favourite) keep the list mounted: unmounting it would reset the scroll to the top
  if (images.length === 0) {
    body = (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">{emptyText}</p>
      </div>
    );
  } else {
    body = (
      <List
        listRef={listRef}
        rowComponent={TimelineRowComponent}
        rowCount={rows.length}
        rowHeight={getRowHeight}
        rowProps={rowProps}
        onRowsRendered={handleRowsRendered}
        className="h-full scroll-inset"
        style={{ height: '100%', '--scroll-inset-top': `${insetTop}px`, '--scroll-inset-bottom': '12px' } as CSSProperties}
      />
    );
  }

  return (
    <div ref={containerRef} className="relative h-full">
      {body}

      {/* Scroll-edge fade: photos dissolve as they pass under the floating chrome */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 z-10 bg-linear-to-b from-background from-55% to-transparent"
        style={{ height: insetTop + 8 }}
      />

      {/* Floating row: leading + current month (left), toolbar (right) */}
      <div
        className="pointer-events-none absolute inset-x-0 z-20 flex items-start justify-between gap-3 px-4"
        style={{ top: insetTop - FLOATING_ROW }}
      >
        <div className="flex items-center gap-2 min-w-0">
          {leading && <div className="pointer-events-auto min-w-0">{leading}</div>}
          {stickyLabel && images.length > 0 && (
            <Badge variant="outline" className="pointer-events-auto cursor-default select-none h-9 px-4 border-0 bg-popover text-popover-foreground shadow-float text-[13px] font-semibold animate-in fade-in duration-200">
              {stickyLabel}
            </Badge>
          )}
        </div>
        <div className="pointer-events-auto">{toolbar}</div>
      </div>
    </div>
  );
}

/** Timeline grid: MonthGrid wired to the timeline store (preview, keyboard navigation, multi-selection). */
export function ThumbnailGrid({ toolbar }: { toolbar?: ReactNode }) {
  const { t } = useTranslation();
  const { images, setPreviewImage, previewImage, loading } = useTimelineStore();
  const { isSelectionMode, selectedImageIds, toggleSelection } = useGroupUIStore();
  const gridRowsRef = useRef<Image[][]>([]);

  // Keyboard: arrows move the preview in grid order, Enter opens fullscreen, Esc back to the skeleton.
  // The fullscreen viewer owns the keys while open; widgets that use arrows themselves keep them.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
      const { previewImage, selectedImage, setPreviewImage, selectImage } = useTimelineStore.getState();
      if (!previewImage || selectedImage || isSelectionMode || useUIStore.getState().settingsOpen) return;
      const target = e.target as Element | null;
      if (target?.closest?.('input, textarea, select, video, [role="listbox"], [role="dialog"], [role="menu"], [role="group"], [role="radiogroup"], [role="slider"]')) return;

      if (e.key === 'Escape') {
        setPreviewImage(null);
      } else if (e.key === 'Enter') {
        if (target?.closest?.('button, a')) return; // Enter activates the focused button instead
        selectImage(previewImage);
      } else {
        const gridRows = gridRowsRef.current;
        const pos = gridNeighbour(gridRows, previewImage.id, e.key);
        if (!pos) return;
        setPreviewImage(gridRows[pos[0]][pos[1]]);
      }
      e.preventDefault();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isSelectionMode]);

  const handleImageClick = useCallback(
    (img: Image, e: MouseEvent) => {
      const { isSelectionMode, lastSelectedId, setSelectionMode, addToSelection } = useGroupUIStore.getState();
      // Shift-click: select everything between the last clicked item and this one, in timeline order
      if (e.shiftKey && isSelectionMode && lastSelectedId) {
        const ids = images.map(i => i.id);
        const from = ids.indexOf(lastSelectedId);
        const to = ids.indexOf(img.id);
        if (from !== -1 && to !== -1) {
          addToSelection(ids.slice(Math.min(from, to), Math.max(from, to) + 1), img.id);
          return;
        }
      }
      // Cmd/Ctrl-click (or Shift with no anchor) starts a selection
      if (isSelectionMode || e.metaKey || e.ctrlKey || e.shiftKey) {
        setSelectionMode(true);
        toggleSelection(img.id);
      } else {
        // Clicking the previewed image again closes the preview
        setPreviewImage(img.id === previewImage?.id ? null : img);
      }
    },
    [images, toggleSelection, setPreviewImage, previewImage?.id]
  );

  return (
    <MonthGrid
      images={images}
      emptyText={t(loading ? 'common.loading' : 'timeline.noMedia')}
      isSelectionMode={isSelectionMode}
      selectedIds={selectedImageIds}
      previewImageId={previewImage?.id ?? null}
      onImageClick={handleImageClick}
      onToggleSelect={toggleSelection}
      toolbar={toolbar}
      gridRowsRef={gridRowsRef}
    />
  );
}
