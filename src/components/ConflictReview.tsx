import { useMemo, useCallback } from 'react';
import { ImageOffIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { convertFileSrc } from '@tauri-apps/api/core';
import { List, RowComponentProps } from 'react-window';
import { useImportStore, ImportAction, AnalyzedImage } from '../stores/importStore';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

const ACTIONS: ImportAction[] = ['Skip', 'KeepBoth', 'Replace'];
// Card (10 + 76 + 10) + 2px top / 8px bottom spacing around it
const ROW_HEIGHT = 106;

function actionLabel(action: ImportAction, t: (k: string) => string): string {
  if (action === 'KeepBoth') return t('conflicts.keepBoth');
  if (action === 'Replace') return t('conflicts.replace');
  return t('conflicts.keepExisting');
}

/** Resolution choice: segmented pill control, same as the topbar nav (spec §10 "Conflict review card"). */
function ActionToggle({
  value,
  onChange,
}: {
  value: ImportAction | null;
  onChange: (action: ImportAction) => void;
}) {
  const { t } = useTranslation();
  return (
    <ToggleGroup
      type="single"
      variant="segmented"
      spacing={0.5}
      value={value ?? ''}
      onValueChange={(v) => { if (v) onChange(v as ImportAction); }}
      className="bg-muted rounded-full p-[3px]"
    >
      {ACTIONS.map((action) => (
        <ToggleGroupItem key={action} value={action} className="h-7 px-3 text-xs">
          {actionLabel(action, t)}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

/** 64px thumb; the label sits on the image (same badge as the grid's video duration) to save a line. */
function PreviewThumb({ src, label, filename }: { src: string; label: string; filename: string }) {
  return (
    <div className="relative size-16 shrink-0 rounded-md overflow-hidden bg-media">
      {src ? (
        <img src={src} alt={filename} className="w-full h-full object-cover" loading="lazy" />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-muted-foreground">
          <ImageOffIcon className="size-5" strokeWidth={1.5} />
        </div>
      )}
      <span className="absolute bottom-1 left-1 text-[9px] font-semibold text-white bg-[rgba(0,20,45,.55)] rounded-full px-1.5 leading-4 pointer-events-none">
        {label}
      </span>
    </div>
  );
}

function ConflictRowInner({
  img,
  archivePath,
  selected,
  onSelect,
}: {
  img: AnalyzedImage;
  archivePath: string;
  selected: ImportAction;
  onSelect: (action: ImportAction) => void;
}) {
  const { t } = useTranslation();
  const incomingUrl = convertFileSrc(`${archivePath}/.archivist/thumbnails/${img.hash}.jpg`);
  const existingUrl = img.conflict?.existing_id
    ? convertFileSrc(`${archivePath}/.archivist/thumbnails/${img.conflict.existing_id}.jpg`)
    : '';
  const existing = [
    img.conflict?.existing_path,
    img.conflict?.existing_date && new Date(img.conflict.existing_date).toLocaleDateString(),
  ].filter(Boolean).join(' · ');

  return (
    <div className="squircle p-2.5 bg-popover rounded-lg shadow-raised flex items-center gap-3">
      <div className="flex gap-2 shrink-0">
        <PreviewThumb src={incomingUrl} label={t('conflicts.incoming')} filename={img.filename} />
        <PreviewThumb src={existingUrl} label={t('conflicts.inArchive')} filename={img.conflict?.existing_path ?? ''} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">{img.filename}</p>
        <p className="text-[11px] text-muted-foreground truncate mb-1.5">{existing}</p>
        <ActionToggle value={selected} onChange={onSelect} />
      </div>
    </div>
  );
}

type RowData = {
  conflicts: AnalyzedImage[];
  archivePath: string;
  getAction: (hash: string) => ImportAction;
  setResolution: (hash: string, action: ImportAction) => void;
};

function ConflictRowRenderer({
  index,
  style,
  conflicts,
  archivePath,
  getAction,
  setResolution,
}: RowComponentProps<RowData>) {
  const img = conflicts[index];
  return (
    <div style={{ ...style, padding: '2px 4px 8px' }}>
      <ConflictRowInner
        img={img}
        archivePath={archivePath}
        selected={getAction(img.hash)}
        onSelect={(action) => setResolution(img.hash, action)}
      />
    </div>
  );
}

/** Review body: summary + duplicate list. Card, progress and Import button belong to the page. */
export function ConflictReview() {
  const { t } = useTranslation();
  const { importPlan, analyzedImages, resolutions, setResolution, setAllResolutions } = useImportStore();
  // Import destination, not the open archive: thumbnails are pre-generated there
  const archivePath = useImportStore((s) => s.archivePath).replace(/\/+$/, '');

  const conflicts = useMemo(() => analyzedImages.filter((img) => img.conflict), [analyzedImages]);

  const getAction = useCallback(
    (hash: string): ImportAction => resolutions.find((r) => r.hash === hash)?.action ?? 'Skip',
    [resolutions]
  );

  const rowData = useMemo<RowData>(
    () => ({ conflicts, archivePath, getAction, setResolution }),
    [conflicts, archivePath, getAction, setResolution]
  );

  const rowHeight = useCallback(() => ROW_HEIGHT, []);

  if (!importPlan) return null;

  const first = conflicts.length > 0 ? getAction(conflicts[0].hash) : null;
  const global = first && conflicts.every((img) => getAction(img.hash) === first) ? first : null;

  const formatSize = (bytes: number) =>
    bytes < 1024 * 1024
      ? `${(bytes / 1024).toFixed(1)} KB`
      : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* One toolbar: summary left, apply-to-all right */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 mb-3 shrink-0">
        <p className="text-sm text-foreground tabular-nums">
          {importPlan.images.length} {t('timeline.items')}
          <span className="text-muted-foreground"> · {formatSize(importPlan.total_size)}</span>
          {conflicts.length > 0 && (
            <span className="text-warning-ink"> · {t('conflicts.duplicates', { count: conflicts.length })}</span>
          )}
        </p>
        {conflicts.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">{t('conflicts.applyToAll')}</span>
            <ActionToggle value={global} onChange={setAllResolutions} />
          </div>
        )}
      </div>

      {importPlan.images.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('import.noMediaFound')}</p>
      ) : conflicts.length === 0 ? (
        <div className="p-4 bg-success/12 rounded-lg">
          <p className="text-sm text-success-ink">
            {t('conflicts.noConflicts', { count: importPlan.images.length })}
          </p>
        </div>
      ) : (
        <div className="flex flex-col flex-1 min-h-0">
          {/* Virtualized conflict list — fills remaining space */}
          <div className="flex-1 min-h-0">
            <List
              rowComponent={ConflictRowRenderer}
              rowCount={conflicts.length}
              rowHeight={rowHeight}
              rowProps={rowData}
              style={{ height: '100%' }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
