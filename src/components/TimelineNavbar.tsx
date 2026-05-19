import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useTimelineStore } from '../stores/timelineStore';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useMonthNames } from '@/lib/months';
import { cn } from '@/lib/utils';

export function TimelineNavbar() {
  const { t } = useTranslation();
  const monthNames = useMonthNames();
  const { filter, setFilter, availableYears, availableGroups, images, allImages } = useTimelineStore();
  const [open, setOpen] = useState(false);

  const isFiltered = filter.noDate || filter.yearFrom !== null || filter.yearTo !== null || filter.month !== null || filter.groupId !== null;
  const clearFilter = () => setFilter({ yearFrom: null, yearTo: null, month: null, noDate: false, groupId: null });

  const photoCountLabel = images.length !== allImages.length
    ? `${images.length} / ${allImages.length} ${t('timeline.photos')}`
    : `${allImages.length} ${t('timeline.photos')}`;

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

  // Chips shown in topbar when panel is closed and filters are active
  const filterChips: string[] = [];
  if (filter.noDate) {
    filterChips.push(t('timeline.noDateFilter'));
  } else {
    if (filter.yearFrom !== null) filterChips.push(rangeLabel);
    if (filter.month !== null) filterChips.push(monthNames[filter.month - 1]);
    if (filter.groupId !== null) {
      const g = availableGroups.find(g => g.id === filter.groupId);
      if (g) filterChips.push(g.name);
    }
  }

  return (
    <div className="shrink-0 border-b border-border bg-card">
      {/* Always-visible h-12 row */}
      <div className="h-12 px-4 flex items-center gap-3">
        <h2 className="font-semibold text-sm text-foreground whitespace-nowrap">{t('nav.timeline')}</h2>
        <span className="text-xs text-muted-foreground whitespace-nowrap">{photoCountLabel}</span>

        <div className="ml-auto flex items-center gap-2">
          {/* Active filter chips — visible only when panel is closed */}
          {isFiltered && !open && filterChips.map((chip, i) => (
            <span
              key={i}
              className="text-xs px-2 py-0.5 rounded-full bg-primary/12 text-primary font-medium whitespace-nowrap"
            >
              {chip}
            </span>
          ))}

          {/* Filters toggle button */}
          <button
            onClick={() => setOpen(v => !v)}
            className={cn(
              'h-8 px-3 rounded-md border text-xs font-medium flex items-center gap-1.5 transition-colors',
              isFiltered
                ? 'bg-primary border-primary text-primary-foreground hover:brightness-90'
                : 'border-border text-foreground hover:bg-muted'
            )}
          >
            {/* Funnel icon */}
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M3 4h18M7 9h10M10 14h4" />
            </svg>
            {t('timeline.filter')}
            {/* Chevron */}
            <svg
              className={cn('w-3 h-3 transition-transform duration-150', open && 'rotate-180')}
              fill="none" stroke="currentColor" viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>
      </div>

      {/* Expansion panel */}
      {open && (
        <div className="px-4 py-5 border-t border-border flex items-center gap-6 flex-wrap">
          {/* Year range slider */}
          {!filter.noDate && years.length > 1 && (
            <div className="flex flex-col gap-1.5 w-[280px] shrink-0">
              <span className="text-xs font-medium text-foreground text-center w-full">{rangeLabel}</span>
              <div className="flex items-center gap-2">
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
              </div>
            </div>
          )}

          {/* Month select */}
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
              <SelectTrigger className="w-36">
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

          {/* Group select */}
          {availableGroups.length > 0 && !filter.noDate && (
            <Select
              value={filter.groupId?.toString() ?? 'all'}
              onValueChange={(v) => setFilter({ groupId: v === 'all' ? null : Number(v) })}
            >
              <SelectTrigger className="w-44">
                <SelectValue placeholder={t('timeline.allGroups')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('timeline.allGroups')}</SelectItem>
                {availableGroups.map(g => (
                  <SelectItem key={g.id} value={g.id.toString()}>{g.name} ({g.image_count})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {/* No-date checkbox */}
          <div className="flex items-center gap-2">
            <Checkbox
              id="exp-no-date"
              checked={filter.noDate}
              onCheckedChange={(checked) => setFilter({ noDate: checked === true })}
            />
            <Label htmlFor="exp-no-date" className="text-sm cursor-pointer whitespace-nowrap">
              {t('timeline.noDateFilter')}
            </Label>
          </div>

          {/* Clear */}
          {isFiltered && (
            <Button variant="link" size="xs" onClick={clearFilter} className="p-0 h-auto text-xs ml-auto">
              {t('timeline.clearFilter')}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
