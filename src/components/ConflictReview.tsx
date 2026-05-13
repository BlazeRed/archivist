import { useTranslation } from 'react-i18next';
import { useImportStore, ImportAction } from '../stores/importStore';

export function ConflictReview({ onImport, onBack }: { onImport: () => void; onBack: () => void }) {
  const { t } = useTranslation();
  const { importPlan, analyzedImages, setResolution } = useImportStore();

  if (!importPlan) return null;

  const conflicts = analyzedImages.filter(img => img.conflict);

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="bg-[#E8F3FB] p-6 rounded-xl">
      <h3 className="text-lg font-medium text-[#002D58] mb-4">{t('conflicts.title')}</h3>
      
      {conflicts.length === 0 ? (
        <div className="mb-4 p-4 bg-[rgba(42,158,173,0.12)] rounded-lg">
          <p className="text-[#2A9EAD]">
            No conflicts found. Ready to import {importPlan.images.length} images ({formatSize(importPlan.total_size)}).
          </p>
        </div>
      ) : (
        <div className="mb-4">
          <p className="text-sm text-[#A87B0A] mb-4">
            {conflicts.length} conflict(s) found. Choose how to handle each one:
          </p>
          
          <div className="space-y-3 max-h-64 overflow-y-auto">
            {conflicts.map((img) => (
              <div key={img.hash} className="p-3 bg-[#F4F9FD] rounded-lg border border-[rgba(0,45,88,0.15)]">
                <p className="text-sm font-medium text-[#002D58] mb-2">{img.filename}</p>
                <div className="flex flex-wrap gap-2">
                  {(['KeepBoth', 'Replace', 'Skip'] as ImportAction[]).map((action) => {
                    const isSelected = true;
                    return (
                      <button
                        key={action}
                        onClick={() => setResolution(img.hash, action)}
                        className={`px-3 py-1 text-xs rounded-full border transition-colors ${
                          isSelected
                            ? 'bg-[rgba(0,132,197,0.10)] border-[rgba(0,132,197,0.4)] text-[#0084C5]'
                            : 'bg-transparent border-[rgba(0,45,88,0.28)] text-[#002D58]'
                        }`}
                      >
                        {action === 'KeepBoth' && t('conflicts.keepBoth')}
                        {action === 'Replace' && t('conflicts.replace')}
                        {action === 'Skip' && t('conflicts.keepExisting')}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-3">
        <button 
          onClick={onImport}
          className="px-4 py-2 bg-[#0084C5] text-white rounded-lg font-medium"
        >
          {t('import.title')}
        </button>
        <button 
          onClick={onBack}
          className="px-4 py-2 border border-[#002D58] text-[#002D58] rounded-lg font-medium"
        >
          {t('common.back')}
        </button>
      </div>
    </div>
  );
}