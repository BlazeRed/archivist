import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useTimelineStore } from '../stores/timelineStore';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export function FilterPanel() {
  const { t } = useTranslation();
  const { filter, setFilter, availableYears, availableGroups, images, allImages } = useTimelineStore();

  const isFiltered = filter.noDate || filter.yearFrom !== null || filter.yearTo !== null || filter.month !== null || filter.groupId !== null;
  const clearFilter = () => setFilter({ yearFrom: null, yearTo: null, month: null, noDate: false, groupId: null });

  const availableMonths = useMemo(() => {
    if (!filter.yearFrom || filter.yearFrom !== filter.yearTo) return [];
    const months = new Set(
      allImages
        .filter(img => img.taken_at && new Date(img.taken_at).getFullYear() === filter.yearFrom)
        .map(img => new Date(img.taken_at!).getMonth() + 1)
    );
    return [...months].sort((a, b) => a - b);
  }, [allImages, filter.yearFrom, filter.yearTo]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">{t('timeline.filter')}</h3>
        {isFiltered && (
          <Button variant="link" size="xs" onClick={clearFilter} className="p-0 h-auto">
            {t('timeline.clearFilter')}
          </Button>
        )}
      </div>

      <div className="flex items-center gap-2">
        <Checkbox
          id="no-date"
          checked={filter.noDate}
          onCheckedChange={(checked) => setFilter({ noDate: checked === true })}
        />
        <Label htmlFor="no-date" className="text-sm cursor-pointer">
          {t('timeline.noDateFilter')}
        </Label>
      </div>

      {!filter.noDate && availableYears.length > 0 && (() => {
        const years = [...availableYears].reverse(); // oldest → newest (left → right)
        const fromIdx = filter.yearFrom !== null ? years.indexOf(filter.yearFrom) : 0;
        const toIdx = filter.yearTo !== null ? years.indexOf(filter.yearTo) : years.length - 1;
        const rangeLabel = filter.yearFrom === null
          ? t('timeline.allYears')
          : filter.yearFrom === filter.yearTo
            ? String(filter.yearFrom)
            : `${filter.yearFrom} – ${filter.yearTo}`;
        return (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">{years[0]}</span>
              <span className="text-sm font-medium text-foreground">{rangeLabel}</span>
              <span className="text-xs text-muted-foreground">{years[years.length - 1]}</span>
            </div>
            <Slider
              min={0}
              max={years.length - 1}
              step={1}
              value={[fromIdx, toIdx]}
              onValueChange={([from, to]) => setFilter({ yearFrom: years[from], yearTo: years[to] })}
            />
          </div>
        );
      })()}

      {!filter.noDate && filter.yearFrom !== null && filter.yearFrom === filter.yearTo && (
        <Select
          value={filter.month?.toString() ?? ''}
          onValueChange={(v) => setFilter({ month: Number(v) })}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder={t('timeline.allMonths')} />
          </SelectTrigger>
          <SelectContent>
            {availableMonths.map(m => (
              <SelectItem key={m} value={m.toString()}>{MONTHS[m - 1]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {availableGroups.length > 0 && !filter.noDate && (
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">{t('timeline.filterGroups')}</p>
          <Select
            value={filter.groupId?.toString() ?? ''}
            onValueChange={(v) => setFilter({ groupId: Number(v) })}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder={t('timeline.allGroups')} />
            </SelectTrigger>
            <SelectContent>
              {availableGroups.map(g => (
                <SelectItem key={g.id} value={g.id.toString()}>{g.name} ({g.image_count})</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        {images.length !== allImages.length
          ? `${images.length} / ${allImages.length} ${t('timeline.photos')}`
          : `${allImages.length} ${t('timeline.photos')}`}
      </p>
    </div>
  );
}
