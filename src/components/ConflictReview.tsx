import { useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { convertFileSrc } from '@tauri-apps/api/core';
import { List, RowComponentProps } from 'react-window';
import { useImportStore, ImportAction, AnalyzedImage } from '../stores/importStore';
import { useAppConfigStore } from '../stores/appConfigStore';
import { ProgressBar } from './ProgressBar';
import { Button } from '@/components/ui/button';

const ACTIONS: ImportAction[] = ['Skip', 'KeepBoth', 'Replace'];
const ROW_HEIGHT = 192;

function actionLabel(action: ImportAction, t: (k: string) => string): string {
  if (action === 'KeepBoth') return t('conflicts.keepBoth');
  if (action === 'Replace') return t('conflicts.replace');
  return t('conflicts.keepExisting');
}

function ActionPill({
  action,
  selected,
  onClick,
}: {
  action: ImportAction;
  selected: boolean;
  onClick: () => void;
}) {
  const { t } = useTranslation();
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1 text-xs rounded-full border transition-colors ${
        selected
          ? 'bg-primary/12 border-primary text-primary font-medium'
          : 'bg-transparent border-border text-muted-foreground hover:border-primary/50'
      }`}
    >
      {actionLabel(action, t)}
    </button>
  );
}

function PreviewThumb({ src, label, filename }: { src: string; label: string; filename: string }) {
  return (
    <div className="flex flex-col items-center gap-1 w-[90px] shrink-0">
      <div className="w-[90px] h-[90px] rounded-md overflow-hidden bg-card border border-border">
        {src ? (
          <img src={src} alt={filename} className="w-full h-full object-cover" loading="lazy" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-muted-foreground">
            <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
              <line x1="3" y1="3" x2="21" y2="21"/>
              <circle cx="8.5" cy="8.5" r="1.5"/>
            </svg>
          </div>
        )}
      </div>
      <span className="text-[10px] text-muted-foreground font-medium">{label}</span>
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

  return (
    <div className="px-3 pt-3 pb-4 bg-background rounded-lg border border-border">
      <div className="flex gap-3 mb-2.5">
        <PreviewThumb src={incomingUrl} label={t('conflicts.incoming')} filename={img.filename} />
        <div className="flex items-center self-center text-muted-foreground">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth="1.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 8h10M9 4l4 4-4 4"/>
          </svg>
        </div>
        <PreviewThumb src={existingUrl} label={t('conflicts.inArchive')} filename={img.conflict?.existing_path ?? ''} />
        <div className="flex-1 min-w-0 self-center">
          <p className="text-sm font-medium text-foreground truncate">{img.filename}</p>
          {img.conflict?.existing_path && (
            <p className="text-[11px] text-muted-foreground truncate mt-0.5">
              {img.conflict.existing_path}
            </p>
          )}
          {img.conflict?.existing_date && (
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {new Date(img.conflict.existing_date).toLocaleDateString()}
            </p>
          )}
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {ACTIONS.map((action) => (
          <ActionPill
            key={action}
            action={action}
            selected={selected === action}
            onClick={() => onSelect(action)}
          />
        ))}
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
    <div style={{ ...style, paddingBottom: 8 }}>
      <ConflictRowInner
        img={img}
        archivePath={archivePath}
        selected={getAction(img.hash)}
        onSelect={(action) => setResolution(img.hash, action)}
      />
    </div>
  );
}

export function ConflictReview({ onImport, onBack }: { onImport: () => void; onBack: () => void }) {
  const { t } = useTranslation();
  const { importPlan, analyzedImages, resolutions, setResolution, setAllResolutions, phase, progress } =
    useImportStore();
  const archivePath = useAppConfigStore((s) => s.config.archive_path).replace(/\/+$/, '');

  if (!importPlan) return null;

  const conflicts = analyzedImages.filter((img) => img.conflict);

  const getAction = useCallback(
    (hash: string): ImportAction => resolutions.find((r) => r.hash === hash)?.action ?? 'Skip',
    [resolutions]
  );

  const globalAction = (): ImportAction | null => {
    if (conflicts.length === 0) return null;
    const first = getAction(conflicts[0].hash);
    return conflicts.every((img) => getAction(img.hash) === first) ? first : null;
  };

  const formatSize = (bytes: number) =>
    bytes < 1024 * 1024
      ? `${(bytes / 1024).toFixed(1)} KB`
      : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

  const rowData = useMemo<RowData>(
    () => ({ conflicts, archivePath, getAction, setResolution }),
    [conflicts, archivePath, getAction, setResolution]
  );

  const rowHeight = useCallback(() => ROW_HEIGHT, []);

  const isImporting = phase === 'importing';
  const global = globalAction();

  return (
    <div className="bg-card p-6 rounded-xl flex flex-col flex-1 min-h-0">
      <h3 className="text-base font-semibold text-foreground mb-1 shrink-0">{t('conflicts.title')}</h3>

      <div className="flex items-center justify-between p-3 bg-muted rounded-lg mb-4 shrink-0">
        <span className="text-sm text-foreground">
          {importPlan.images.length} {t('timeline.photos')}
        </span>
        <span className="text-sm text-muted-foreground">{formatSize(importPlan.total_size)}</span>
      </div>

      {conflicts.length === 0 ? (
        <div className="flex-1 mb-5 flex items-start">
          <div className="p-4 bg-accent/10 rounded-xl w-full">
            <p className="text-sm text-accent">
              {t('conflicts.noConflicts', { count: importPlan.images.length })}
            </p>
          </div>
        </div>
      ) : (
        <div className="flex flex-col flex-1 min-h-0 mb-5">
          <p className="text-sm text-[var(--color-warning)] mb-3 shrink-0">
            {t('conflicts.conflictsFound', { count: conflicts.length })}
          </p>

          {/* Apply to all bar */}
          <div className="flex items-center gap-2 mb-3 p-2 bg-muted rounded-lg shrink-0">
            <span className="text-xs text-muted-foreground shrink-0">
              {t('conflicts.applyToAll')}
            </span>
            <div className="flex gap-1.5">
              {ACTIONS.map((action) => (
                <ActionPill
                  key={action}
                  action={action}
                  selected={global === action}
                  onClick={() => setAllResolutions(action)}
                />
              ))}
            </div>
          </div>

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

      {isImporting && (
        <div className="mb-4 shrink-0">
          <ProgressBar
            current={progress.current}
            total={progress.total}
            currentFile={progress.currentFile}
            phase={phase}
          />
        </div>
      )}

      <div className="flex justify-between items-center shrink-0">
        <Button variant="outline" onClick={onBack} disabled={isImporting}>
          ← {t('common.back')}
        </Button>
        <Button onClick={onImport} disabled={isImporting}>
          {isImporting ? t('import.importing') : t('import.importPhotos')}
        </Button>
      </div>
    </div>
  );
}
