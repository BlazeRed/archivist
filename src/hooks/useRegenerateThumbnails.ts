import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { useAppConfigStore } from '../stores/appConfigStore';
import { useUIStore } from '../stores/uiStore';

type RegenerateThumbnailsResult = { regenerated: number; failed: number };

export function useRegenerateThumbnails() {
  const { t } = useTranslation();
  const { config } = useAppConfigStore();
  const bumpThumbnailCacheBust = useUIStore((s) => s.bumpThumbnailCacheBust);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });

  const handleRegenerate = async () => {
    if (!config.archive_path || isRegenerating) return;
    setIsRegenerating(true);
    setProgress({ current: 0, total: 0 });

    const unlisten = await listen<{ current: number; total: number }>(
      'regen_thumbnails_progress',
      (e) => setProgress((prev) => ({
        current: Math.max(prev.current, e.payload.current),
        total: e.payload.total,
      }))
    );

    try {
      const result = await invoke<RegenerateThumbnailsResult>('regenerate_thumbnails');
      toast.success(t('settings.regenThumbnailsDone', { count: result.regenerated }), {
        description: result.failed > 0
          ? t('settings.regenThumbnailsFailed', { count: result.failed })
          : undefined,
      });
      bumpThumbnailCacheBust();
    } catch (e) {
      toast.error(t('settings.regenThumbnailsError', { error: String(e) }));
    } finally {
      unlisten();
      setIsRegenerating(false);
    }
  };

  return { isRegenerating, progress, handleRegenerate };
}
