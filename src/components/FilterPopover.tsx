import { useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { TimelineFilter } from '../stores/timelineStore';
import type { Image, GroupWithCount } from '../types';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useMonthNames } from '@/lib/months';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

/** Filters pill + floating panel. Controlled: the Timeline passes its store filter, AddMediaModal a local one.
 *  `children` adds extra controls at the start of the panel; the group select shows only when groups are passed. */
export function FilterPopover({ filter, setFilter, allImages, availableYears, availableGroups = [], children }: {
  filter: TimelineFilter;
  setFilter: (partial: Partial<TimelineFilter>) => void;
  allImages: Image[];
  availableYears: number[]; // newest first
  availableGroups?: GroupWithCount[];
  children?: ReactNode;
}) {
  const { t } = useTranslation();
  const monthNames = useMonthNames();
  const [open, setOpen] = useState(false);

  const isFiltered = filter.noDate || filter.yearFrom !== null || filter.yearTo !== null || filter.month !== null || filter.groupId !== null || filter.mediaType !== 'all';
  const clearFilter = () => setFilter({ yearFrom: null, yearTo: null, month: null, noDate: false, groupId: null, mediaType: 'all' });

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

  // Active filters, listed in the pill's tooltip
  const filterChips: string[] = [];
  if (filter.mediaType !== 'all') {
    filterChips.push(t(`timeline.media${filter.mediaType.charAt(0).toUpperCase() + filter.mediaType.slice(1)}`));
  }
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

  const filterButton = (
    <PopoverTrigger asChild>
      <Button
        variant={isFiltered ? 'secondary' : 'outline'}
        className={cn('h-9 pl-3.5 pr-3 text-xs shadow-float', !isFiltered && 'bg-popover hover:bg-card aria-expanded:bg-card')}
      >
        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h18M7 9h10M10 14h4" />
        </svg>
        {t('timeline.filter')}
        {isFiltered && (
          <Badge variant="outline" className="h-4 min-w-4 px-1 border-0 bg-secondary-foreground text-secondary text-[10px] font-semibold tabular-nums">
            {filterChips.length}
          </Badge>
        )}
        <svg className={cn('size-3! transition-transform duration-150', open && 'rotate-180')} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </Button>
    </PopoverTrigger>
  );

  return (
      <Popover open={open} onOpenChange={setOpen}>
        {/* Tooltip lists the active filters */}
        {isFiltered ? (
          <Tooltip>
            <TooltipTrigger asChild>{filterButton}</TooltipTrigger>
            <TooltipContent side="bottom">{filterChips.join(' · ')}</TooltipContent>
          </Tooltip>
        ) : filterButton}

        <PopoverContent
          align="end"
          sideOffset={8}
          className="squircle w-max max-w-[min(720px,calc(100vw-2rem))] flex-row flex-wrap items-center gap-6 px-5 py-4 rounded-xl ring-0 bg-popover"
        >
          {children}

          {/* Media type */}
          <ToggleGroup
            type="single"
            variant="segmented"
            spacing={0.5}
            value={filter.mediaType}
            onValueChange={(v) => { if (v) setFilter({ mediaType: v as typeof filter.mediaType }); }}
            className="bg-muted rounded-full p-[3px] shrink-0"
          >
            {(['all', 'images', 'videos'] as const).map(v => (
              <ToggleGroupItem key={v} value={v} className="px-3 text-xs">
                {t(`timeline.media${v.charAt(0).toUpperCase() + v.slice(1)}`)}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>

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
        </PopoverContent>
      </Popover>
  );
}
