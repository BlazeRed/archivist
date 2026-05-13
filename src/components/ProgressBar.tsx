import { useTranslation } from 'react-i18next';

interface ProgressBarProps {
  current: number;
  total: number;
  currentFile: string;
  phase: string;
}

export function ProgressBar({ current, total, currentFile, phase }: ProgressBarProps) {
  const { t } = useTranslation();
  const percentage = total > 0 ? (current / total) * 100 : 0;

  return (
    <div className="w-full max-w-md">
      <div className="flex justify-between text-sm mb-2">
        <span className="text-[#002D58]">
          {phase === 'analyzing' && t('import.analyzingProgress').replace('{{current}}', String(current)).replace('{{total}}', String(total))}
          {phase === 'importing' && t('import.importProgress').replace('{{current}}', String(current)).replace('{{total}}', String(total))}
          {phase === 'scanning' && t('import.analyzing')}
        </span>
        <span className="text-[#0084C5] font-medium">{Math.round(percentage)}%</span>
      </div>
      <div className="h-2 bg-[rgba(0,132,197,0.12)] rounded-full overflow-hidden">
        <div 
          className="h-full bg-[#0084C5] transition-all duration-300"
          style={{ width: `${percentage}%` }}
        />
      </div>
      {currentFile && (
        <p className="text-xs text-[rgba(0,45,88,0.55)] mt-2 truncate">{currentFile}</p>
      )}
    </div>
  );
}