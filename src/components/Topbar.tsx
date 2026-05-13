import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAppConfigStore } from '../stores/appConfigStore';

export function Topbar() {
  const { t, i18n } = useTranslation();
  const { config, setConfig } = useAppConfigStore();

  const toggleLanguage = () => {
    const newLang = config.language === 'en' ? 'it' : 'en';
    i18n.changeLanguage(newLang);
    setConfig({ language: newLang });
  };

  const toggleMode = () => {
    setConfig({ ui_mode: config.ui_mode === 'beginner' ? 'advanced' : 'beginner' });
  };

  return (
    <header className="h-[52px] bg-[#D2E8F7] border-b border-[rgba(0,45,88,0.15)] flex items-center justify-between px-4">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 bg-[#0084C5] rounded-lg flex items-center justify-center">
          <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
          </svg>
        </div>
        <span className="text-lg font-medium text-[#002D58]">{t('app.name')}</span>
      </div>

      <nav className="flex items-center gap-1">
        <NavLink
          to="/"
          className={({ isActive }) =>
            `px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              isActive
                ? 'bg-[rgba(0,132,197,0.12)] text-[#0084C5]'
                : 'text-[#002D58] hover:bg-[rgba(0,45,88,0.08)]'
            }`
          }
        >
          {t('nav.timeline')}
        </NavLink>
        <NavLink
          to="/groups"
          className={({ isActive }) =>
            `px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              isActive
                ? 'bg-[rgba(0,132,197,0.12)] text-[#0084C5]'
                : 'text-[#002D58] hover:bg-[rgba(0,45,88,0.08)]'
            }`
          }
        >
          {t('nav.groups')}
        </NavLink>
        <NavLink
          to="/import"
          className={({ isActive }) =>
            `px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              isActive
                ? 'bg-[rgba(0,132,197,0.12)] text-[#0084C5]'
                : 'text-[#002D58] hover:bg-[rgba(0,45,88,0.08)]'
            }`
          }
        >
          {t('nav.import')}
        </NavLink>
        <NavLink
          to="/settings"
          className={({ isActive }) =>
            `px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              isActive
                ? 'bg-[rgba(0,132,197,0.12)] text-[#0084C5]'
                : 'text-[#002D58] hover:bg-[rgba(0,45,88,0.08)]'
            }`
          }
        >
          {t('nav.settings')}
        </NavLink>
      </nav>

      <div className="flex items-center gap-3">
        <button
          onClick={toggleLanguage}
          className="px-2 py-1 text-xs font-medium text-[#002D58] border border-[rgba(0,45,88,0.28)] rounded-full bg-[#F4F9FD]"
        >
          {config.language.toUpperCase()}
        </button>

        <div className="flex items-center bg-[#F4F9FD] border border-[rgba(0,45,88,0.28)] rounded-[20px] p-0.5">
          <button
            onClick={toggleMode}
            className={`px-3 py-1 text-xs font-medium rounded-[18px] transition-colors ${
              config.ui_mode === 'beginner'
                ? 'bg-[#0084C5] text-white'
                : 'text-[rgba(0,45,88,0.5)]'
            }`}
          >
            {t('settings.beginner')}
          </button>
          <button
            onClick={toggleMode}
            className={`px-3 py-1 text-xs font-medium rounded-[18px] transition-colors ${
              config.ui_mode === 'advanced'
                ? 'bg-[#0084C5] text-white'
                : 'text-[rgba(0,45,88,0.5)]'
            }`}
          >
            {t('settings.advanced')}
          </button>
        </div>
      </div>
    </header>
  );
}