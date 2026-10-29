import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

/** A chosen folder + its change button, framed as one pill (Import From/To, Settings archive).
 *  The path truncates in the middle (parent shrinks, last segment stays) so the folder name
 *  stays readable; the full path is in the tooltip. Empty path shows `placeholder`. */
export function PathField({ label, path, placeholder, actionLabel, onAction, disabled }: {
  label?: string;
  path: string;
  placeholder?: string;
  actionLabel: string;
  onAction: () => void;
  disabled?: boolean;
}) {
  const cut = path.replace(/\/+$/, '').lastIndexOf('/') + 1;
  return (
    <div className="flex-1 min-w-0 h-11 pl-4 pr-1.5 bg-muted rounded-full border border-border flex items-center gap-2">
      {label && <span className="text-xs text-muted-foreground shrink-0">{label}</span>}
      {path ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="flex-1 min-w-0 flex text-sm text-foreground font-mono">
              <span className="truncate">{path.slice(0, cut)}</span>
              <span className="shrink-0">{path.slice(cut)}</span>
            </span>
          </TooltipTrigger>
          <TooltipContent side="bottom">{path}</TooltipContent>
        </Tooltip>
      ) : (
        <span className="flex-1 min-w-0 text-sm text-muted-foreground truncate">{placeholder}</span>
      )}
      <Button variant="secondary" size="sm" onClick={onAction} disabled={disabled} className="shrink-0">
        {actionLabel}
      </Button>
    </div>
  );
}
