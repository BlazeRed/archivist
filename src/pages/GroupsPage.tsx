import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/core';
import { convertFileSrc } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { useGroupStore } from '../stores/dataStore';
import { useGroupUIStore } from '../stores/groupUIStore';
import { useAppConfigStore } from '../stores/appConfigStore';
import type { Image } from '../types';

interface ExportResult {
  copied: number;
  errors: string[];
  dest_path: string;
}

export function GroupsPage() {
  const { t } = useTranslation();
  const { groups, fetchGroups, createGroup, deleteGroup } = useGroupStore();
  const { config, setConfig } = useAppConfigStore();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null);
  const [groupImages, setGroupImages] = useState<Image[]>([]);

  const { selectedImageIds, isSelectionMode, clearSelection, getSelectedCount } = useGroupUIStore();

  useEffect(() => {
    fetchGroups();
  }, [fetchGroups]);

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

  const handleCreateGroup = async () => {
    if (!newGroupName.trim()) return;

    const id = await createGroup(newGroupName.trim());
    setNewGroupName('');
    setShowCreateModal(false);

    if (selectedImageIds.size > 0) {
      for (const imageId of selectedImageIds) {
        await invoke('add_image_to_group', { imageId, groupId: id });
      }
      clearSelection();
      fetchGroups();
    }
  };

  const handleExportGroup = async (groupId: number) => {
    const dest = await open({ directory: true });
    if (dest) {
      try {
        await invoke<ExportResult>('export_group', { groupId, destPath: dest });
      } catch (e) {
        console.error('Export failed:', e);
      }
    }
  };

  const handleDeleteGroup = async (id: number) => {
    if (confirm(t('groups.deleteConfirm'))) {
      await deleteGroup(id);
      if (selectedGroupId === id) {
        setSelectedGroupId(null);
        setGroupImages([]);
      }
    }
  };

  const handleSelectGroup = async (groupId: number) => {
    setSelectedGroupId(groupId);
    try {
      const imageIds = await invoke<string[]>('get_images_in_group', { groupId });
      const allImages = await invoke<Image[]>('get_all_images');
      setGroupImages(allImages.filter(img => imageIds.includes(img.id)));
    } catch (e) {
      console.error('Failed to load group images:', e);
    }
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

  const archivePath = config.archive_path.replace(/\/+$/, '');

  return (
    <div className="flex h-[calc(100vh-52px)]">
      {/* Sidebar */}
      <aside className="w-72 p-4 border-r border-[rgba(0,45,88,0.15)] bg-[#E8F3FB] flex flex-col">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-medium text-[#002D58]">{t('groups.title')}</h2>
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-3 py-1 bg-[#0084C5] text-white text-sm rounded-lg"
          >
            +
          </button>
        </div>

        {groups.length === 0 ? (
          <p className="text-sm text-[rgba(0,45,88,0.55)]">{t('groups.noGroups')}</p>
        ) : (
          <div className="space-y-2 overflow-y-auto flex-1">
            {groups.map(group => (
              <div
                key={group.id}
                onClick={() => handleSelectGroup(group.id)}
                className={`p-3 rounded-lg cursor-pointer transition-colors ${
                  selectedGroupId === group.id
                    ? 'bg-[#0084C5] text-white'
                    : 'bg-[#F4F9FD] hover:bg-[rgba(0,132,197,0.1)]'
                }`}
              >
                <p className="font-medium text-sm">{group.name}</p>
                <p className={`text-xs ${selectedGroupId === group.id ? 'text-white/70' : 'text-[rgba(0,45,88,0.55)]'}`}>
                  {t('groups.photosCount', { count: group.image_count })}
                </p>
              </div>
            ))}
          </div>
        )}
      </aside>

      {/* Main content */}
      <main className="flex-1 p-4 overflow-auto">
        {selectedGroupId ? (
          <div>
            <div className="flex justify-between items-center mb-4">
              <h1 className="text-[22px] font-medium text-[#002D58]">
                {groups.find(g => g.id === selectedGroupId)?.name}
              </h1>
              <div className="flex gap-2">
                <button
                  onClick={() => handleExportGroup(selectedGroupId)}
                  className="px-3 py-1.5 bg-[#2A9EAD] text-white text-sm rounded-lg font-medium"
                >
                  {t('groups.export')}
                </button>
                <button
                  onClick={() => handleDeleteGroup(selectedGroupId)}
                  className="px-3 py-1.5 bg-[#C0392B] text-white text-sm rounded-lg font-medium"
                >
                  {t('common.delete')}
                </button>
              </div>
            </div>

            {groupImages.length === 0 ? (
              <p className="text-[rgba(0,45,88,0.55)] text-sm">{t('groups.noPhotos')}</p>
            ) : (
              <div className="grid grid-cols-4 gap-3">
                {groupImages.map(img => {
                  const url = archivePath
                    ? convertFileSrc(`${archivePath}/${img.file_path}`)
                    : '';
                  return (
                    <div
                      key={img.id}
                      className="bg-[#E8F3FB] rounded-lg overflow-hidden border border-[rgba(0,45,88,0.1)]"
                    >
                      {url && (
                        <div className="aspect-square bg-[#001A36] overflow-hidden">
                          <img
                            src={url}
                            alt={img.filename}
                            className="w-full h-full object-cover"
                            loading="lazy"
                          />
                        </div>
                      )}
                      <div className="p-2">
                        <p className="text-xs text-[#002D58] truncate font-medium">{img.filename}</p>
                        <p className="text-[10px] text-[rgba(0,45,88,0.45)] mt-0.5">
                          {img.taken_at
                            ? new Date(img.taken_at).toLocaleDateString()
                            : t('detail.noDate')}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-center h-full">
            <p className="text-[rgba(0,45,88,0.55)] text-sm">{t('groups.selectGroup')}</p>
          </div>
        )}
      </main>

      {/* Create modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-[#E8F3FB] p-6 rounded-xl w-96">
            <h3 className="text-lg font-medium text-[#002D58] mb-4">{t('groups.create')}</h3>

            {isSelectionMode && (
              <div className="mb-4 p-3 bg-[rgba(42,158,173,0.12)] rounded-lg">
                <p className="text-sm text-[#2A9EAD]">
                  {t('groups.selectedPhotosInfo', { count: getSelectedCount() })}
                </p>
              </div>
            )}

            <input
              type="text"
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreateGroup()}
              placeholder={t('groups.namePlaceholder')}
              className="w-full px-3 py-2 bg-[#F4F9FD] border border-[rgba(0,45,88,0.28)] rounded-lg text-sm text-[#002D58] mb-4"
              autoFocus
            />

            <div className="flex gap-3">
              <button
                onClick={handleCreateGroup}
                className="px-4 py-2 bg-[#0084C5] text-white rounded-lg text-sm font-medium"
              >
                {t('common.confirm')}
              </button>
              <button
                onClick={() => { setShowCreateModal(false); setNewGroupName(''); }}
                className="px-4 py-2 border border-[rgba(0,45,88,0.3)] text-[#002D58] rounded-lg text-sm"
              >
                {t('common.cancel')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
