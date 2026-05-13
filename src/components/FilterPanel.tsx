import { useTranslation } from 'react-i18next';
import { useTimelineStore } from '../stores/timelineStore';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

export function FilterPanel() {
  const { t } = useTranslation();
  const { filter, setFilter, availableYears, images } = useTimelineStore();

  return (
    <div className="p-4 bg-[#E8F3FB] rounded-xl">
      <h3 className="text-sm font-medium text-[#002D58] mb-3">{t('timeline.filter')}</h3>
      
      {/* Year filter */}
      <div className="mb-3">
        <select
          value={filter.year || ''}
          onChange={(e) => setFilter({ 
            year: e.target.value ? Number(e.target.value) : null,
            month: null 
          })}
          className="w-full px-3 py-2 bg-[#F4F9FD] border border-[rgba(0,45,88,0.28)] rounded-lg text-sm text-[#002D58]"
        >
          <option value="">{t('timeline.allPhotos')}</option>
          {availableYears.map(year => (
            <option key={year} value={year}>{year}</option>
          ))}
        </select>
      </div>

      {/* Month filter */}
      {filter.year && (
        <div className="mb-3">
          <select
            value={filter.month || ''}
            onChange={(e) => setFilter({ 
              month: e.target.value ? Number(e.target.value) : null 
            })}
            className="w-full px-3 py-2 bg-[#F4F9FD] border border-[rgba(0,45,88,0.28)] rounded-lg text-sm text-[#002D58]"
          >
            <option value="">All months</option>
            {MONTHS.map((month, idx) => (
              <option key={idx + 1} value={idx + 1}>{month}</option>
            ))}
          </select>
        </div>
      )}

      {/* Stats */}
      <div className="text-xs text-[rgba(0,45,88,0.55)]">
        {images.length} photos
      </div>
    </div>
  );
}