import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { useTimelineStore } from '../stores/timelineStore';
import { useAppConfigStore } from '../stores/appConfigStore';
import { useGroupStore } from '../stores/dataStore';
import { useMapStore } from '../stores/mapStore';
import { Button } from '@/components/ui/button';

/** Empty page shown while no archive is set (Favourites, Groups, Trash): message + Open archive. */
export function ArchiveNotSet() {
  const { t } = useTranslation();
  const setConfig = useAppConfigStore((s) => s.setConfig);

  const handleOpenArchive = async () => {
    const selected = await open({ directory: true });
    if (!selected) return;
    const { clearImages, selectImage } = useTimelineStore.getState();
    clearImages();
    selectImage(null);
    useGroupStore.getState().clearGroups();
    useMapStore.getState().clearLocations();
    try {
      await invoke('init_archive', { archivePath: selected });
    } catch (e) {
      console.error('Failed to init archive:', e);
    }
    setConfig({ archive_path: selected as string });
  };

  return (
    <div className="flex items-center justify-center h-[calc(100vh-var(--topbar-offset))]">
      <div className="squircle bg-card px-8 py-6 rounded-xl text-center max-w-sm">
        <p className="text-muted-foreground text-sm mb-4">{t('timeline.archiveNotSet')}</p>
        <Button onClick={handleOpenArchive}>{t('timeline.openArchive')}</Button>
      </div>
    </div>
  );
}
