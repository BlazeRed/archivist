import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { toast } from 'sonner';
import i18n from '@/i18n';
import { useTimelineStore } from '@/stores/timelineStore';
import { useAppConfigStore } from '@/stores/appConfigStore';
import { useGroupStore } from '@/stores/dataStore';
import { useMapStore } from '@/stores/mapStore';

/**
 * Opens `path` as the archive. Only once the backend has opened it are the stores
 * cleared and the config switched: on failure (e.g. read-only folder) the user is told
 * why and the current archive stays as it was, instead of a UI pointing at an archive
 * the backend never opened.
 */
export async function openArchive(path: string): Promise<boolean> {
  try {
    await invoke('init_archive', { archivePath: path });
  } catch (e) {
    console.error('Failed to init archive:', e);
    toast.error(i18n.t('settings.archiveOpenError'), { description: String(e) });
    return false;
  }
  const { clearImages, selectImage } = useTimelineStore.getState();
  clearImages();
  selectImage(null);
  useGroupStore.getState().clearGroups();
  useMapStore.getState().clearLocations();
  useAppConfigStore.getState().setConfig({ archive_path: path });
  return true;
}

/** Folder picker, then `openArchive` on the chosen folder. */
export async function pickAndOpenArchive(title?: string): Promise<void> {
  const selected = await open({ directory: true, title });
  if (typeof selected === 'string') await openArchive(selected);
}
