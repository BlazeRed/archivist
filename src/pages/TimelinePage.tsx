import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { useTimelineStore } from '../stores/timelineStore';
import { useAppConfigStore } from '../stores/appConfigStore';
import { useGroupUIStore } from '../stores/groupUIStore';
import { FilterPanel } from '../components/FilterPanel';
import { ThumbnailGrid } from '../components/ThumbnailGrid';
import { ImageDetail } from '../components/ImageDetail';

export function TimelinePage() {
  const { t } = useTranslation();
  const { fetchImages, availableGroups, fetchGroups } = useTimelineStore();
  const { config, setConfig } = useAppConfigStore();
  const { isSelectionMode, selectedImageIds, clearSelection, getSelectedCount } = useGroupUIStore();

  const [addToGroupId, setAddToGroupId] = useState<number | ''>('');
  const [addingToGroup, setAddingToGroup] = useState(false);

  const handleOpenArchive = async () => {
    const selected = await open({ directory: true });
    if (selected) {
      setConfig({ archive_path: selected as string });
      try {
        await invoke('init_archive', { archivePath: selected });
      } catch (e) {
        console.error('Failed to init archive:', e);
      }
    }
  };

  useEffect(() => {
    if (config.archive_path) {
      fetchImages();
      fetchGroups();
    }
  }, [config.archive_path, fetchImages, fetchGroups]);

  const handleAddToGroup = async () => {
    if (!addToGroupId || selectedImageIds.size === 0) return;
    setAddingToGroup(true);
    try {
      for (const imageId of selectedImageIds) {
        await invoke('add_image_to_group', { imageId, groupId: Number(addToGroupId) });
      }
      clearSelection();
      setAddToGroupId('');
    } catch (e) {
      console.error('Failed to add to group:', e);
    }
    setAddingToGroup(false);
  };

  if (!config.archive_path) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-52px)]">
        <div className="bg-[#E8F3FB] px-8 py-6 rounded-xl text-center max-w-sm">
          <p className="text-[rgba(0,45,88,0.55)] text-sm mb-4">{t('timeline.archiveNotSet')}</p>
          <button
            onClick={handleOpenArchive}
            className="px-5 py-2 bg-[#0084C5] text-white rounded-lg text-sm font-medium"
          >
            {t('timeline.openArchive')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-52px)] relative">
      {/* Sidebar */}
      <aside className="w-56 flex-shrink-0 p-4 border-r border-[rgba(0,45,88,0.15)] bg-[#E8F3FB] overflow-y-auto">
        <FilterPanel />
      </aside>

      {/* Main content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <div className="flex-1 min-h-0">
          <ThumbnailGrid />
        </div>

        {/* Selection action bar */}
        {isSelectionMode && (
          <div className="flex-shrink-0 h-14 bg-[#002D58] flex items-center px-6 gap-4 shadow-lg">
            <span className="text-[#D2E8F7] text-sm font-medium">
              {t('timeline.selected', { count: getSelectedCount() })}
            </span>

            {availableGroups.length > 0 && (
              <div className="flex items-center gap-2 ml-auto">
                <select
                  value={addToGroupId}
                  onChange={(e) => setAddToGroupId(e.target.value ? Number(e.target.value) : '')}
                  className="px-3 py-1.5 bg-[rgba(255,255,255,0.12)] border border-[rgba(255,255,255,0.25)] rounded-lg text-sm text-white"
                >
                  <option value="" className="text-[#002D58] bg-white">{t('timeline.filterGroups')}…</option>
                  {availableGroups.map(g => (
                    <option key={g.id} value={g.id} className="text-[#002D58] bg-white">
                      {g.name}
                    </option>
                  ))}
                </select>
                <button
                  onClick={handleAddToGroup}
                  disabled={!addToGroupId || addingToGroup || getSelectedCount() === 0}
                  className="px-4 py-1.5 bg-[#0084C5] text-white rounded-lg text-sm font-medium disabled:opacity-40"
                >
                  {t('timeline.addToGroup')}
                </button>
              </div>
            )}

            <button
              onClick={clearSelection}
              className="px-3 py-1.5 border border-[rgba(255,255,255,0.3)] text-[#D2E8F7] rounded-lg text-sm"
            >
              {t('timeline.cancelSelection')}
            </button>
          </div>
        )}
      </main>

      {/* Image detail modal */}
      <ImageDetail />
    </div>
  );
}
