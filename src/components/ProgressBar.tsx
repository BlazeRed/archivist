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
    <div className="w-full max-w-md">
      <div className="flex justify-between text-sm mb-2">
        <span className="text-foreground">
          {phase === 'analyzing' && t('import.analyzingProgress').replace('{{current}}', String(current)).replace('{{total}}', String(total))}
          {phase === 'importing' && t('import.importProgress').replace('{{current}}', String(current)).replace('{{total}}', String(total))}
          {phase === 'scanning' && t('import.analyzing')}
        </span>
        <span className="text-primary font-medium">{Math.round(percentage)}%</span>
      </div>
      <Progress value={percentage} />
      {currentFile && (
        <p className="text-xs text-muted-foreground mt-2 truncate">{currentFile}</p>
      )}
    </div>
  );
}
