import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { open } from '@tauri-apps/plugin-dialog';
import { invoke } from '@tauri-apps/api/core';
import { useAppConfigStore } from '../stores/appConfigStore';
import { useTimelineStore } from '../stores/timelineStore';

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
      <h1 className="text-[22px] font-medium text-[#002D58] mb-6">{t('settings.title')}</h1>

      <div className="space-y-6 max-w-md">
        {/* Archive Path */}
        <div>
          <label className="block text-sm font-medium text-[#002D58] mb-2">{t('settings.archivePath')}</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={config.archive_path}
              onChange={(e) => setConfig({ archive_path: e.target.value })}
              className="flex-1 px-3 py-2 bg-[#F4F9FD] border border-[rgba(0,45,88,0.28)] rounded-lg text-sm text-[#002D58]"
              placeholder="/path/to/archive"
            />
            <button
              onClick={selectArchiveFolder}
              className="px-3 py-2 bg-[#002D58] text-[#D2E8F7] rounded-lg text-sm font-medium"
            >
              {t('common.browse')}
            </button>
          </div>
        </div>

        {/* Language */}
        <div>
          <label className="block text-sm font-medium text-[#002D58] mb-2">{t('settings.language')}</label>
          <select
            value={config.language}
            onChange={(e) => {
              i18n.changeLanguage(e.target.value);
              setConfig({ language: e.target.value as 'en' | 'it' });
            }}
            className="w-full px-3 py-2 bg-[#F4F9FD] border border-[rgba(0,45,88,0.28)] rounded-lg text-sm text-[#002D58]"
          >
            <option value="en">English</option>
            <option value="it">Italiano</option>
          </select>
        </div>

        {/* Thumbnail Size */}
        <div>
          <label className="block text-sm font-medium text-[#002D58] mb-2">{t('settings.thumbnailSize')}</label>
          <select
            value={config.thumbnail_size}
            onChange={(e) => setConfig({ thumbnail_size: e.target.value as 'small' | 'medium' | 'large' })}
            className="w-full px-3 py-2 bg-[#F4F9FD] border border-[rgba(0,45,88,0.28)] rounded-lg text-sm text-[#002D58]"
          >
            <option value="small">{t('settings.sizeSmall')}</option>
            <option value="medium">{t('settings.sizeMedium')}</option>
            <option value="large">{t('settings.sizeLarge')}</option>
          </select>
        </div>

        {/* Archive Management */}
        <div className="border-t border-[rgba(0,45,88,0.15)] pt-6">
          <h3 className="text-sm font-medium text-[#002D58] mb-4">{t('settings.archiveManagement')}</h3>

          <button
            onClick={handleRescan}
            disabled={rescanLoading || !config.archive_path}
            className={`px-4 py-2 rounded-lg text-sm font-medium ${
              rescanLoading || !config.archive_path
                ? 'bg-[rgba(0,45,88,0.15)] text-[rgba(0,45,88,0.55)]'
                : 'bg-[#2A9EAD] text-white'
            }`}
          >
            {rescanLoading ? t('common.loading') : t('settings.rescanArchive')}
          </button>

          {rescanResult && (
            <p className={`mt-2 text-sm ${rescanResult.includes('Error') ? 'text-[#C0392B]' : 'text-[#2A9EAD]'}`}>
              {rescanResult}
            </p>
          )}
        </div>

        {/* Advanced Settings */}
        <div className="border-t border-[rgba(0,45,88,0.15)] pt-6">
          <h3 className="text-sm font-medium text-[#002D58] mb-4">{t('settings.advancedSettings')}</h3>

          <div className="space-y-4">
            <div>
              <label className="block text-xs text-[rgba(0,45,88,0.55)] mb-1">{t('settings.blockSize')}</label>
              <input
                type="number"
                value={config.block_size}
                onChange={(e) => setConfig({ block_size: parseInt(e.target.value) || 50 })}
                className="w-24 px-2 py-1 bg-[#F4F9FD] border border-[rgba(0,45,88,0.28)] rounded text-sm text-[#002D58]"
                min={10}
                max={200}
              />
              <p className="text-[10px] text-[rgba(0,45,88,0.45)] mt-1">{t('settings.blockSizeDesc')}</p>
            </div>

            <div>
              <label className="block text-xs text-[rgba(0,45,88,0.55)] mb-1">{t('settings.lastImportSource')}</label>
              <input
                type="text"
                value={config.last_import_source}
                readOnly
                className="w-full px-2 py-1 bg-[#F4F9FD] border border-[rgba(0,45,88,0.28)] rounded text-sm text-[rgba(0,45,88,0.55)] cursor-default"
                placeholder="—"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
