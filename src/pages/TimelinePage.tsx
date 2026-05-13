import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useTimelineStore } from '../stores/timelineStore';
import { FilterPanel } from '../components/FilterPanel';
import { ThumbnailGrid } from '../components/ThumbnailGrid';
import { ImageDetail } from '../components/ImageDetail';
import { useAppConfigStore } from '../stores/appConfigStore';

export function TimelinePage() {
  const { t } = useTranslation();
  const { fetchImages, loading } = useTimelineStore();
  const { config } = useAppConfigStore();

  useEffect(() => {
    if (config.archive_path) {
      fetchImages();
    }
  }, [config.archive_path, fetchImages]);

  return (
    <div className="flex h-[calc(100vh-52px)]">
      {/* Sidebar */}
      <aside className="w-64 p-4 border-r border-[rgba(0,45,88,0.15)]">
        <FilterPanel />
      </aside>

      {/* Main content */}
      <main className="flex-1 p-4 overflow-auto">
        <h1 className="text-[22px] font-medium text-[#002D58] mb-4">{t('timeline.title')}</h1>
        
        {!config.archive_path ? (
          <div className="bg-[#E8F3FB] p-6 rounded-xl text-center">
            <p className="text-[#002D58] opacity-55 mb-4">
              Please set an archive path in Settings to view your photos.
            </p>
          </div>
        ) : loading ? (
          <div className="flex items-center justify-center h-64">
            <p className="text-[#002D58] opacity-55">{t('common.loading')}</p>
          </div>
        ) : (
          <ThumbnailGrid />
        )}
      </main>

      {/* Image detail modal */}
      <ImageDetail />
    </div>
  );
}