import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { open } from '@tauri-apps/plugin-dialog';
import { useImportStore } from '../stores/importStore';
import { ConflictReview } from '../components/ConflictReview';
import { ProgressBar } from '../components/ProgressBar';

export function ImportPage() {
  const { t } = useTranslation();
  const [step, setStep] = useState(1);
  
  const {
    phase,
    sourcePath,
    archivePath,
    scannedImages,
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

  const selectSourceFolder = async () => {
    const selected = await open({ directory: true });
    if (selected) {
      setSourcePath(selected as string);
      setStep(2);
    }
  };

  const selectArchiveFolder = async () => {
    const selected = await open({ directory: true });
    if (selected) {
      setArchivePath(selected as string);
    }
  };

  const handleStartScan = async () => {
    await startScan();
    await startAnalyze();
  };

  const handleStartImport = async () => {
    await startImport();
  };

  const handleReset = () => {
    reset();
    setStep(1);
  };

  if (phase === 'scanning' || phase === 'analyzing' || phase === 'importing') {
    return (
      <div className="p-6 flex flex-col items-center justify-center min-h-[400px]">
        <h2 className="text-xl font-medium text-[#002D58] mb-4">
          {phase === 'scanning' && t('import.analyzing')}
          {phase === 'analyzing' && t('import.analyzing')}
          {phase === 'importing' && t('import.importing')}
        </h2>
        <ProgressBar 
          current={progress.current} 
          total={progress.total} 
          currentFile={progress.currentFile}
          phase={phase}
        />
      </div>
    );
  }

  if (phase === 'error') {
    return (
      <div className="p-6">
        <h2 className="text-xl font-medium text-[#C0392B] mb-4">{t('status.error')}</h2>
        <p className="text-[#002D58] mb-4">{error}</p>
        <button 
          onClick={handleReset}
          className="px-4 py-2 bg-[#0084C5] text-white rounded-lg"
        >
          {t('common.back')}
        </button>
      </div>
    );
  }

  if (phase === 'complete') {
    return (
      <div className="p-6">
        <h2 className="text-xl font-medium text-[#2A9EAD] mb-4">{t('import.complete')}</h2>
        <div className="bg-[#E8F3FB] p-4 rounded-lg mb-4">
          <p className="text-[#002D58]">
            {result && t('import.importProgress')
              .replace('{{current}}', String(result.imported))
              .replace('{{total}}', String(result.imported + result.skipped))}
          </p>
          {result && result.errors.length > 0 && (
            <div className="mt-2">
              <p className="text-[#C0392B] text-sm">{result.errors.length} errors</p>
            </div>
          )}
        </div>
        <button 
          onClick={handleReset}
          className="px-4 py-2 bg-[#0084C5] text-white rounded-lg"
        >
          {t('common.confirm')}
        </button>
      </div>
    );
  }

  return (
    <div className="p-6">
      <h1 className="text-[22px] font-medium text-[#002D58] mb-6">{t('import.title')}</h1>

      {/* Step indicator */}
      <div className="flex items-center gap-2 mb-8">
        {[1, 2, 3, 4].map((s) => (
          <div key={s} className="flex items-center">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
              step >= s ? 'bg-[#0084C5] text-white' : 'bg-[#E8F3FB] text-[#002D58]'
            }`}>
              {s}
            </div>
            {s < 4 && <div className={`w-12 h-0.5 ${step > s ? 'bg-[#0084C5]' : 'bg-[#E8F3FB]'}`} />}
          </div>
        ))}
      </div>

      {/* Step 1: Select Source */}
      {step === 1 && (
        <div className="bg-[#E8F3FB] p-6 rounded-xl">
          <h3 className="text-lg font-medium text-[#002D58] mb-4">{t('import.selectSource')}</h3>
          <p className="text-[rgba(0,45,88,0.55)] mb-4 text-sm">
            Choose the folder containing your photos to import
          </p>
          <button 
            onClick={selectSourceFolder}
            className="px-4 py-2 bg-[#0084C5] text-white rounded-lg font-medium"
          >
            {t('import.selectSource')}
          </button>
        </div>
      )}

      {/* Step 2: Select Archive */}
      {step === 2 && (
        <div className="bg-[#E8F3FB] p-6 rounded-xl">
          <h3 className="text-lg font-medium text-[#002D58] mb-4">{t('import.selectDestination')}</h3>
          <p className="text-[rgba(0,45,88,0.55)] mb-4 text-sm">
            Choose where to store your archived photos
          </p>
          <div className="mb-4 p-3 bg-[#F4F9FD] rounded-lg">
            <p className="text-xs text-[rgba(0,45,88,0.55)]">Source folder</p>
            <p className="text-sm text-[#002D58] truncate">{sourcePath}</p>
            <p className="text-xs text-[#0084C5]">{scannedImages.length} images found</p>
          </div>
          <div className="flex gap-3">
            <button 
              onClick={selectArchiveFolder}
              className="px-4 py-2 bg-[#002D58] text-[#D2E8F7] rounded-lg font-medium"
            >
              {t('import.selectDestination')}
            </button>
            <button 
              onClick={() => setStep(1)}
              className="px-4 py-2 border border-[#002D58] text-[#002D58] rounded-lg font-medium"
            >
              {t('common.back')}
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Confirm and Analyze */}
      {step === 3 && archivePath && (
        <div className="bg-[#E8F3FB] p-6 rounded-xl">
          <h3 className="text-lg font-medium text-[#002D58] mb-4">{t('import.analyzing')}</h3>
          <div className="space-y-2 mb-4">
            <div className="p-3 bg-[#F4F9FD] rounded-lg">
              <p className="text-xs text-[rgba(0,45,88,0.55)]">Source</p>
              <p className="text-sm text-[#002D58] truncate">{sourcePath}</p>
            </div>
            <div className="p-3 bg-[#F4F9FD] rounded-lg">
              <p className="text-xs text-[rgba(0,45,88,0.55)]">Archive</p>
              <p className="text-sm text-[#002D58] truncate">{archivePath}</p>
            </div>
            <div className="p-3 bg-[#F4F9FD] rounded-lg">
              <p className="text-xs text-[rgba(0,45,88,0.55)]">Images to import</p>
              <p className="text-sm text-[#002D58]">{scannedImages.length}</p>
            </div>
          </div>
          <div className="flex gap-3">
            <button 
              onClick={handleStartScan}
              className="px-4 py-2 bg-[#0084C5] text-white rounded-lg font-medium"
            >
              {t('import.analyzing')}
            </button>
            <button 
              onClick={() => setStep(2)}
              className="px-4 py-2 border border-[#002D58] text-[#002D58] rounded-lg font-medium"
            >
              {t('common.back')}
            </button>
          </div>
        </div>
      )}

      {/* Step 4: Conflict Review */}
      {step === 4 && importPlan && (
        <ConflictReview 
          onImport={handleStartImport}
          onBack={() => setStep(3)}
        />
      )}
    </div>
  );
}