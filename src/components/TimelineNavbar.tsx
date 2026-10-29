import { useTranslation } from 'react-i18next';
import { CircleCheckIcon } from 'lucide-react';
import { useTimelineStore } from '../stores/timelineStore';
import { useGroupUIStore } from '../stores/groupUIStore';
import { FilterPopover } from './FilterPopover';
import { InfoPill, ROW_BUTTON } from './FloatingSelectionBar';
import { Button } from '@/components/ui/button';
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
      <InfoPill>
        {mediaCountLabel}
      </InfoPill>

      <FilterPopover
        filter={filter}
        setFilter={setFilter}
        allImages={allImages}
        availableYears={availableYears}
        availableGroups={availableGroups}
      />

      <SelectModeButton active={isSelectionMode} onToggle={() => setSelectionMode(!isSelectionMode)} />
    </div>
  );
}

/** Pill that turns multi-selection on/off (Timeline, Favourites) */
export function SelectModeButton({ active, onToggle }: { active: boolean; onToggle: () => void }) {
  const { t } = useTranslation();
  return (
    <Button
      variant={active ? 'secondary' : 'outline'}
      onClick={onToggle}
      aria-pressed={active}
      className={cn(ROW_BUTTON, !active && 'bg-popover hover:bg-card')}
    >
      <CircleCheckIcon />
      {t('timeline.select')}
    </Button>
  );
}
