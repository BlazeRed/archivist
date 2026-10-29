import { useState, useEffect } from 'react';
import { LoaderCircleIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { pickAndOpenArchive } from '@/lib/openArchive';
import { getVersion } from '@tauri-apps/api/app';
import { useAppConfigStore } from '../stores/appConfigStore';
import { useTimelineStore } from '../stores/timelineStore';
import { useGroupStore } from '../stores/dataStore';
import { useMapStore } from '../stores/mapStore';
import { useImportStore } from '../stores/importStore';
import { useRescan } from '../hooks/useRescan';
import { useRegenerateThumbnails } from '../hooks/useRegenerateThumbnails';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ProgressBar } from '@/components/ProgressBar';
import { PathField } from '@/components/PathField';

export function SettingsPage() {
  const { t, i18n } = useTranslation();
  const { config, setConfig } = useAppConfigStore();
  const { clearImages, selectImage } = useTimelineStore();
  const clearGroups = useGroupStore((s) => s.clearGroups);
  const clearLocations = useMapStore((s) => s.clearLocations);
  const phase = useImportStore((s) => s.phase);
  const isImportActive = phase === 'scanning' || phase === 'analyzing' || phase === 'thumbnailing' || phase === 'importing';
  const { isRescanning, handleRescan } = useRescan();
  const { isRegenerating, progress: regenProgress, handleRegenerate } = useRegenerateThumbnails();
  const [appVersion, setAppVersion] = useState<string>('');
  const [showImportWarning, setShowImportWarning] = useState(false);
  const [showRegenConfirm, setShowRegenConfirm] = useState(false);

  useEffect(() => {
    getVersion().then(setAppVersion).catch(() => {});
  }, []);

  const selectArchiveFolder = async () => {
    if (isImportActive) { setShowImportWarning(true); return; }
    await pickAndOpenArchive(t('settings.selectArchiveFolder'));
  };

  const handleCloseArchive = () => {
    if (isImportActive) { setShowImportWarning(true); return; }
    clearImages();
    selectImage(null);
    clearGroups();
    clearLocations();
    setConfig({ archive_path: '' });
  };

  return (
    // Scrollbar track kept clear of the panel's rounded corners
    <div className="scroll-inset relative p-5 h-full overflow-y-auto [--scroll-inset-top:20px] [--scroll-inset-bottom:20px]">
      <div className="flex items-baseline justify-between gap-2 mb-6">
        <h1 className="text-[22px] font-medium text-foreground">{t('settings.title')}</h1>
        {appVersion && (
          <span className="text-xs text-muted-foreground tabular-nums select-none">v{appVersion}</span>
        )}
      </div>

      <div className="space-y-6">
        {/* Archive Path */}
        <div className="space-y-2">
          <Label>{t('settings.archivePath')}</Label>
          <PathField
            path={config.archive_path}
            placeholder={t('settings.noArchive')}
            actionLabel={config.archive_path ? t('common.change') : t('common.browse')}
            onAction={selectArchiveFolder}
          />
        </div>

        {/* Language */}
        <div className="space-y-2">
          <Label>{t('settings.language')}</Label>
          <Select
            value={config.language}
            onValueChange={(v) => {
              i18n.changeLanguage(v);
              setConfig({ language: v as 'en' | 'it' });
            }}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="en">English</SelectItem>
              <SelectItem value="it">Italiano</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Theme */}
        <div className="space-y-2">
          <Label>{t('settings.theme')}</Label>
          <ToggleGroup
            type="single"
            variant="segmented"
            spacing={0.5}
            value={config.theme}
            onValueChange={(v) => { if (v) setConfig({ theme: v as typeof config.theme }); }}
            className="w-full bg-muted rounded-full p-[3px]"
          >
            {(['system', 'light', 'dark'] as const).map(v => (
              <ToggleGroupItem key={v} value={v} className="flex-1 text-xs">
                {t(`settings.theme${v.charAt(0).toUpperCase() + v.slice(1)}`)}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>

        {/* Thumbnail Size */}
        <div className="space-y-2">
          <Label>{t('settings.thumbnailSize')}</Label>
          <Select
            value={config.thumbnail_size}
            onValueChange={(v) => setConfig({ thumbnail_size: v as 'small' | 'medium' | 'large' })}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="small">{t('settings.sizeSmall')}</SelectItem>
              <SelectItem value="medium">{t('settings.sizeMedium')}</SelectItem>
              <SelectItem value="large">{t('settings.sizeLarge')}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Group Cover Size */}
        <div className="space-y-2">
          <Label>{t('settings.groupCoverSize')}</Label>
          <Select
            value={config.group_cover_size}
            onValueChange={(v) => setConfig({ group_cover_size: v as 'small' | 'medium' | 'large' })}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="small">{t('settings.coverSizeSmall')}</SelectItem>
              <SelectItem value="medium">{t('settings.coverSizeMedium')}</SelectItem>
              <SelectItem value="large">{t('settings.coverSizeLarge')}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Archive Management */}
        <div className="border-t border-border pt-6">
          <h3 className="text-sm font-medium text-foreground mb-4">{t('settings.archiveManagement')}</h3>

          <div className="flex flex-col gap-3">
            <div>
              <Button
                onClick={handleRescan}
                disabled={isRescanning || isImportActive || !config.archive_path}
                variant="secondary"
                className="gap-2 w-full"
              >
                {isRescanning && (
                  <LoaderCircleIcon className="animate-spin size-4" />
                )}
                {isRescanning ? t('common.loading') : t('settings.rescanArchive')}
              </Button>
              <p className="mt-1 text-[11px] text-muted-foreground">{t('settings.rescanArchiveDesc')}</p>
            </div>

            <Button
              onClick={() => setShowRegenConfirm(true)}
              disabled={isRegenerating || isImportActive || isRescanning || !config.archive_path}
              variant="secondary"
              className="gap-2 w-full"
            >
              {isRegenerating ? t('common.loading') : t('settings.regenerateThumbnails')}
            </Button>

            {/* Not destructive: only disconnects, no file or DB record is touched */}
            {config.archive_path && (
              <Button onClick={handleCloseArchive} variant="outline" className="w-full">
                {t('settings.closeArchive')}
              </Button>
            )}
          </div>

          {isRegenerating && (
            <div className="mt-4 max-w-md">
              <ProgressBar current={regenProgress.current} total={regenProgress.total} currentFile="" phase="thumbnailing" />
            </div>
          )}

        </div>

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

      <Dialog open={showRegenConfirm} onOpenChange={(open) => { if (!open) setShowRegenConfirm(false); }}>
        <DialogContent className="w-96">
          <DialogHeader>
            <DialogTitle>{t('settings.regenConfirmTitle')}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">{t('settings.regenConfirmBody')}</p>
          <div className="flex justify-end gap-2">
            <Button onClick={() => setShowRegenConfirm(false)} variant="outline" size="sm">
              {t('common.cancel')}
            </Button>
            <Button
              onClick={() => { setShowRegenConfirm(false); handleRegenerate(); }}
              variant="default"
              size="sm"
            >
              {t('settings.regenerateThumbnails')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
