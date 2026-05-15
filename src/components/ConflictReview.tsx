import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { convertFileSrc } from '@tauri-apps/api/core';
import { invoke } from '@tauri-apps/api/core';
import { useImportStore, ImportAction, AnalyzedImage } from '../stores/importStore';
import { useAppConfigStore } from '../stores/appConfigStore';
import { ProgressBar } from './ProgressBar';
import { Button } from '@/components/ui/button';

const ACTIONS: ImportAction[] = ['KeepBoth', 'Replace', 'Skip'];

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

function PreviewThumb({ src, label, filename }: { src: string | null; label: string; filename: string }) {
  return (
    <div className="flex flex-col items-center gap-1 w-[90px] shrink-0">
      <div className="w-[90px] h-[90px] rounded-md overflow-hidden bg-card border border-border">
        {src === null ? (
          <div className="w-full h-full flex items-center justify-center text-muted-foreground">
            <div className="w-5 h-5 rounded-full border-2 border-muted border-t-primary animate-spin" />
          </div>
        ) : src ? (
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

function ConflictRow({
  img,
  archivePath,
  selected,
  onSelect,
  incomingThumbUrl,
}: {
  img: AnalyzedImage;
  archivePath: string;
  selected: ImportAction;
  onSelect: (action: ImportAction) => void;
  incomingThumbUrl: string | null;
}) {
  const { t } = useTranslation();
  const incomingUrl = incomingThumbUrl;
  const existingUrl = img.conflict?.existing_id
    ? convertFileSrc(`${archivePath}/.archivist/thumbnails/${img.conflict.existing_id}.jpg`)
    : '';

  return (
    <div className="p-3 bg-background rounded-lg border border-border">
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

export function ConflictReview({ onImport, onBack }: { onImport: () => void; onBack: () => void }) {
  const { t } = useTranslation();
  const { importPlan, analyzedImages, resolutions, setResolution, setAllResolutions, phase, progress } =
    useImportStore();
  const archivePath = useAppConfigStore((s) => s.config.archive_path).replace(/\/+$/, '');

  // null = loading, '' = failed, url = ready
  const [tempThumbs, setTempThumbs] = useState<Record<string, string | null>>({});

  useEffect(() => {
    const conflictImgs = analyzedImages.filter((img) => img.conflict);
    if (conflictImgs.length === 0) return;

    const initial: Record<string, string | null> = {};
    conflictImgs.forEach((img) => { initial[img.path] = null; });
    setTempThumbs(initial);

    conflictImgs.forEach((img) => {
      invoke<string>('generate_temp_thumbnail', { sourcePath: img.path })
        .then((p) => setTempThumbs((prev) => ({ ...prev, [img.path]: convertFileSrc(p) })))
        .catch(() => setTempThumbs((prev) => ({ ...prev, [img.path]: '' })));
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analyzedImages.length]);

  if (!importPlan) return null;

  const conflicts = analyzedImages.filter((img) => img.conflict);

  const getAction = (hash: string): ImportAction =>
    resolutions.find((r) => r.hash === hash)?.action ?? 'KeepBoth';

  const globalAction = (): ImportAction | null => {
    if (conflicts.length === 0) return null;
    const first = getAction(conflicts[0].hash);
    return conflicts.every((img) => getAction(img.hash) === first) ? first : null;
  };

  const formatSize = (bytes: number) =>
    bytes < 1024 * 1024
      ? `${(bytes / 1024).toFixed(1)} KB`
      : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

  const isImporting = phase === 'importing';
  const global = globalAction();

  return (
    <div className="bg-card p-6 rounded-xl">
      <h3 className="text-base font-semibold text-foreground mb-1">{t('conflicts.title')}</h3>

      <div className="flex items-center justify-between p-3 bg-muted rounded-lg mb-4">
        <span className="text-sm text-foreground">
          {importPlan.images.length} {t('timeline.photos')}
        </span>
        <span className="text-sm text-muted-foreground">{formatSize(importPlan.total_size)}</span>
      </div>

      {conflicts.length === 0 ? (
        <div className="mb-5 p-4 bg-accent/10 rounded-xl">
          <p className="text-sm text-accent">
            {t('conflicts.noConflicts', { count: importPlan.images.length })}
          </p>
        </div>
      ) : (
        <div className="mb-5">
          <p className="text-sm text-[var(--color-warning)] mb-3">
            {t('conflicts.conflictsFound', { count: conflicts.length })}
          </p>

          {/* Apply to all bar */}
          <div className="flex items-center gap-2 mb-3 p-2 bg-muted rounded-lg">
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

          {/* Per-conflict rows */}
          <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
            {conflicts.map((img) => (
              <ConflictRow
                key={img.hash}
                img={img}
                archivePath={archivePath}
                selected={getAction(img.hash)}
                onSelect={(action) => setResolution(img.hash, action)}
                incomingThumbUrl={tempThumbs[img.path] ?? null}
              />
            ))}
          </div>
        </div>
      )}

      {isImporting && (
        <div className="mb-4">
          <ProgressBar
            current={progress.current}
            total={progress.total}
            currentFile={progress.currentFile}
            phase={phase}
          />
        </div>
      )}

      <div className="flex justify-between items-center">
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
