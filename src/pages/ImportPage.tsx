import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { open } from '@tauri-apps/plugin-dialog';
import { useImportStore } from '../stores/importStore';
import { ConflictReview } from '../components/ConflictReview';
import { ProgressBar } from '../components/ProgressBar';

function StepIndicator({ current }: { current: number }) {
  return (
    <div className="flex items-center justify-center gap-2 mb-8">
      {[1, 2, 3, 4].map((s) => (
        <div key={s} className="flex items-center">
          <div
            className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${
              current >= s
                ? 'bg-[#0084C5] text-white'
                : 'bg-[#E8F3FB] text-[rgba(0,45,88,0.55)]'
            }`}
          >
            {s}
          </div>
          {s < 4 && (
            <div
              className={`w-16 h-0.5 transition-colors ${
                current > s ? 'bg-[#0084C5]' : 'bg-[rgba(0,45,88,0.15)]'
              }`}
            />
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
      <div className="p-3 bg-[#F4F9FD] rounded-lg flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-[rgba(0,45,88,0.45)] mb-0.5">{label}</p>
          <p className="text-sm text-[#002D58] truncate font-mono">{path}</p>
        </div>
        {onChangeTrigger && (
          <button
            onClick={onChangeTrigger}
            className="shrink-0 text-xs text-[#0084C5] underline"
          >
            {t(changeLabelKey ?? 'common.change')}
          </button>
        )}
      </div>
    );
  }
  return (
    <button
      onClick={onSelect}
      className="w-full py-8 border-2 border-dashed border-[rgba(0,45,88,0.2)] rounded-xl text-[rgba(0,45,88,0.55)] hover:border-[#0084C5] hover:text-[#0084C5] transition-colors text-sm font-medium"
    >
      {t(selectLabelKey)}
    </button>
  );
}

export function ImportPage() {
  const { t } = useTranslation();
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);

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

  const handleSelectArchive = async () => {
    const sel = await open({ directory: true });
    if (sel) setArchivePath(sel as string);
  };

  const handleStartAnalysis = async () => {
    await startScan();
    await startAnalyze();
  };

  const handleReset = () => {
    reset();
    setStep(1);
  };

  const isAnalyzing = phase === 'scanning' || phase === 'analyzing';

  if (phase === 'complete') {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <div className="bg-[#E8F3FB] p-8 rounded-xl text-center">
          <div className="w-12 h-12 rounded-full bg-[rgba(42,158,173,0.15)] flex items-center justify-center mx-auto mb-4">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path
                d="M3 10.5L8 15.5L17 5"
                stroke="#2A9EAD"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-[#002D58] mb-4">{t('import.complete')}</h2>
          <div className="flex justify-center gap-8 mb-6">
            <div>
              <p className="text-3xl font-bold text-[#0084C5]">{result?.imported ?? 0}</p>
              <p className="text-xs text-[rgba(0,45,88,0.55)] mt-1">{t('import.imported')}</p>
            </div>
            <div className="w-px bg-[rgba(0,45,88,0.15)]" />
            <div>
              <p className="text-3xl font-bold text-[rgba(0,45,88,0.4)]">{result?.skipped ?? 0}</p>
              <p className="text-xs text-[rgba(0,45,88,0.55)] mt-1">{t('import.skipped')}</p>
            </div>
          </div>
          {result && result.errors.length > 0 && (
            <p className="text-sm text-[#C0392B] mb-4">{t('import.errors', { count: result.errors.length })}</p>
          )}
          <button
            onClick={handleReset}
            className="px-6 py-2 bg-[#0084C5] text-white rounded-lg font-medium"
          >
            {t('common.confirm')}
          </button>
        </div>
      </div>
    );
  }

  if (phase === 'error') {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <div className="bg-[#E8F3FB] p-6 rounded-xl">
          <h2 className="text-base font-semibold text-[#C0392B] mb-2">{t('status.error')}</h2>
          <pre className="text-sm text-[#002D58] mb-5 bg-[#F4F9FD] p-3 rounded-lg overflow-x-auto whitespace-pre-wrap break-all">
            {error}
          </pre>
          <button
            onClick={handleReset}
            className="px-4 py-2 bg-[#0084C5] text-white rounded-lg font-medium"
          >
            {t('common.back')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h1 className="text-[22px] font-medium text-[#002D58] mb-6">{t('import.title')}</h1>

      <StepIndicator current={step} />

      {/* Step 1 – Select source folder */}
      {step === 1 && (
        <div className="bg-[#E8F3FB] p-6 rounded-xl">
          <h3 className="text-base font-semibold text-[#002D58] mb-1">
            {t('import.step1Title')}
          </h3>
          <p className="text-sm text-[rgba(0,45,88,0.55)] mb-5">{t('import.step1Desc')}</p>

          <div className="mb-5">
            <FolderRow
              label={t('import.source')}
              path={sourcePath}
              onSelect={handleSelectSource}
              onChangeTrigger={handleSelectSource}
              selectLabelKey="import.selectSource"
            />
          </div>

          <div className="flex justify-end">
            <button
              onClick={() => setStep(2)}
              disabled={!sourcePath}
              className={`px-5 py-2 rounded-lg font-medium ${
                sourcePath
                  ? 'bg-[#0084C5] text-white'
                  : 'bg-[rgba(0,45,88,0.12)] text-[rgba(0,45,88,0.4)] cursor-not-allowed'
              }`}
            >
              {t('common.next')} →
            </button>
          </div>
        </div>
      )}

      {/* Step 2 – Select archive folder */}
      {step === 2 && (
        <div className="bg-[#E8F3FB] p-6 rounded-xl">
          <h3 className="text-base font-semibold text-[#002D58] mb-1">
            {t('import.step2Title')}
          </h3>
          <p className="text-sm text-[rgba(0,45,88,0.55)] mb-5">{t('import.step2Desc')}</p>

          <div className="space-y-2 mb-5">
            <div className="p-3 bg-[#F4F9FD] rounded-lg">
              <p className="text-xs text-[rgba(0,45,88,0.45)] mb-0.5">{t('import.source')}</p>
              <p className="text-sm text-[#002D58] truncate font-mono">{sourcePath}</p>
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
            <button
              onClick={() => setStep(1)}
              className="px-4 py-2 border border-[rgba(0,45,88,0.3)] text-[#002D58] rounded-lg font-medium"
            >
              ← {t('common.back')}
            </button>
            <button
              onClick={() => setStep(3)}
              disabled={!archivePath}
              className={`px-5 py-2 rounded-lg font-medium ${
                archivePath
                  ? 'bg-[#0084C5] text-white'
                  : 'bg-[rgba(0,45,88,0.12)] text-[rgba(0,45,88,0.4)] cursor-not-allowed'
              }`}
            >
              {t('common.next')} →
            </button>
          </div>
        </div>
      )}

      {/* Step 3 – Analyze photos */}
      {step === 3 && (
        <div className="bg-[#E8F3FB] p-6 rounded-xl">
          <h3 className="text-base font-semibold text-[#002D58] mb-1">
            {t('import.step3Title')}
          </h3>
          <p className="text-sm text-[rgba(0,45,88,0.55)] mb-5">{t('import.step3Desc')}</p>

          <div className="space-y-2 mb-5">
            <div className="p-3 bg-[#F4F9FD] rounded-lg">
              <p className="text-xs text-[rgba(0,45,88,0.45)] mb-0.5">{t('import.source')}</p>
              <p className="text-sm text-[#002D58] truncate font-mono">{sourcePath}</p>
            </div>
            <div className="p-3 bg-[#F4F9FD] rounded-lg">
              <p className="text-xs text-[rgba(0,45,88,0.45)] mb-0.5">{t('import.archive')}</p>
              <p className="text-sm text-[#002D58] truncate font-mono">{archivePath}</p>
            </div>
          </div>

          {phase === 'idle' && (
            <div className="flex justify-between items-center">
              <button
                onClick={() => setStep(2)}
                className="px-4 py-2 border border-[rgba(0,45,88,0.3)] text-[#002D58] rounded-lg font-medium"
              >
                ← {t('common.back')}
              </button>
              <button
                onClick={handleStartAnalysis}
                className="px-5 py-2 bg-[#0084C5] text-white rounded-lg font-medium"
              >
                {t('import.startAnalysis')}
              </button>
            </div>
          )}

          {isAnalyzing && (
            <div className="mt-2">
              <p className="text-sm font-medium text-[#002D58] mb-3">
                {phase === 'scanning' ? t('import.scanningFolder') : t('import.analyzing')}
              </p>
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
              <div className="p-4 bg-[rgba(42,158,173,0.1)] rounded-xl mb-4">
                <p className="text-sm font-medium text-[#2A9EAD]">
                  {t('import.analysisComplete', { count: importPlan.images.length })}
                </p>
                {importPlan.conflicts_count > 0 && (
                  <p className="text-xs text-[#E6A817] mt-1">
                    {t('import.conflicts', { count: importPlan.conflicts_count })}
                  </p>
                )}
              </div>
              <div className="flex justify-between items-center">
                <button
                  onClick={() => setStep(2)}
                  className="px-4 py-2 border border-[rgba(0,45,88,0.3)] text-[#002D58] rounded-lg font-medium"
                >
                  ← {t('common.back')}
                </button>
                <button
                  onClick={() => setStep(4)}
                  className="px-5 py-2 bg-[#0084C5] text-white rounded-lg font-medium"
                >
                  {t('common.next')} →
                </button>
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
