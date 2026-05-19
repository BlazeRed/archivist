import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useTimelineStore } from '../stores/timelineStore';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useMonthNames } from '@/lib/months';

export function TimelineNavbar() {
  const { t } = useTranslation();
  const monthNames = useMonthNames();
  const { filter, setFilter, availableYears, availableGroups, images, allImages } = useTimelineStore();

  const isFiltered = filter.noDate || filter.yearFrom !== null || filter.yearTo !== null || filter.month !== null || filter.groupId !== null;
  const clearFilter = () => setFilter({ yearFrom: null, yearTo: null, month: null, noDate: false, groupId: null });

  const photoCountLabel = images.length !== allImages.length
    ? `${images.length} / ${allImages.length} ${t('timeline.photos')}`
    : `${allImages.length} ${t('timeline.photos')}`;

  // Year-range slider (inline)
  const years = useMemo(() => !filter.noDate && availableYears.length > 1
    ? [...availableYears].reverse()
    : [], [availableYears, filter.noDate]);

  const fromIdx = filter.yearFrom !== null && years.length > 0 ? years.indexOf(filter.yearFrom) : 0;
  const toIdx = filter.yearTo !== null && years.length > 0 ? years.indexOf(filter.yearTo) : years.length - 1;
  const rangeLabel = filter.yearFrom === null
    ? t('timeline.allYears')
    : filter.yearFrom === filter.yearTo
      ? String(filter.yearFrom)
      : `${filter.yearFrom} – ${filter.yearTo}`;

  // Month filter (in popover)
  const singleYear = !filter.noDate && availableYears.length === 1 ? availableYears[0] : null;
  const monthYear = filter.yearFrom ?? singleYear;

  const availableMonths = useMemo(() => {
    if (!monthYear) return [];
    if (filter.yearFrom !== null && filter.yearFrom !== filter.yearTo) return [];
    const months = new Set(
      allImages
        .filter(img => img.taken_at && new Date(img.taken_at).getFullYear() === monthYear)
        .map(img => new Date(img.taken_at!).getMonth() + 1)
    );
    return [...months].sort((a, b) => a - b);
  }, [allImages, monthYear, filter.yearFrom, filter.yearTo]);

  const showMonthFilter = !filter.noDate && (
    (filter.yearFrom !== null && filter.yearFrom === filter.yearTo) ||
    availableYears.length === 1
  );

  return (
    <div className="h-12 px-4 flex items-center gap-3 border-b border-border bg-card shrink-0">
      <h2 className="font-semibold text-sm text-foreground whitespace-nowrap">{t('nav.timeline')}</h2>
      <span className="text-xs text-muted-foreground whitespace-nowrap">{photoCountLabel}</span>

      {/* Right controls */}
      <div className="flex-1 flex items-center justify-end gap-2">
        {/* Inline year-range slider */}
        {years.length > 1 && (
          <div className="flex items-center gap-2 flex-1 max-w-[560px] min-w-[200px]">
            <span className="text-xs text-muted-foreground whitespace-nowrap">{years[0]}</span>
            <Slider
              min={0}
              max={years.length - 1}
              step={1}
              value={[fromIdx < 0 ? 0 : fromIdx, toIdx < 0 ? years.length - 1 : toIdx]}
              onValueChange={([from, to]) => setFilter({ yearFrom: years[from], yearTo: years[to] })}
              className="flex-1"
            />
            <span className="text-xs text-muted-foreground whitespace-nowrap">{years[years.length - 1]}</span>
            <span className="text-xs font-medium whitespace-nowrap ml-1">{rangeLabel}</span>
          </div>
        )}

        {isFiltered && (
          <Button variant="link" size="xs" onClick={clearFilter} className="p-0 h-auto text-xs">
            {t('timeline.clearFilter')}
          </Button>
        )}

        <Popover>
          <PopoverTrigger asChild>
            <Button size="sm" variant="outline" className="h-8 text-xs">
              {t('timeline.moreFilters')}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-64 space-y-3">
            {/* No-date toggle */}
            <div className="flex items-center gap-2">
              <Checkbox
                id="navbar-no-date"
                checked={filter.noDate}
                onCheckedChange={(checked) => setFilter({ noDate: checked === true })}
              />
              <Label htmlFor="navbar-no-date" className="text-sm cursor-pointer">
                {t('timeline.noDateFilter')}
              </Label>
            </div>

            {/* Month filter */}
            {showMonthFilter && availableMonths.length > 0 && (
              <Select
                value={filter.month?.toString() ?? 'all'}
                onValueChange={(v) => {
                  const month = v === 'all' ? null : Number(v);
                  if (singleYear !== null && month !== null) {
                    setFilter({ yearFrom: singleYear, yearTo: singleYear, month });
                  } else {
                    setFilter({ month });
                  }
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={t('timeline.allMonths')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('timeline.allMonths')}</SelectItem>
                  {availableMonths.map(m => (
                    <SelectItem key={m} value={m.toString()}>{monthNames[m - 1]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {/* Group filter */}
            {availableGroups.length > 0 && !filter.noDate && (
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">{t('timeline.filterGroups')}</p>
                <Select
                  value={filter.groupId?.toString() ?? 'all'}
                  onValueChange={(v) => setFilter({ groupId: v === 'all' ? null : Number(v) })}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={t('timeline.allGroups')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('timeline.allGroups')}</SelectItem>
                    {availableGroups.map(g => (
                      <SelectItem key={g.id} value={g.id.toString()}>{g.name} ({g.image_count})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}
