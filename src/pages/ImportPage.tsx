import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { open } from '@tauri-apps/plugin-dialog';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import { useImportStore } from '../stores/importStore';
import { ConflictReview } from '../components/ConflictReview';
import { ProgressBar } from '../components/ProgressBar';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

function StepIndicator({ current }: { current: number }) {
  return (
    <div className="flex items-center justify-center gap-2 mb-8">
      {[1, 2, 3, 4].map((s) => (
        <div key={s} className="flex items-center">
          <div
            className={cn(
              'w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors',
              current >= s ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground'
            )}
          >
            {s}
          </div>
          {s < 4 && (
            <div className={cn('w-16 h-0.5 transition-colors', current > s ? 'bg-primary' : 'bg-border')} />
          )}
        </div>
      ))}
    </div>
  );
}

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
  onSelectFile?: () => void;
  dragLabel: string;
  dropLabel: string;
  subLabel: string;
  folderLabel: string;
  fileLabel?: string;
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
        <svg className="w-8 h-8 opacity-50" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path strokeLinecap="round" strokeLinejoin="round"
            d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
        </svg>
        <p className="text-sm font-medium">
          {isDragging ? dropLabel : dragLabel}
        </p>
        {!isDragging && (
          <p className="text-xs opacity-60">{subLabel}</p>
        )}
      </div>

      {!isDragging && (
        <div className={cn('flex gap-2 px-4 pb-4', !onSelectFile && 'justify-center')}>
          <button
            onClick={onSelectFolder}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-muted hover:bg-muted/80 rounded-lg text-xs font-medium text-foreground transition-colors"
          >
            <svg className="w-3.5 h-3.5 text-muted-foreground" viewBox="0 0 20 20" fill="currentColor">
              <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z"/>
            </svg>
            {folderLabel}
          </button>
          {onSelectFile && fileLabel && (
            <button
              onClick={onSelectFile}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-muted hover:bg-muted/80 rounded-lg text-xs font-medium text-foreground transition-colors"
            >
              <svg className="w-3.5 h-3.5 text-muted-foreground" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd"/>
              </svg>
              {fileLabel}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function ImportPage() {
  const { t } = useTranslation();
  const [cleanupDismissed, setCleanupDismissed] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const {
    phase,
    step,
    setStep,
    sourcePath,
    archivePath,
    importPlan,
    progress,
    result,
    error,
    setSourcePath,
    setArchivePath,
    startScan,
    startAnalyze,
    startImport,
    reset,
  } = useImportStore();

  const stepRef = useRef<number>(step);
  stepRef.current = step;

  const handleSelectSource = async () => {
    const sel = await open({ directory: true });
    if (sel) setSourcePath(sel as string);
  };

  const handleSelectSourceFile = async () => {
    const sel = await open({
      multiple: false,
      filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'heic', 'heif', 'webp', 'tiff', 'tif', 'bmp', 'gif', 'avif'] }],
    });
    if (sel) setSourcePath(sel as string);
  };

  const handleSelectArchive = async () => {
    const sel = await open({ directory: true });
    if (sel) setArchivePath(sel as string);
  };

  const handleStartAnalysis = async () => {
    await startScan();
    await startAnalyze();
  };

  useEffect(() => {
    const appWindow = getCurrentWebviewWindow();
    let unlisten: (() => void) | undefined;
    let cancelled = false;

    appWindow.onDragDropEvent((event) => {
      const type = event.payload.type;
      if (type === 'enter' || type === 'over') {
        if (stepRef.current === 1 || stepRef.current === 2) setIsDragging(true);
      } else if (type === 'leave') {
        setIsDragging(false);
      } else if (type === 'drop') {
        setIsDragging(false);
        const paths = (event.payload as { type: 'drop'; paths: string[]; position: unknown }).paths;
        if (paths.length > 0) {
          if (stepRef.current === 1) setSourcePath(paths[0]);
          else if (stepRef.current === 2) setArchivePath(paths[0]);
        }
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

  useEffect(() => {
    if (step !== 1 && step !== 2) setIsDragging(false);
  }, [step]);

  const handleReset = () => {
    reset();
    setCleanupDismissed(false);
  };

  const handleDeleteSources = async () => {
    if (result?.imported_sources) {
      await invoke('delete_files', { paths: result.imported_sources });
    }
    setCleanupDismissed(true);
  };

  const isAnalyzing = phase === 'scanning' || phase === 'analyzing' || phase === 'thumbnailing';

  if (phase === 'complete') {
    const canCleanup = result !== null && result.errors.length === 0 && result.imported > 0 && (result.imported_sources?.length ?? 0) > 0;
    const showCleanupBanner = canCleanup && !cleanupDismissed;
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <div className="bg-card p-8 rounded-xl text-center">
          <div className="w-12 h-12 rounded-full bg-accent/15 flex items-center justify-center mx-auto mb-4">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path
                d="M3 10.5L8 15.5L17 5"
                stroke="var(--accent)"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-foreground mb-4">{t('import.complete')}</h2>
          <div className="flex justify-center gap-8 mb-6">
            <div>
              <p className="text-3xl font-bold text-primary">{result?.imported ?? 0}</p>
              <p className="text-xs text-muted-foreground mt-1">{t('import.imported')}</p>
            </div>
            <div className="w-px bg-border" />
            <div>
              <p className="text-3xl font-bold text-muted-foreground">{result?.skipped ?? 0}</p>
              <p className="text-xs text-muted-foreground mt-1">{t('import.skipped')}</p>
            </div>
          </div>
          {result && result.errors.length > 0 && (
            <p className="text-sm text-destructive mb-4">{t('import.errors', { count: result.errors.length })}</p>
          )}
          {showCleanupBanner && (
            <div className="mb-4 p-4 bg-muted rounded-xl text-left">
              <p className="text-sm font-medium text-foreground mb-3">
                {t('import.sourceCleanup', { count: result!.imported_sources.length })}
              </p>
              <div className="flex gap-2">
                <Button variant="destructive" size="sm" onClick={handleDeleteSources}>
                  {t('import.deleteSource')}
                </Button>
                <Button variant="outline" size="sm" autoFocus onClick={() => setCleanupDismissed(true)}>
                  {t('import.keepSource')}
                </Button>
              </div>
            </div>
          )}
          <Button onClick={handleReset}>{t('common.confirm')}</Button>
        </div>
      </div>
    );
  }

  if (phase === 'error') {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <div className="bg-card p-6 rounded-xl">
          <h2 className="text-base font-semibold text-destructive mb-2">{t('status.error')}</h2>
          <pre className="text-sm text-foreground mb-5 bg-muted p-3 rounded-lg overflow-x-auto whitespace-pre-wrap break-all">
            {error}
          </pre>
          <Button onClick={handleReset}>{t('common.back')}</Button>
        </div>
      </div>
    );
  }

  if (step === 4) {
    return (
      <div
        className="flex flex-col overflow-hidden px-6 pt-4 pb-6 max-w-2xl mx-auto w-full"
        style={{ height: 'calc(100vh - 52px)' }}
      >
        <h1 className="text-[22px] font-medium text-foreground mb-3 shrink-0">{t('import.title')}</h1>
        <div className="shrink-0">
          <StepIndicator current={4} />
        </div>
        <ConflictReview onImport={startImport} onBack={() => setStep(3)} />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h1 className="text-[22px] font-medium text-foreground mb-6">{t('import.title')}</h1>

      <StepIndicator current={step} />

      {/* Step 1 – Select source */}
      {step === 1 && (
        <div className="bg-card p-6 rounded-xl">
          <h3 className="text-base font-semibold text-foreground mb-1">{t('import.step1Title')}</h3>
          <p className="text-sm text-muted-foreground mb-5">{t('import.step1Desc')}</p>

          <div className="mb-5">
            {sourcePath ? (
              <div className="p-3 bg-muted rounded-lg flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground mb-0.5">{t('import.source')}</p>
                  <p className="text-sm text-foreground truncate font-mono">{sourcePath}</p>
                </div>
                <Button variant="link" size="xs" onClick={() => setSourcePath('')} className="shrink-0 p-0 h-auto">
                  {t('common.change')}
                </Button>
              </div>
            ) : (
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
            )}
          </div>

          <div className="flex justify-end">
            <Button onClick={() => setStep(2)} disabled={!sourcePath}>
              {t('common.next')} →
            </Button>
          </div>
        </div>
      )}

      {/* Step 2 – Select archive folder */}
      {step === 2 && (
        <div className="bg-card p-6 rounded-xl">
          <h3 className="text-base font-semibold text-foreground mb-1">{t('import.step2Title')}</h3>
          <p className="text-sm text-muted-foreground mb-5">{t('import.step2Desc')}</p>

          <div className="space-y-2 mb-5">
            <div className="p-3 bg-muted rounded-lg">
              <p className="text-xs text-muted-foreground mb-0.5">{t('import.source')}</p>
              <p className="text-sm text-foreground truncate font-mono">{sourcePath}</p>
            </div>

            {archivePath ? (
              <div className="p-3 bg-muted rounded-lg flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground mb-0.5">{t('import.archive')}</p>
                  <p className="text-sm text-foreground truncate font-mono">{archivePath}</p>
                </div>
                <Button variant="link" size="xs" onClick={() => setArchivePath('')} className="shrink-0 p-0 h-auto">
                  {t('common.change')}
                </Button>
              </div>
            ) : (
              <DropZone
                isDragging={isDragging}
                onSelectFolder={handleSelectArchive}
                dragLabel={t('import.selectDestination')}
                dropLabel={t('import.dropHere')}
                subLabel={t('import.dragOrClickSub')}
                folderLabel={t('import.selectFolder')}
              />
            )}
          </div>

          <div className="flex justify-between items-center">
            <Button variant="outline" onClick={() => setStep(1)}>← {t('common.back')}</Button>
            <Button onClick={() => setStep(3)} disabled={!archivePath}>{t('common.next')} →</Button>
          </div>
        </div>
      )}

      {/* Step 3 – Analyze photos */}
      {step === 3 && (
        <div className="bg-card p-6 rounded-xl">
          <h3 className="text-base font-semibold text-foreground mb-1">{t('import.step3Title')}</h3>
          <p className="text-sm text-muted-foreground mb-5">{t('import.step3Desc')}</p>

          <div className="space-y-2 mb-5">
            <div className="p-3 bg-muted rounded-lg">
              <p className="text-xs text-muted-foreground mb-0.5">{t('import.source')}</p>
              <p className="text-sm text-foreground truncate font-mono">{sourcePath}</p>
            </div>
            <div className="p-3 bg-muted rounded-lg">
              <p className="text-xs text-muted-foreground mb-0.5">{t('import.archive')}</p>
              <p className="text-sm text-foreground truncate font-mono">{archivePath}</p>
            </div>
          </div>

          {(phase === 'idle' || isAnalyzing) && (
            <div className="flex justify-between items-center">
              <Button variant="outline" onClick={() => setStep(2)} disabled={isAnalyzing}>← {t('common.back')}</Button>
              <Button onClick={handleStartAnalysis} disabled={isAnalyzing} className="gap-2">
                {isAnalyzing && (
                  <svg className="animate-spin size-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                )}
                {isAnalyzing
                  ? (phase === 'scanning' ? t('import.scanningFolder') : t('import.analyzing'))
                  : t('import.startAnalysis')}
              </Button>
            </div>
          )}

          {isAnalyzing && (
            <div className="mt-3">
              <ProgressBar
                current={progress.current}
                total={progress.total}
                currentFile={progress.currentFile}
                phase={phase}
              />
            </div>
          )}

          {phase === 'review' && importPlan && (
            <>
              <div className="p-4 bg-accent/10 rounded-xl mb-4">
                <p className="text-sm font-medium text-accent">
                  {t('import.analysisComplete', { count: importPlan.images.length })}
                </p>
                {importPlan.conflicts_count > 0 && (
                  <p className="text-xs text-[var(--color-warning)] mt-1">
                    {t('import.conflicts', { count: importPlan.conflicts_count })}
                  </p>
                )}
              </div>
              <div className="flex justify-between items-center">
                <Button variant="outline" onClick={() => setStep(2)}>← {t('common.back')}</Button>
                <Button onClick={() => setStep(4)}>{t('common.next')} →</Button>
              </div>
            </>
          )}
        </div>
      )}

    </div>
  );
}
