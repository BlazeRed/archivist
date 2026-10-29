import { useTranslation } from 'react-i18next';
import { Progress } from '@/components/ui/progress';

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
    <div className="w-full">
      <div className="flex justify-between text-sm mb-2">
        <span className="text-foreground">
          {phase === 'analyzing' && t('import.analyzingProgress', { current, total })}
          {phase === 'importing' && t('import.importProgress', { current, total })}
          {phase === 'scanning' && t('import.analyzing')}
          {phase === 'thumbnailing' && t('import.thumbnailingProgress', { current, total })}
        </span>
        <span className="text-primary-ink font-medium tabular-nums">{Math.round(percentage)}%</span>
      </div>
      <Progress value={percentage} className="h-1.5 bg-primary/12" />
      {currentFile && (
        <p className="text-xs text-muted-foreground mt-2 truncate">{currentFile}</p>
      )}
    </div>
  );
}
