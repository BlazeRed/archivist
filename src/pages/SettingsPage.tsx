import { useState, useEffect } from 'react';
import { flushSync } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { open } from '@tauri-apps/plugin-dialog';
import { invoke } from '@tauri-apps/api/core';
import { getVersion } from '@tauri-apps/api/app';
import { useAppConfigStore } from '../stores/appConfigStore';
import { useTimelineStore } from '../stores/timelineStore';
import { useImageStore, useGroupStore } from '../stores/dataStore';
import { useImportStore } from '../stores/importStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

export function SettingsPage() {
  const { t, i18n } = useTranslation();
  const { config, setConfig } = useAppConfigStore();
  const { fetchImages } = useTimelineStore();
  const clearImages = useImageStore((s) => s.clearImages);
  const clearGroups = useGroupStore((s) => s.clearGroups);
  const phase = useImportStore((s) => s.phase);
  const isImportActive = phase === 'scanning' || phase === 'analyzing' || phase === 'thumbnailing' || phase === 'importing';
  const [rescanLoading, setRescanLoading] = useState(false);
  const [rescanResult, setRescanResult] = useState<string | null>(null);
  const [appVersion, setAppVersion] = useState<string>('');
  const [showImportWarning, setShowImportWarning] = useState(false);

  useEffect(() => {
    getVersion().then(setAppVersion).catch(() => {});
  }, []);

  const selectArchiveFolder = async () => {
    if (isImportActive) { setShowImportWarning(true); return; }
    const selected = await open({ directory: true, title: 'Select archive folder' });
    if (selected) {
      setConfig({ archive_path: selected as string });
      try {
        await invoke('init_archive', { archivePath: selected });
      } catch (e) {
        console.error('Failed to init archive:', e);
      }
    }
  };

  const handleCloseArchive = () => {
    if (isImportActive) { setShowImportWarning(true); return; }
    clearImages();
    clearGroups();
    setConfig({ archive_path: '' });
  };

  const handleRescan = async () => {
    if (isImportActive) { setShowImportWarning(true); return; }
    if (!config.archive_path) return;
    flushSync(() => {
      setRescanLoading(true);
      setRescanResult(null);
    });
    try {
      const result = await invoke<{ added: number; removed: number; repaired: number; moved: number; thumbnailed: number }>('rescan_archive');
      let msg = t('settings.rescanFound', { count: result.added });
      if (result.removed > 0) msg += ` · ${t('settings.rescanRemoved', { count: result.removed })}`;
      if (result.repaired > 0) msg += ` · ${t('settings.rescanRepaired', { count: result.repaired })}`;
      if (result.moved > 0) msg += ` · ${t('settings.rescanMoved', { count: result.moved })}`;
      if (result.thumbnailed > 0) msg += ` · ${t('settings.rescanThumbnailed', { count: result.thumbnailed })}`;
      setRescanResult(msg);
      fetchImages();
    } catch (e) {
      setRescanResult(t('settings.rescanError', { error: String(e) }));
    } finally {
      setRescanLoading(false);
    }
  };

  return (
    <div className="relative p-6 h-[calc(100vh-52px)]">
      <h1 className="text-[22px] font-medium text-foreground mb-6">{t('settings.title')}</h1>

      <div className="space-y-6 max-w-md">
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
            <Button variant="secondary" onClick={selectArchiveFolder}>
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

        {/* Archive Management */}
        <div className="border-t border-border pt-6">
          <h3 className="text-sm font-medium text-foreground mb-4">{t('settings.archiveManagement')}</h3>

          <div className="flex items-start gap-3 flex-wrap">
            <Button
              onClick={handleRescan}
              disabled={rescanLoading || !config.archive_path}
              variant="secondary"
              className="gap-2"
            >
              {rescanLoading && (
                <svg className="animate-spin size-4" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                </svg>
              )}
              {rescanLoading ? t('common.loading') : t('settings.rescanArchive')}
            </Button>

            {config.archive_path && (
              <div>
                <Button
                  onClick={handleCloseArchive}
                  variant="destructive"
                >
                  {t('settings.closeArchive')}
                </Button>
                <p className="mt-1 text-[11px] text-muted-foreground">{t('settings.closeArchiveDesc')}</p>
              </div>
            )}
          </div>

          {rescanResult && (
            <p className={`mt-2 text-sm ${rescanResult.includes('Error') ? 'text-destructive' : 'text-accent'}`}>
              {rescanResult}
            </p>
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
    </div>
  );
}
