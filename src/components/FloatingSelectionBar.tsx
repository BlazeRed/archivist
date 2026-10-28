import type { ReactNode } from 'react';
import { XIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { FLOATING_BOTTOM } from './ThumbnailGrid';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

// Icon-only circle on a narrow bar, icon + label pill from @2xl (container query on the bar)
export const BAR_BUTTON = 'size-9 px-0 @2xl:w-auto @2xl:pl-3.5 @2xl:pr-4';
export const BAR_LABEL = 'hidden @2xl:inline';
// Compact pill for actions in the floating row under the topbar. Disabled stays opaque (muted fill):
// a translucent pill would let the photos show through
export const ROW_BUTTON = 'h-9 px-3.5 text-xs shadow-float disabled:opacity-100 disabled:bg-muted disabled:text-muted-foreground';

/** Floating multi-selection chrome of the timeline: count pill above on the left, full-width action bar below.
 *  The bar is a size container: buttons using BAR_BUTTON/BAR_LABEL show icon + label when it is wide enough
 *  (@2xl, 672px), icon only otherwise. Place inside a `relative` parent. */
export function FloatingSelectionBar({ count, children }: { count: number; children: ReactNode }) {
  const { t } = useTranslation();
  return (
    <>
      <BottomFade height={FLOATING_BOTTOM + 8} />
      <div className="absolute bottom-3 inset-x-3 z-10 flex flex-col items-start gap-2 animate-in fade-in slide-in-from-bottom-8 duration-300 ease-[cubic-bezier(.2,.8,.2,1)]">
        <InfoPill>
          {t('timeline.selected', { count })}
        </InfoPill>

        <div className="@container w-full h-12 flex items-center gap-2 px-1.5 rounded-full bg-popover shadow-float">
          {children}
        </div>
      </div>
    </>
  );
}

/** Selected count + clear (✕), one floating pill; ends on the button with a 3px inset.
 *  Used where selection actions sit in the floating row instead of the bottom bar. */
export function SelectionCountPill({ count, onClear, tooltipSide = 'bottom' }: {
  count: number;
  onClear: () => void;
  tooltipSide?: 'top' | 'bottom';
}) {
  const { t } = useTranslation();
  return (
    <div className="h-9 flex items-center gap-1 pl-4 pr-[3px] rounded-full bg-popover shadow-float animate-in fade-in duration-200">
      <span className="cursor-default select-none text-xs text-muted-foreground tabular-nums whitespace-nowrap">
        {t('timeline.selected', { count })}
      </span>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={t('timeline.clearSelection')} onClick={onClear} className="text-muted-foreground">
            <XIcon />
          </Button>
        </TooltipTrigger>
        <TooltipContent side={tooltipSide}>{t('timeline.clearSelection')}</TooltipContent>
      </Tooltip>
    </div>
  );
}

/** Read-only info pill of the floating row (item count, trash summary) */
export function InfoPill({ children }: { children: ReactNode }) {
  return (
    <Badge variant="outline" className="cursor-default select-none h-9 px-4 border-0 bg-popover shadow-float text-xs font-normal text-muted-foreground tabular-nums">
      {children}
    </Badge>
  );
}

/** Scroll-edge fade at the bottom, lighter than the top one (user found a full mirror too heavy): content dissolves under bottom floating chrome
 *  (selection bar, dialog actions) so it stays readable. Place inside a `relative` parent, before the chrome. */
export function BottomFade({ height }: { height: number }) {
  return (
    <div
      className="pointer-events-none absolute inset-x-0 bottom-0 z-10 bg-linear-to-t from-background/90 from-20% to-transparent animate-in fade-in duration-300"
      style={{ height }}
    />
  );
}
