import { useTranslation } from 'react-i18next';
import { useImportStore, ImportAction } from '../stores/importStore';
import { ProgressBar } from './ProgressBar';

export function ConflictReview({ onImport, onBack }: { onImport: () => void; onBack: () => void }) {
  const { t } = useTranslation();
  const { importPlan, analyzedImages, resolutions, setResolution, phase, progress } =
    useImportStore();

  if (!importPlan) return null;

  const conflicts = analyzedImages.filter((img) => img.conflict);

  const getAction = (hash: string): ImportAction =>
    resolutions.find((r) => r.hash === hash)?.action ?? 'KeepBoth';

  const formatSize = (bytes: number) => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const isImporting = phase === 'importing';

  return (
    <div className="bg-[#E8F3FB] p-6 rounded-xl">
      <h3 className="text-base font-semibold text-[#002D58] mb-1">{t('conflicts.title')}</h3>

      <div className="flex items-center justify-between p-3 bg-[#F4F9FD] rounded-lg mb-4">
        <span className="text-sm text-[#002D58]">
          {importPlan.images.length} photos
        </span>
        <span className="text-sm text-[rgba(0,45,88,0.55)]">
          {formatSize(importPlan.total_size)}
        </span>
      </div>

      {conflicts.length === 0 ? (
        <div className="mb-5 p-4 bg-[rgba(42,158,173,0.12)] rounded-xl">
          <p className="text-sm text-[#2A9EAD]">
            No conflicts — ready to import all {importPlan.images.length} photos.
          </p>
        </div>
      ) : (
        <div className="mb-5">
          <p className="text-sm text-[#A87B0A] mb-3">
            {conflicts.length} conflict(s) — choose how to handle each:
          </p>
          <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
            {conflicts.map((img) => {
              const selected = getAction(img.hash);
              return (
                <div
                  key={img.hash}
                  className="p-3 bg-[#F4F9FD] rounded-lg border border-[rgba(0,45,88,0.15)]"
                >
                  <p className="text-sm font-medium text-[#002D58] mb-2 truncate">
                    {img.filename}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {(['KeepBoth', 'Replace', 'Skip'] as ImportAction[]).map((action) => (
                      <button
                        key={action}
                        onClick={() => setResolution(img.hash, action)}
                        className={`px-3 py-1 text-xs rounded-full border transition-colors ${
                          selected === action
                            ? 'bg-[rgba(0,132,197,0.12)] border-[#0084C5] text-[#0084C5] font-medium'
                            : 'bg-transparent border-[rgba(0,45,88,0.28)] text-[rgba(0,45,88,0.55)]'
                        }`}
                      >
                        {action === 'KeepBoth' && t('conflicts.keepBoth')}
                        {action === 'Replace' && t('conflicts.replace')}
                        {action === 'Skip' && t('conflicts.keepExisting')}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
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

      <div className="flex gap-3">
        <button
          onClick={onImport}
          disabled={isImporting}
          className={`px-5 py-2 rounded-lg font-medium ${
            isImporting
              ? 'bg-[rgba(0,132,197,0.4)] text-white cursor-not-allowed'
              : 'bg-[#0084C5] text-white'
          }`}
        >
          {isImporting ? t('import.importing') : t('import.importPhotos')}
        </button>
        <button
          onClick={onBack}
          disabled={isImporting}
          className={`px-4 py-2 border rounded-lg font-medium ${
            isImporting
              ? 'border-[rgba(0,45,88,0.15)] text-[rgba(0,45,88,0.3)] cursor-not-allowed'
              : 'border-[rgba(0,45,88,0.3)] text-[#002D58]'
          }`}
        >
          ← {t('common.back')}
        </button>
      </div>
    </div>
  );
}
