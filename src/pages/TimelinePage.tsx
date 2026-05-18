import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { useTimelineStore } from '../stores/timelineStore';
import { useAppConfigStore } from '../stores/appConfigStore';
import { useGroupUIStore } from '../stores/groupUIStore';
import { useImportStore } from '../stores/importStore';
import { FilterPanel } from '../components/FilterPanel';
import { ThumbnailGrid } from '../components/ThumbnailGrid';
import { ImageDetail } from '../components/ImageDetail';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

export function TimelinePage() {
  const { t } = useTranslation();
  const { fetchImages, availableGroups, fetchGroups } = useTimelineStore();
  const { config, setConfig } = useAppConfigStore();
  const { isSelectionMode, selectedImageIds, clearSelection, getSelectedCount } = useGroupUIStore();
  const phase = useImportStore((s) => s.phase);
  const isImportActive = phase === 'scanning' || phase === 'analyzing' || phase === 'thumbnailing' || phase === 'importing';

  const [addToGroupId, setAddToGroupId] = useState<string>('');
  const [addingToGroup, setAddingToGroup] = useState(false);
  const [showImportWarning, setShowImportWarning] = useState(false);

  const handleOpenArchive = async () => {
    if (isImportActive) { setShowImportWarning(true); return; }
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
        <div className="bg-card px-8 py-6 rounded-xl text-center max-w-sm">
          <p className="text-muted-foreground text-sm mb-4">{t('timeline.archiveNotSet')}</p>
          <Button onClick={handleOpenArchive}>{t('timeline.openArchive')}</Button>
        </div>
        <Dialog open={showImportWarning} onOpenChange={(open) => { if (!open) setShowImportWarning(false); }}>
          <DialogContent className="w-96">
            <DialogHeader>
              <DialogTitle>{t('import.navWarningTitle')}</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">{t('import.navWarningBody')}</p>
            <div className="flex justify-end">
              <Button onClick={() => setShowImportWarning(false)} variant="outline" size="sm">
                {t('common.cancel')}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-52px)] relative">
      {/* Sidebar */}
      <aside className="w-56 flex-shrink-0 p-4 border-r border-border bg-card overflow-y-auto">
        <FilterPanel />
      </aside>

      {/* Main content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <div className="flex-1 min-h-0">
          <ThumbnailGrid />
        </div>

        {/* Selection action bar */}
        {isSelectionMode && (
          <div className="flex-shrink-0 h-14 bg-foreground flex items-center px-6 gap-4 shadow-lg">
            <span className="text-background text-sm font-medium">
              {t('timeline.selected', { count: getSelectedCount() })}
            </span>

            {availableGroups.length > 0 && (
              <div className="flex items-center gap-2 ml-auto">
                <Select value={addToGroupId} onValueChange={setAddToGroupId}>
                  <SelectTrigger className="w-48 bg-white/12 border-white/25 text-white">
                    <SelectValue placeholder={`${t('timeline.filterGroups')}…`} />
                  </SelectTrigger>
                  <SelectContent>
                    {availableGroups.map(g => (
                      <SelectItem key={g.id} value={g.id.toString()}>{g.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  onClick={handleAddToGroup}
                  disabled={!addToGroupId || addingToGroup || getSelectedCount() === 0}
                >
                  {t('timeline.addToGroup')}
                </Button>
              </div>
            )}

            <Button
              variant="outline"
              onClick={clearSelection}
              className="border-white/30 text-background hover:text-foreground"
            >
              {t('timeline.cancelSelection')}
            </Button>
          </div>
        )}
      </main>

      {/* Image detail modal */}
      <ImageDetail />
    </div>
  );
}
