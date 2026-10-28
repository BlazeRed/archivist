import { invoke } from '@tauri-apps/api/core';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { useTimelineStore } from '../stores/timelineStore';
import { useMapStore } from '../stores/mapStore';
import { useUIStore } from '../stores/uiStore';

export type MoveResult = { moved: number; failed: number };

/** Everything that lists live images must drop/regain moved items */
export function refreshAfterMove() {
  const timeline = useTimelineStore.getState();
  timeline.fetchImages();
  timeline.fetchGroups();
  useMapStore.getState().fetchLocations();
  useUIStore.getState().refreshTrashCount();
}

/** Moves items to the archive's Trash folder. No confirm dialog: the toast offers Undo. */
export function useTrashImages() {
  const { t } = useTranslation();

  const restore = async (ids: string[]) => {
    try {
      await invoke<MoveResult>('restore_images', { imageIds: ids });
    } catch (e) {
      console.error('Failed to restore:', e);
      toast.error(t('trash.restoreError'));
    }
    refreshAfterMove();
  };

  return async (ids: string[]) => {
    if (ids.length === 0) return;
    try {
      const result = await invoke<MoveResult>('trash_images', { imageIds: ids });
      if (result.moved > 0) {
        toast.success(t('trash.moved', { count: result.moved }), {
          action: { label: t('trash.undo'), onClick: () => restore(ids) },
        });
      }
      if (result.failed > 0) toast.error(t('trash.moveFailed', { count: result.failed }));
    } catch (e) {
      console.error('Failed to trash:', e);
      toast.error(t('trash.moveFailed', { count: ids.length }));
    }
    refreshAfterMove();
  };
}
