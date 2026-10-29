import { invoke } from '@tauri-apps/api/core';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { useAppConfigStore } from '../stores/appConfigStore';
import { useImportStore } from '../stores/importStore';
import { useTimelineStore } from '../stores/timelineStore';
import { useMapStore } from '../stores/mapStore';
import { useUIStore } from '../stores/uiStore';

type MissingImage = { id: string; filename: string };

type RescanResult = {
  added: number;
  missing: MissingImage[];
  repaired: number;
  moved: number;
  relinked: number;
  thumbnailed: number;
  folders_removed: number;
  gps_repaired: number;
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
      if (result.repaired > 0)        msg += ` · ${t('settings.rescanRepaired',       { count: result.repaired })}`;
      if (result.moved > 0)           msg += ` · ${t('settings.rescanMoved',          { count: result.moved })}`;
      if (result.relinked > 0)        msg += ` · ${t('settings.rescanRelinked',       { count: result.relinked })}`;
      if (result.thumbnailed > 0)     msg += ` · ${t('settings.rescanThumbnailed',    { count: result.thumbnailed })}`;
      if (result.folders_removed > 0) msg += ` · ${t('settings.rescanFoldersRemoved', { count: result.folders_removed })}`;
      if (result.gps_repaired > 0)    msg += ` · ${t('settings.rescanGpsRepaired',    { count: result.gps_repaired })}`;
      toast.success(t('settings.rescanArchive'), { description: msg });
      fetchImages();
      useMapStore.getState().fetchLocations();

      if (result.missing.length > 0) {
        const missingIds = result.missing.map((m) => m.id);
        toast.warning(t('settings.rescanMissingTitle', { count: missingIds.length }), {
          description: t('settings.rescanMissingDesc'),
          duration: Infinity,
          // Persistent: needs its own way out. Ignore first, then the destructive action (red: it deletes DB records)
          cancel: { label: t('settings.rescanMissingDismiss'), onClick: () => {} },
          classNames: { actionButton: 'ml-1.5! bg-destructive! text-destructive-foreground!' },
          action: {
            label: t('settings.rescanMissingConfirm'),
            onClick: async () => {
              try {
                await invoke('remove_missing_images', { ids: missingIds });
                fetchImages();
                toast.success(t('settings.rescanMissingRemoved', { count: missingIds.length }));
              } catch (e) {
                toast.error(t('settings.rescanError', { error: String(e) }));
              }
            },
          },
        });
      }
    } catch (e) {
      toast.error(t('settings.rescanError', { error: String(e) }));
    } finally {
      setIsRescanning(false);
    }
  };

  return { isRescanning, handleRescan, isImportActive };
}
