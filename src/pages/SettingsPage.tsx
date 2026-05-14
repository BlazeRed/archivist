import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { open } from '@tauri-apps/plugin-dialog';
import { invoke } from '@tauri-apps/api/core';
import { useAppConfigStore } from '../stores/appConfigStore';
import { useTimelineStore } from '../stores/timelineStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export function SettingsPage() {
  const { t, i18n } = useTranslation();
  const { config, setConfig } = useAppConfigStore();
  const { fetchImages } = useTimelineStore();
  const [rescanLoading, setRescanLoading] = useState(false);
  const [rescanResult, setRescanResult] = useState<string | null>(null);

  const selectArchiveFolder = async () => {
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

  const handleRescan = async () => {
    if (!config.archive_path) return;

    setRescanLoading(true);
    setRescanResult(null);

    try {
      const count = await invoke<number>('rescan_archive');
      setRescanResult(t('settings.rescanFound', { count }));
      fetchImages();
    } catch (e) {
      setRescanResult(t('settings.rescanError', { error: String(e) }));
    }

    setRescanLoading(false);
  };

  return (
    <div className="p-6">
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

          <Button
            onClick={handleRescan}
            disabled={rescanLoading || !config.archive_path}
            variant="secondary"
          >
            {rescanLoading ? t('common.loading') : t('settings.rescanArchive')}
          </Button>

          {rescanResult && (
            <p className={`mt-2 text-sm ${rescanResult.includes('Error') ? 'text-destructive' : 'text-accent'}`}>
              {rescanResult}
            </p>
          )}
        </div>

        {/* Advanced Settings */}
        <div className="border-t border-border pt-6">
          <h3 className="text-sm font-medium text-foreground mb-4">{t('settings.advancedSettings')}</h3>

          <div className="space-y-4">
            <div>
              <Label className="text-xs text-muted-foreground mb-1">{t('settings.blockSize')}</Label>
              <Input
                type="number"
                value={config.block_size}
                onChange={(e) => setConfig({ block_size: parseInt(e.target.value) || 50 })}
                className="w-24"
                min={10}
                max={200}
              />
              <p className="text-[10px] text-muted-foreground mt-1">{t('settings.blockSizeDesc')}</p>
            </div>

            <div>
              <Label className="text-xs text-muted-foreground mb-1">{t('settings.lastImportSource')}</Label>
              <Input
                type="text"
                value={config.last_import_source}
                readOnly
                className="w-full cursor-default"
                placeholder="—"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
