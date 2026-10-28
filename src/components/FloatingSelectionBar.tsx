import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';

// Icon-only circle on a narrow bar, icon + label pill from @2xl (container query on the bar)
export const BAR_BUTTON = 'size-9 px-0 @2xl:w-auto @2xl:pl-3.5 @2xl:pr-4';
export const BAR_LABEL = 'hidden @2xl:inline';

/** Floating multi-selection chrome of the timeline: count pill above on the left, full-width action bar below.
 *  The bar is a size container: buttons using BAR_BUTTON/BAR_LABEL show icon + label when it is wide enough
 *  (@2xl, 672px), icon only otherwise. Place inside a `relative` parent. */
export function FloatingSelectionBar({ count, children }: { count: number; children: ReactNode }) {
  const { t } = useTranslation();
  return (
    <div className="absolute bottom-3 inset-x-3 z-10 flex flex-col items-start gap-2 animate-in fade-in slide-in-from-bottom-8 duration-300 ease-[cubic-bezier(.2,.8,.2,1)]">
      <Badge variant="outline" className="cursor-default select-none h-9 px-4 border-0 bg-popover shadow-float text-xs font-normal text-muted-foreground tabular-nums">
        {t('timeline.selected', { count })}
      </Badge>

      <div className="@container w-full h-12 flex items-center gap-2 px-1.5 rounded-full bg-popover shadow-float">
        {children}
      </div>
    </div>
  );
}
