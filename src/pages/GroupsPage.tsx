import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/core';
import { convertFileSrc } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { toast } from 'sonner';
import { useGroupStore } from '../stores/dataStore';
import { useGroupUIStore } from '../stores/groupUIStore';
import { useAppConfigStore } from '../stores/appConfigStore';
import { AddPhotosModal } from '../components/AddPhotosModal';
import { ImageDetail } from '../components/ImageDetail';
import { useTimelineStore } from '../stores/timelineStore';
import type { Image } from '../types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

interface ExportResult {
  copied: number;
  errors: string[];
  dest_path: string;
}

export function GroupsPage() {
  const { t } = useTranslation();
  const { groups, fetchGroups, createGroup, updateGroup, deleteGroup } = useGroupStore();
  const { config, setConfig } = useAppConfigStore();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null);
  const [groupImages, setGroupImages] = useState<Image[]>([]);
  const [deletingGroupId, setDeletingGroupId] = useState<number | null>(null);
  const [showAddPhotos, setShowAddPhotos] = useState(false);
  const [editingGroupId, setEditingGroupId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState('');
  const [exportingGroupId, setExportingGroupId] = useState<number | null>(null);

  const { selectedImageIds, isSelectionMode, clearSelection, getSelectedCount } = useGroupUIStore();
  const { selectImage } = useTimelineStore();

  const thumbPx = config.thumbnail_size === 'small' ? 120 : config.thumbnail_size === 'large' ? 280 : 180;

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
      setExportingGroupId(groupId);
      try {
        const result = await invoke<ExportResult>('export_group', { groupId, destPath: dest });
        toast.success(t('groups.exportSuccess', { count: result.copied, path: result.dest_path }));
      } catch (e) {
        toast.error(t('groups.exportError'));
        console.error('Export failed:', e);
      } finally {
        setExportingGroupId(null);
      }
    }
  };

  const handleDeleteGroup = (id: number) => {
    setDeletingGroupId(id);
  };

  const handleConfirmDelete = async () => {
    if (deletingGroupId === null) return;
    await deleteGroup(deletingGroupId);
    if (selectedGroupId === deletingGroupId) {
      setSelectedGroupId(null);
      setGroupImages([]);
    }
    setDeletingGroupId(null);
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

  const handlePhotosAdded = async () => {
    setShowAddPhotos(false);
    if (selectedGroupId !== null) {
      await handleSelectGroup(selectedGroupId);
    }
    fetchGroups();
  };

  const handleStartEdit = (e: React.MouseEvent, group: { id: number; name: string }) => {
    e.stopPropagation();
    setEditingGroupId(group.id);
    setEditingName(group.name);
  };

  const handleConfirmEdit = async () => {
    if (editingGroupId === null || !editingName.trim()) return;
    await updateGroup(editingGroupId, editingName.trim());
    setEditingGroupId(null);
  };

  const handleCancelEdit = () => setEditingGroupId(null);

  const handleRemoveFromGroup = async (imageId: string) => {
    if (selectedGroupId === null) return;
    try {
      await invoke('remove_image_from_group', { imageId, groupId: selectedGroupId });
      setGroupImages(prev => prev.filter(img => img.id !== imageId));
      fetchGroups();
    } catch (e) {
      console.error('Failed to remove image from group:', e);
    }
  };

  if (!config.archive_path) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-52px)]">
        <div className="bg-card px-8 py-6 rounded-xl text-center max-w-sm">
          <p className="text-muted-foreground text-sm mb-4">{t('timeline.archiveNotSet')}</p>
          <Button onClick={handleOpenArchive}>{t('timeline.openArchive')}</Button>
        </div>
      </div>
    );
  }

  const archivePath = config.archive_path.replace(/\/+$/, '');
  const deletingGroup = groups.find(g => g.id === deletingGroupId);

  return (
    <div className="flex h-[calc(100vh-52px)]">
      {/* Sidebar */}
      <aside className="w-72 p-4 border-r border-border bg-card flex flex-col">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-medium text-foreground">{t('groups.title')}</h2>
          <Button size="icon-sm" onClick={() => setShowCreateModal(true)}>+</Button>
        </div>

        {groups.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('groups.noGroups')}</p>
        ) : (
          <div className="space-y-2 overflow-y-auto flex-1">
            {groups.map(group => (
              <div
                key={group.id}
                onClick={() => editingGroupId !== group.id && handleSelectGroup(group.id)}
                className={cn(
                  'group/item p-3 rounded-lg cursor-pointer transition-colors',
                  selectedGroupId === group.id
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted hover:bg-primary/10'
                )}
              >
                {editingGroupId === group.id ? (
                  <input
                    autoFocus
                    className="w-full text-sm font-medium bg-transparent border-b border-current outline-none"
                    value={editingName}
                    onChange={e => setEditingName(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') handleConfirmEdit();
                      if (e.key === 'Escape') handleCancelEdit();
                    }}
                    onBlur={handleConfirmEdit}
                    onClick={e => e.stopPropagation()}
                  />
                ) : (
                  <div className="flex items-center justify-between gap-1">
                    <p className="font-medium text-sm truncate">{group.name}</p>
                    <button
                      onClick={e => handleStartEdit(e, group)}
                      className={cn(
                        'flex-shrink-0 opacity-0 group-hover/item:opacity-100 transition-opacity p-0.5 rounded',
                        selectedGroupId === group.id ? 'hover:bg-primary-foreground/20' : 'hover:bg-primary/20'
                      )}
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth="1.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M11.5 2.5a2.121 2.121 0 013 3L5 15H2v-3L11.5 2.5z" />
                      </svg>
                    </button>
                  </div>
                )}
                <p className={cn('text-xs mt-0.5', selectedGroupId === group.id ? 'text-primary-foreground/70' : 'text-muted-foreground')}>
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
              <h1 className="text-[22px] font-medium text-foreground">
                {groups.find(g => g.id === selectedGroupId)?.name}
              </h1>
              <div className="flex gap-2">
                <Button size="sm" onClick={() => setShowAddPhotos(true)}>
                  {t('groups.addPhotosTitle')}
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => handleExportGroup(selectedGroupId)}
                  disabled={exportingGroupId === selectedGroupId}
                  className="flex items-center gap-1.5"
                >
                  {exportingGroupId === selectedGroupId && (
                    <svg className="animate-spin w-3.5 h-3.5" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                    </svg>
                  )}
                  {t('groups.export')}
                </Button>
                <Button size="sm" variant="destructive" onClick={() => handleDeleteGroup(selectedGroupId)}>
                  {t('common.delete')}
                </Button>
              </div>
            </div>

            {groupImages.length === 0 ? (
              <p className="text-muted-foreground text-sm">{t('groups.noPhotos')}</p>
            ) : (
              <div className="flex flex-wrap gap-3">
                {groupImages.map(img => {
                  const thumbnailUrl = archivePath && img.thumbnail_path
                    ? convertFileSrc(`${archivePath}/${img.thumbnail_path}`)
                    : '';
                  return (
                    <div
                      key={img.id}
                      style={{ width: thumbPx }}
                      onClick={() => selectImage(img)}
                      className="group relative bg-card rounded-lg overflow-hidden border border-border cursor-pointer"
                    >
                      <div className="aspect-square bg-[#001A36] overflow-hidden">
                        {thumbnailUrl ? (
                          <img
                            src={thumbnailUrl}
                            alt={img.filename}
                            className="w-full h-full object-cover"
                            loading="lazy"
                          />
                        ) : (
                          <div className="w-full h-full flex flex-col items-center justify-center gap-1 text-white/40">
                            <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                              <line x1="3" y1="3" x2="21" y2="21"/>
                              <circle cx="8.5" cy="8.5" r="1.5"/>
                            </svg>
                            <p className="text-[9px] text-center px-1 leading-tight">{t('common.noThumbnail')}</p>
                          </div>
                        )}
                      </div>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleRemoveFromGroup(img.id); }}
                        title={t('detail.removeFromGroup')}
                        className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-black/60 text-white text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive"
                      >
                        ×
                      </button>
                      <div className="p-2">
                        <p className="text-xs text-foreground truncate font-medium">{img.filename}</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
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
            <p className="text-muted-foreground text-sm">{t('groups.selectGroup')}</p>
          </div>
        )}
      </main>

      {/* Create group modal */}
      <Dialog open={showCreateModal} onOpenChange={(open) => { if (!open) { setShowCreateModal(false); setNewGroupName(''); } }}>
        <DialogContent className="w-96">
          <DialogHeader>
            <DialogTitle>{t('groups.create')}</DialogTitle>
          </DialogHeader>

          {isSelectionMode && (
            <div className="p-3 bg-accent/12 rounded-lg">
              <p className="text-sm text-accent">
                {t('groups.selectedPhotosInfo', { count: getSelectedCount() })}
              </p>
            </div>
          )}

          <Input
            type="text"
            value={newGroupName}
            onChange={(e) => setNewGroupName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreateGroup()}
            placeholder={t('groups.namePlaceholder')}
            autoFocus
          />

          <div className="flex gap-3 justify-end">
            <Button onClick={handleCreateGroup}>{t('common.confirm')}</Button>
            <Button variant="outline" onClick={() => { setShowCreateModal(false); setNewGroupName(''); }}>
              {t('common.cancel')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add photos modal */}
      {showAddPhotos && selectedGroupId !== null && (
        <AddPhotosModal
          groupId={selectedGroupId}
          onClose={() => setShowAddPhotos(false)}
          onAdded={handlePhotosAdded}
        />
      )}

      <ImageDetail />

      {/* Delete confirm modal */}
      <Dialog open={deletingGroupId !== null} onOpenChange={(open) => { if (!open) setDeletingGroupId(null); }}>
        <DialogContent className="w-96">
          <DialogHeader>
            <DialogTitle>{t('common.delete')} "{deletingGroup?.name}"</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">{t('groups.deleteConfirm')}</p>
          <div className="flex gap-3 justify-end">
            <Button variant="destructive" onClick={handleConfirmDelete}>{t('common.delete')}</Button>
            <Button variant="outline" onClick={() => setDeletingGroupId(null)}>{t('common.cancel')}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
