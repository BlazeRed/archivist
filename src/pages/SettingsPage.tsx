import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { open } from '@tauri-apps/plugin-dialog';
import { invoke } from '@tauri-apps/api/core';
import { getVersion } from '@tauri-apps/api/app';
import { useAppConfigStore } from '../stores/appConfigStore';
import { useTimelineStore } from '../stores/timelineStore';
import { useGroupStore } from '../stores/dataStore';
import { useMapStore } from '../stores/mapStore';
import { useImportStore } from '../stores/importStore';
import { useRescan } from '../hooks/useRescan';
import { useRegenerateThumbnails } from '../hooks/useRegenerateThumbnails';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ProgressBar } from '@/components/ProgressBar';

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
    const selected = await open({ directory: true, title: t('settings.selectArchiveFolder') });
    if (selected) {
      clearImages();
      selectImage(null);
      clearGroups();
      clearLocations();
      try {
        await invoke('init_archive', { archivePath: selected });
      } catch (e) {
        console.error('Failed to init archive:', e);
      }
      setConfig({ archive_path: selected as string });
    }
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
    <div className="relative p-6 h-full overflow-y-auto">
      <h1 className="text-[22px] font-medium text-foreground mb-6">{t('settings.title')}</h1>

      <div className="space-y-6">
        {/* Archive Path */}
        <div className="space-y-2">
          <Label>{t('settings.archivePath')}</Label>
          <div className="flex gap-2">
            <Input
              type="text"
              value={config.archive_path}
              onChange={(e) => setConfig({ archive_path: e.target.value })}
              placeholder="/path/to/archive"
              className="flex-1"
            />
            <Button variant="default" onClick={selectArchiveFolder}>
              {t('common.browse')}
            </Button>
          </div>
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
                variant="default"
                className="gap-2 w-full"
              >
                {isRescanning && (
                  <svg className="animate-spin size-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                )}
                {isRescanning ? t('common.loading') : t('settings.rescanArchive')}
              </Button>
              <p className="mt-1 text-[11px] text-muted-foreground">{t('settings.rescanArchiveDesc')}</p>
            </div>

            <div>
              <Button
                onClick={() => setShowRegenConfirm(true)}
                disabled={isRegenerating || isImportActive || isRescanning || !config.archive_path}
                variant="default"
                className="gap-2 w-full"
              >
                {isRegenerating ? t('common.loading') : t('settings.regenerateThumbnails')}
              </Button>
              <p className="mt-1 text-[11px] text-muted-foreground">{t('settings.regenerateThumbnailsDesc')}</p>
            </div>

            {config.archive_path && (
              <div>
                <Button
                  onClick={handleCloseArchive}
                  variant="destructive"
                  className="w-full"
                >
                  {t('settings.closeArchive')}
                </Button>
                <p className="mt-1 text-[11px] text-muted-foreground">{t('settings.closeArchiveDesc')}</p>
              </div>
            )}
          </div>

          {isRegenerating && (
            <div className="mt-4 max-w-md">
              <ProgressBar current={regenProgress.current} total={regenProgress.total} currentFile="" phase="thumbnailing" />
            </div>
          )}

        </div>

      </div>

      {appVersion && (
        <p className="absolute bottom-4 right-6 text-xs text-muted-foreground select-none">
          v{appVersion}
        </p>
      )}

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
