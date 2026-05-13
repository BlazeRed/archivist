import { useTranslation } from 'react-i18next';
import { useAppConfigStore } from '../stores/appConfigStore';

export function SettingsPage() {
  const { t, i18n } = useTranslation();
  const { config, setConfig } = useAppConfigStore();

  return (
    <div className="p-6">
      <h1 className="text-[22px] font-medium text-[#002D58] mb-6">{t('settings.title')}</h1>
      
      <div className="space-y-6 max-w-md">
        <div>
          <label className="block text-sm font-medium text-[#002D58] mb-2">{t('settings.archivePath')}</label>
          <input
            type="text"
            value={config.archive_path}
            onChange={(e) => setConfig({ archive_path: e.target.value })}
            className="w-full px-3 py-2 bg-[#F4F9FD] border border-[rgba(0,45,88,0.28)] rounded-lg text-sm text-[#002D58]"
            placeholder="/path/to/archive"
          />
        </div>

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

        <div>
          <label className="block text-sm font-medium text-[#002D58] mb-2">{t('settings.thumbnailSize')}</label>
          <select
            value={config.thumbnail_size}
            onChange={(e) => setConfig({ thumbnail_size: e.target.value as 'small' | 'medium' | 'large' })}
            className="w-full px-3 py-2 bg-[#F4F9FD] border border-[rgba(0,45,88,0.28)] rounded-lg text-sm text-[#002D58]"
          >
            <option value="small">Small</option>
            <option value="medium">Medium</option>
            <option value="large">Large</option>
          </select>
        </div>
      </div>
    </div>
  );
}