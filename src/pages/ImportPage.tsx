import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { open } from '@tauri-apps/plugin-dialog';
import { invoke } from '@tauri-apps/api/core';
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

function FolderRow({
  label,
  path,
  onSelect,
  onChangeTrigger,
  changeLabelKey,
  selectLabelKey,
}: {
  label: string;
  path: string;
  onSelect: () => void;
  onChangeTrigger?: () => void;
  changeLabelKey?: string;
  selectLabelKey: string;
}) {
  const { t } = useTranslation();
  if (path) {
    return (
      <div className="p-3 bg-muted rounded-lg flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground mb-0.5">{label}</p>
          <p className="text-sm text-foreground truncate font-mono">{path}</p>
        </div>
        {onChangeTrigger && (
          <Button variant="link" size="xs" onClick={onChangeTrigger} className="shrink-0 p-0 h-auto">
            {t(changeLabelKey ?? 'common.change')}
          </Button>
        )}
      </div>
    );
  }
  return (
    <button
      onClick={onSelect}
      className="w-full py-8 border-2 border-dashed border-border rounded-xl text-muted-foreground hover:border-primary hover:text-primary transition-colors text-sm font-medium"
    >
      {t(selectLabelKey)}
    </button>
  );
}

export function ImportPage() {
  const { t } = useTranslation();
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [cleanupDismissed, setCleanupDismissed] = useState(false);
  const [showSourceMenu, setShowSourceMenu] = useState(false);
  const sourceMenuRef = useRef<HTMLDivElement>(null);

  const {
    phase,
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
    if (!showSourceMenu) return;
    const handler = (e: MouseEvent) => {
      if (sourceMenuRef.current && !sourceMenuRef.current.contains(e.target as Node)) {
        setShowSourceMenu(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showSourceMenu]);

  const handleReset = () => {
    reset();
    setStep(1);
    setCleanupDismissed(false);
  };

  const handleDeleteSources = async () => {
    if (result?.imported_sources) {
      await invoke('delete_files', { paths: result.imported_sources });
    }
    setCleanupDismissed(true);
  };

  const isAnalyzing = phase === 'scanning' || phase === 'analyzing';

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

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h1 className="text-[22px] font-medium text-foreground mb-6">{t('import.title')}</h1>

      <StepIndicator current={step} />

      {/* Step 1 – Select source folder */}
      {step === 1 && (
        <div className="bg-card p-6 rounded-xl">
          <h3 className="text-base font-semibold text-foreground mb-1">{t('import.step1Title')}</h3>
          <p className="text-sm text-muted-foreground mb-5">{t('import.step1Desc')}</p>

          <div className="mb-5" ref={sourceMenuRef}>
            {sourcePath ? (
              <div className="p-3 bg-muted rounded-lg flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground mb-0.5">{t('import.source')}</p>
                  <p className="text-sm text-foreground truncate font-mono">{sourcePath}</p>
                </div>
                <Button variant="link" size="xs" onClick={() => setShowSourceMenu(m => !m)} className="shrink-0 p-0 h-auto">
                  {t('common.change')}
                </Button>
              </div>
            ) : (
              <button
                onClick={() => setShowSourceMenu(m => !m)}
                className="w-full py-8 border-2 border-dashed border-border rounded-xl text-muted-foreground hover:border-primary hover:text-primary transition-colors text-sm font-medium"
              >
                {t('import.selectSource')}
              </button>
            )}

            {showSourceMenu && (
              <div className="mt-1 bg-card border border-border rounded-lg shadow-md overflow-hidden">
                <button
                  onClick={() => { setShowSourceMenu(false); handleSelectSource(); }}
                  className="w-full px-4 py-2.5 text-sm text-left text-foreground hover:bg-muted flex items-center gap-2"
                >
                  <svg className="w-4 h-4 text-muted-foreground flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z"/>
                  </svg>
                  {t('import.selectFolder')}
                </button>
                <button
                  onClick={() => { setShowSourceMenu(false); handleSelectSourceFile(); }}
                  className="w-full px-4 py-2.5 text-sm text-left text-foreground hover:bg-muted flex items-center gap-2 border-t border-border"
                >
                  <svg className="w-4 h-4 text-muted-foreground flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd"/>
                  </svg>
                  {t('import.selectFile')}
                </button>
              </div>
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
            <FolderRow
              label={t('import.archive')}
              path={archivePath}
              onSelect={handleSelectArchive}
              onChangeTrigger={handleSelectArchive}
              selectLabelKey="import.selectDestination"
            />
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

      {/* Step 4 – Review conflicts & import */}
      {step === 4 && (
        <ConflictReview onImport={startImport} onBack={() => setStep(3)} />
      )}
    </div>
  );
}
