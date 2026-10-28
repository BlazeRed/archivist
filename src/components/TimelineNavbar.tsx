import { useTranslation } from 'react-i18next';
import { useTimelineStore } from '../stores/timelineStore';
import { useGroupUIStore } from '../stores/groupUIStore';
import { FilterPopover } from './FilterPopover';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export function TimelineNavbar() {
  const { t } = useTranslation();
  const { filter, setFilter, availableYears, availableGroups, images, allImages } = useTimelineStore();
  const { isSelectionMode, setSelectionMode } = useGroupUIStore();

  const mediaCountLabel = images.length !== allImages.length
    ? `${images.length} / ${allImages.length} ${t('timeline.items')}`
    : `${allImages.length} ${t('timeline.items')}`;

  return (
    <div className="flex items-center gap-2">
      <Badge variant="outline" className="cursor-default select-none h-9 px-4 border-0 bg-popover shadow-float text-xs font-normal text-muted-foreground tabular-nums">
        {mediaCountLabel}
      </Badge>

      <FilterPopover
        filter={filter}
        setFilter={setFilter}
        allImages={allImages}
        availableYears={availableYears}
        availableGroups={availableGroups}
      />

      <Button
        variant={isSelectionMode ? 'secondary' : 'outline'}
        onClick={() => setSelectionMode(!isSelectionMode)}
        aria-pressed={isSelectionMode}
        className={cn('h-9 px-3.5 text-xs shadow-float', !isSelectionMode && 'bg-popover hover:bg-card')}
      >
        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        {t('timeline.select')}
      </Button>
    </div>
  );
}
