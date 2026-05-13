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

  return (
    <header className="h-[52px] bg-[#D2E8F7] border-b border-[rgba(0,45,88,0.15)] flex items-center justify-between px-4">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 bg-[#0084C5] rounded-lg flex items-center justify-center">
          <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"
            />
          </svg>
        </div>
        <span className="text-lg font-medium text-[#002D58]">{t('app.name')}</span>
      </div>

      <nav className="flex items-center gap-1">
        {[
          { to: '/', label: t('nav.timeline') },
          { to: '/groups', label: t('nav.groups') },
          { to: '/import', label: t('nav.import') },
          { to: '/settings', label: t('nav.settings') },
        ].map(({ to, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-[rgba(0,132,197,0.12)] text-[#0084C5]'
                  : 'text-[#002D58] hover:bg-[rgba(0,45,88,0.08)]'
              }`
            }
          >
            {label}
          </NavLink>
        ))}
      </nav>

      <button
        onClick={toggleLanguage}
        className="px-2 py-1 text-xs font-medium text-[#002D58] border border-[rgba(0,45,88,0.28)] rounded-full bg-[#F4F9FD]"
      >
        {config.language.toUpperCase()}
      </button>
    </header>
  );
}
