import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAppConfigStore } from '../stores/appConfigStore';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export function Topbar() {
  const { t, i18n } = useTranslation();
  const { config, setConfig } = useAppConfigStore();

  const toggleLanguage = () => {
    const newLang = config.language === 'en' ? 'it' : 'en';
    i18n.changeLanguage(newLang);
    setConfig({ language: newLang });
  };

  return (
    <header className="h-[52px] bg-background border-b border-border flex items-center justify-between px-4">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
          <svg className="w-5 h-5 text-primary-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"
            />
          </svg>
        </div>
        <span className="text-lg font-medium text-foreground">{t('app.name')}</span>
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
              cn(
                'px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
                isActive
                  ? 'bg-primary/12 text-primary'
                  : 'text-foreground hover:bg-foreground/8'
              )
            }
          >
            {label}
          </NavLink>
        ))}
      </nav>

      <Button variant="outline" size="sm" onClick={toggleLanguage}>
        {config.language.toUpperCase()}
      </Button>
    </header>
  );
}
