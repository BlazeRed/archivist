import { useState, useEffect } from 'react';
import {
  ArrowRightIcon, CheckIcon, ChevronDownIcon, FileIcon, FolderIcon, FolderOpenIcon,
  LoaderCircleIcon, Trash2Icon, TriangleAlertIcon, UploadIcon,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { open } from '@tauri-apps/plugin-dialog';
import { revealItemInDir } from '@tauri-apps/plugin-opener';
import { invoke } from '@tauri-apps/api/core';
import { toast } from 'sonner';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import { isBusyPhase, useImportStore } from '../stores/importStore';
import { useAppConfigStore } from '../stores/appConfigStore';
import { ConflictReview } from '../components/ConflictReview';
import { ProgressBar } from '../components/ProgressBar';
import { PathField } from '../components/PathField';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

const samePath = (a: string, b: string) => a.replace(/\/+$/, '') === b.replace(/\/+$/, '');

function DropZone({
  isDragging,
  onSelectFolder,
  onSelectFile,
  dragLabel,
  dropLabel,
  subLabel,
  folderLabel,
  fileLabel,
}: {
  isDragging: boolean;
  onSelectFolder: () => void;
  onSelectFile: () => void;
  dragLabel: string;
  dropLabel: string;
  subLabel: string;
  folderLabel: string;
  fileLabel: string;
}) {
  return (
    <div
      className={cn(
        'w-full border-2 border-dashed rounded-xl transition-colors',
        isDragging
          ? 'border-primary bg-primary/5'
          : 'border-border hover:border-primary/50'
      )}
    >
      <div className="py-8 flex flex-col items-center gap-2 text-muted-foreground pointer-events-none select-none">
        <UploadIcon className="w-8 h-8 opacity-50" strokeWidth={1.5} />
        <p className="text-sm font-medium">
          {isDragging ? dropLabel : dragLabel}
        </p>
        {!isDragging && (
          <p className="text-xs opacity-60">{subLabel}</p>
        )}
      </div>

      {!isDragging && (
        <div className="flex gap-2 px-4 pb-4">
          <Button variant="secondary" size="sm" onClick={onSelectFolder} className="flex-1">
            <FolderIcon />
            {folderLabel}
          </Button>
          <Button variant="secondary" size="sm" onClick={onSelectFile} className="flex-1">
            <FileIcon />
            {fileLabel}
          </Button>
        </div>
      )}
    </div>
  );
}

function Stat({ value, label, className }: { value: number; label: string; className?: string }) {
  return (
    <div>
      <p className={cn('text-3xl font-bold tabular-nums', className)}>{value}</p>
      <p className="text-xs text-muted-foreground mt-1">{label}</p>
    </div>
  );
}

export function ImportPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [cleanup, setCleanup] = useState<{ failed: number } | null>(null);
  const [showErrors, setShowErrors] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const { config } = useAppConfigStore();

  const {
    phase,
    sourcePath,
    archivePath,
    importPlan,
    resolutions,
    progress,
    result,
    error,
    setSourcePath,
    setArchivePath,
    startAnalysis,
    startImport,
    reset,
  } = useImportStore();

  const isBusy = isBusyPhase(phase);
  // Paths stay on screen after the import as a record of what went where
  const pathsLocked = isBusy || phase === 'complete';

  // Destination defaults to the open archive
  useEffect(() => {
    if (!archivePath && config.archive_path) setArchivePath(config.archive_path);
  }, [archivePath, config.archive_path]); // eslint-disable-line react-hooks/exhaustive-deps

  // Analysis starts on its own once both paths are set
  useEffect(() => {
    if (phase === 'idle' && sourcePath && archivePath) startAnalysis();
  }, [phase, sourcePath, archivePath]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSelectSource = async () => {
    const sel = await open({ directory: true });
    if (sel) setSourcePath(sel as string);
  };

  const handleSelectSourceFile = async () => {
    const sel = await open({
      multiple: false,
      filters: [{ name: 'Media', extensions: ['jpg', 'jpeg', 'png', 'heic', 'heif', 'webp', 'tiff', 'tif', 'bmp', 'gif', 'mp4', 'mov', 'mkv', 'avi', 'webm', 'm4v', '3gp'] }],
    });
    if (sel) setSourcePath(sel as string);
  };

  const handleSelectArchive = async () => {
    const sel = await open({ directory: true });
    if (sel) setArchivePath(sel as string);
  };

  // A drop anywhere on the window sets the source, unless a run is locked or its outcome is on screen
  useEffect(() => {
    const appWindow = getCurrentWebviewWindow();
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    const acceptsDrop = () => {
      const p = useImportStore.getState().phase;
      return !isBusyPhase(p) && p !== 'complete' && p !== 'error';
    };

    appWindow.onDragDropEvent((event) => {
      const type = event.payload.type;
      if (type === 'enter' || type === 'over') {
        if (acceptsDrop()) setIsDragging(true);
      } else if (type === 'leave') {
        setIsDragging(false);
      } else if (type === 'drop') {
        setIsDragging(false);
        const paths = (event.payload as { type: 'drop'; paths: string[]; position: unknown }).paths;
        if (paths.length > 0 && acceptsDrop()) setSourcePath(paths[0]);
      }
    }).then(fn => {
      if (cancelled) fn();
      else unlisten = fn;
    });

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleReset = () => {
    reset();
    setCleanup(null);
    setShowErrors(false);
  };

  const handleShowInTimeline = () => {
    handleReset();
    navigate('/');
  };

  const handleDeleteSources = async () => {
    if (!result?.imported_sources) return;
    try {
      const res = await invoke<{ deleted: number; failed: string[] }>('delete_files', {
        paths: result.imported_sources,
      });
      setCleanup({ failed: res.failed.length });
    } catch {
      toast.error(t('import.deleteSourcesFailed', { count: result.imported_sources.length }));
    }
  };

  if (phase === 'error') {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <div className="squircle bg-card p-6 rounded-xl">
          <h2 className="text-base font-semibold text-destructive mb-2">{t('status.error')}</h2>
          <pre className="text-sm text-foreground mb-5 bg-muted p-3 rounded-lg overflow-x-auto whitespace-pre-wrap break-all">
            {error}
          </pre>
          <Button onClick={handleReset}>{t('common.back')}</Button>
        </div>
      </div>
    );
  }

  const importCount = importPlan
    ? importPlan.images.length - resolutions.filter(r => r.action === 'Skip').length
    : 0;
  const isFinalizing = phase === 'importing' && progress.total > 0 && progress.current >= progress.total;
  const hasConflicts = phase === 'review' && (importPlan?.conflicts_count ?? 0) > 0;

  return (
    // No page title: the topbar names the page (spec §10)
    <div className="flex flex-col px-6 pt-2 pb-6 max-w-3xl mx-auto w-full h-[calc(100vh-var(--topbar-offset))]">
      {/* Paths: editable in any order, locked while a run is in progress */}
      <div className="squircle bg-card p-3 rounded-xl shrink-0">
        {!sourcePath || isDragging ? (
          <div className="space-y-3">
            <DropZone
              isDragging={isDragging}
              onSelectFolder={handleSelectSource}
              onSelectFile={handleSelectSourceFile}
              dragLabel={t('import.dragOrClick')}
              dropLabel={t('import.dropHere')}
              subLabel={t('import.dragOrClickSub')}
              folderLabel={t('import.selectFolder')}
              fileLabel={t('import.selectFile')}
            />
            {archivePath && (
              <PathField label={t('import.to')} path={archivePath} actionLabel={t('common.change')} onAction={handleSelectArchive} disabled={pathsLocked} />
            )}
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <PathField label={t('import.from')} path={sourcePath} actionLabel={t('common.change')} onAction={() => setSourcePath('')} disabled={pathsLocked} />
            <ArrowRightIcon className="size-4 shrink-0 text-muted-foreground" />
            <PathField
              label={t('import.to')}
              path={archivePath}
              placeholder={t('import.selectDestination')}
              actionLabel={archivePath ? t('common.change') : t('import.selectFolder')}
              onAction={handleSelectArchive}
              disabled={pathsLocked}
            />
          </div>
        )}
      </div>

      {/* Status: progress while running, then review + Import, then the outcome */}
      {sourcePath && archivePath && phase !== 'idle' && (
        <div className={cn(
          'squircle bg-card p-6 rounded-xl mt-3 flex flex-col min-h-0',
          (hasConflicts || (phase === 'complete' && showErrors)) && 'flex-1'
        )}>
          {phase === 'review' ? (
            <>
              <ConflictReview />
              <div className="flex justify-end gap-2 mt-4 shrink-0">
                <Button variant="outline" onClick={handleReset}>{t('common.cancel')}</Button>
                <Button onClick={startImport} disabled={importCount === 0}>
                  {t('import.importCount', { count: importCount })}
                </Button>
              </div>
            </>
          ) : phase === 'complete' && result ? (
            <CompleteSummary
              result={result}
              inOpenArchive={samePath(archivePath, config.archive_path)}
              cleanup={cleanup}
              showErrors={showErrors}
              onToggleErrors={() => setShowErrors(v => !v)}
              onDeleteSources={() => setShowDeleteConfirm(true)}
              onOpenFolder={() => revealItemInDir(archivePath).catch(() => {})}
              onShowInTimeline={handleShowInTimeline}
              onNewImport={handleReset}
            />
          ) : (
            <>
              <ProgressBar
                current={progress.current}
                total={progress.total}
                currentFile={progress.currentFile}
                phase={phase}
              />
              {isFinalizing && (
                <div className="flex items-center gap-2 mt-3 text-sm text-muted-foreground">
                  <LoaderCircleIcon className="animate-spin size-4 shrink-0" />
                  <span>{t('import.finalizing')}</span>
                </div>
              )}
            </>
          )}
        </div>
      )}

      <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('import.deleteConfirmTitle')}</DialogTitle>
            <DialogDescription>
              {t('import.deleteConfirmBody', { count: result?.imported_sources?.length ?? 0 })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteConfirm(false)}>
              {t('common.cancel')}
            </Button>
            <Button variant="destructive" onClick={() => { setShowDeleteConfirm(false); handleDeleteSources(); }}>
              {t('import.deleteConfirmAction')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Outcome of a finished import. Source cleanup is an optional action, not a question:
 *  leaving it alone keeps the files. */
function CompleteSummary({
  result, inOpenArchive, cleanup, showErrors,
  onToggleErrors, onDeleteSources, onOpenFolder, onShowInTimeline, onNewImport,
}: {
  result: { imported: number; skipped: number; errors: string[]; imported_sources: string[] };
  inOpenArchive: boolean;
  cleanup: { failed: number } | null;
  showErrors: boolean;
  onToggleErrors: () => void;
  onDeleteSources: () => void;
  onOpenFolder: () => void;
  onShowInTimeline: () => void;
  onNewImport: () => void;
}) {
  const { t } = useTranslation();
  const errorCount = result.errors.length;
  const canCleanup = errorCount === 0 && result.imported > 0 && (result.imported_sources?.length ?? 0) > 0;

  return (
    <>
      <div className="flex items-center gap-3 mb-5 shrink-0">
        <div className="size-9 rounded-full bg-success/15 flex items-center justify-center shrink-0">
          <CheckIcon className="size-4.5 text-success-ink" />
        </div>
        <h2 className="text-base font-semibold text-foreground">{t('import.complete')}</h2>
      </div>

      <div className="flex gap-10 mb-5 shrink-0">
        <Stat value={result.imported} label={t('import.imported')} className="text-primary-ink" />
        <Stat value={result.skipped} label={t('import.skipped')} className="text-muted-foreground" />
        {errorCount > 0 && (
          <div>
            <p className="text-3xl font-bold tabular-nums text-destructive">{errorCount}</p>
            <Button variant="link" size="xs" onClick={onToggleErrors} aria-expanded={showErrors} className="h-auto p-0 mt-1 text-xs text-muted-foreground">
              {t('import.errorsLabel')}
              <ChevronDownIcon className={cn('transition-transform', showErrors && 'rotate-180')} />
            </Button>
          </div>
        )}
      </div>

      {showErrors && errorCount > 0 && (
        <ul className="flex-1 min-h-0 overflow-y-auto mb-5 p-3 bg-muted rounded-lg space-y-1 text-xs font-mono text-foreground">
          {result.errors.map((e, i) => <li key={i} className="break-all">{e}</li>)}
        </ul>
      )}

      {!inOpenArchive && (
        <p className="mb-4 text-sm text-warning-ink shrink-0">{t('import.otherArchiveNote')}</p>
      )}

      {canCleanup && (
        <div className="mb-5 px-4 py-3 bg-muted rounded-lg border border-border flex items-center gap-3 shrink-0">
          {cleanup === null ? (
            <>
              <Trash2Icon className="size-4 text-muted-foreground shrink-0" />
              <p className="flex-1 text-sm text-foreground">
                {t('import.sourceStillThere', { count: result.imported_sources.length })}
              </p>
              <Button variant="outline" size="sm" onClick={onDeleteSources} className="shrink-0 text-destructive hover:text-destructive">
                {t('import.deleteFromSource')}
              </Button>
            </>
          ) : cleanup.failed === 0 ? (
            <>
              <CheckIcon className="size-4 text-success-ink shrink-0" />
              <p className="text-sm text-foreground">{t('import.sourceDeleted')}</p>
            </>
          ) : (
            <>
              <TriangleAlertIcon className="size-4 text-warning-ink shrink-0" />
              <p className="text-sm text-foreground">{t('import.deleteSourcesFailed', { count: cleanup.failed })}</p>
            </>
          )}
        </div>
      )}

      <div className="flex justify-end gap-2 mt-auto shrink-0">
        <Button variant="outline" onClick={onNewImport}>{t('import.newImport')}</Button>
        {inOpenArchive ? (
          <Button onClick={onShowInTimeline}>{t('import.showInTimeline')}</Button>
        ) : (
          <Button onClick={onOpenFolder}>
            <FolderOpenIcon />
            {t('import.openFolder')}
          </Button>
        )}
      </div>
    </>
  );
}
