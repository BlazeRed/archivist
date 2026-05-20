import { invoke } from '@tauri-apps/api/core';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { useAppConfigStore } from '../stores/appConfigStore';
import { useImportStore } from '../stores/importStore';
import { useTimelineStore } from '../stores/timelineStore';
import { useUIStore } from '../stores/uiStore';

type RescanResult = {
  added: number;
  removed: number;
  repaired: number;
  moved: number;
  thumbnailed: number;
  folders_removed: number;
};

export function useRescan() {
  const { t } = useTranslation();
  const { config } = useAppConfigStore();
  const { isRescanning, setIsRescanning } = useUIStore();
  const phase = useImportStore((s) => s.phase);
  const fetchImages = useTimelineStore((s) => s.fetchImages);

  const isImportActive =
    phase === 'scanning' || phase === 'analyzing' ||
    phase === 'thumbnailing' || phase === 'importing';

  const handleRescan = async () => {
    if (!config.archive_path || isRescanning || isImportActive) return;
    setIsRescanning(true);
    try {
      const result = await invoke<RescanResult>('rescan_archive');
      let msg = t('settings.rescanFound', { count: result.added });
      if (result.removed > 0)         msg += ` · ${t('settings.rescanRemoved',        { count: result.removed })}`;
      if (result.repaired > 0)        msg += ` · ${t('settings.rescanRepaired',       { count: result.repaired })}`;
      if (result.moved > 0)           msg += ` · ${t('settings.rescanMoved',          { count: result.moved })}`;
      if (result.thumbnailed > 0)     msg += ` · ${t('settings.rescanThumbnailed',    { count: result.thumbnailed })}`;
      if (result.folders_removed > 0) msg += ` · ${t('settings.rescanFoldersRemoved', { count: result.folders_removed })}`;
      toast.success(t('settings.rescanArchive'), { description: msg });
      fetchImages();
    } catch (e) {
      toast.error(t('settings.rescanError', { error: String(e) }));
    } finally {
      setIsRescanning(false);
    }
  };

  return { isRescanning, handleRescan, isImportActive };
}
