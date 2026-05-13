import { useTranslation } from 'react-i18next';
import { useTimelineStore } from '../stores/timelineStore';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export function FilterPanel() {
  const { t } = useTranslation();
  const { filter, setFilter, availableYears, availableGroups, images, allImages } = useTimelineStore();

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-[#002D58]">{t('timeline.filter')}</h3>

      {/* No Date toggle */}
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={filter.noDate}
          onChange={(e) => setFilter({ noDate: e.target.checked })}
          className="w-4 h-4 accent-[#0084C5]"
        />
        <span className="text-sm text-[#002D58]">{t('timeline.noDateFilter')}</span>
      </label>

      {/* Year */}
      {!filter.noDate && (
        <div>
          <select
            value={filter.year ?? ''}
            onChange={(e) => setFilter({ year: e.target.value ? Number(e.target.value) : null })}
            className="w-full px-3 py-2 bg-[#F4F9FD] border border-[rgba(0,45,88,0.28)] rounded-lg text-sm text-[#002D58]"
          >
            <option value="">{t('timeline.allYears')}</option>
            {availableYears.map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
      )}

      {/* Month — only when year selected */}
      {!filter.noDate && filter.year && (
        <div>
          <select
            value={filter.month ?? ''}
            onChange={(e) => setFilter({ month: e.target.value ? Number(e.target.value) : null })}
            className="w-full px-3 py-2 bg-[#F4F9FD] border border-[rgba(0,45,88,0.28)] rounded-lg text-sm text-[#002D58]"
          >
            <option value="">{t('timeline.allMonths')}</option>
            {MONTHS.map((name, idx) => (
              <option key={idx + 1} value={idx + 1}>{name}</option>
            ))}
          </select>
        </div>
      )}

      {/* Group filter */}
      {availableGroups.length > 0 && !filter.noDate && (
        <div>
          <p className="text-xs text-[rgba(0,45,88,0.55)] mb-1">{t('timeline.filterGroups')}</p>
          <select
            value={filter.groupId ?? ''}
            onChange={(e) => setFilter({ groupId: e.target.value ? Number(e.target.value) : null })}
            className="w-full px-3 py-2 bg-[#F4F9FD] border border-[rgba(0,45,88,0.28)] rounded-lg text-sm text-[#002D58]"
          >
            <option value="">{t('timeline.allGroups')}</option>
            {availableGroups.map(g => (
              <option key={g.id} value={g.id}>{g.name} ({g.image_count})</option>
            ))}
          </select>
        </div>
      )}

      {/* Stats */}
      <p className="text-xs text-[rgba(0,45,88,0.55)]">
        {images.length !== allImages.length
          ? `${images.length} / ${allImages.length} ${t('timeline.photos')}`
          : `${allImages.length} ${t('timeline.photos')}`}
      </p>
    </div>
  );
}
