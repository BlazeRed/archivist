import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { invoke } from '@tauri-apps/api/core';
import { useAppConfigStore } from '../stores/appConfigStore';
import { useImportStore } from '../stores/importStore';
import { useTimelineStore } from '../stores/timelineStore';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

export function Topbar() {
  const { t, i18n } = useTranslation();
  const { config, setConfig } = useAppConfigStore();
  const navigate = useNavigate();
  const location = useLocation();
  const { phase } = useImportStore();
  const { fetchImages } = useTimelineStore();
  const [pendingPath, setPendingPath] = useState<string | null>(null);
  const [isRescanning, setIsRescanning] = useState(false);

  const isImportActive = phase === 'scanning' || phase === 'analyzing' || phase === 'importing';

  useEffect(() => {
    if (!isImportActive) return;
    let unlisten: (() => void) | undefined;
    getCurrentWindow().onCloseRequested(async (event) => {
      event.preventDefault();
      setPendingPath('__close__');
    }).then(fn => { unlisten = fn; });
    return () => { unlisten?.(); };
  }, [isImportActive]);

  const toggleLanguage = () => {
    const newLang = config.language === 'en' ? 'it' : 'en';
    i18n.changeLanguage(newLang);
    setConfig({ language: newLang });
  };

  const handleRescan = async () => {
    if (!config.archive_path || isRescanning) return;
    setIsRescanning(true);
    try {
      await invoke('rescan_archive');
      fetchImages();
    } catch {
      // silent — errors visible in Settings
    } finally {
      setIsRescanning(false);
    }
  };

  const handleNav = (to: string) => {
    if (isImportActive) {
      setPendingPath(to);
    } else {
      navigate(to);
    }
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
        ].map(({ to, label }) => {
          const isActive = to === '/' ? location.pathname === '/' : location.pathname.startsWith(to);
          return (
            <button
              key={to}
              onClick={() => handleNav(to)}
              className={cn(
                'px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
                isActive ? 'bg-primary/12 text-primary' : 'text-foreground hover:bg-foreground/8'
              )}
            >
              {label}
            </button>
          );
        })}
      </nav>

      <div className="flex items-center gap-2">
        {config.archive_path && (
          <button
            onClick={handleRescan}
            disabled={isRescanning || isImportActive}
            title={t('nav.rescan')}
            className="p-1.5 rounded-md text-foreground/60 hover:text-foreground hover:bg-foreground/8 transition-colors disabled:opacity-40"
          >
            <svg
              className={cn('w-4 h-4', isRescanning && 'animate-spin')}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        )}
        <Button variant="outline" size="sm" onClick={toggleLanguage}>
          {config.language.toUpperCase()}
        </Button>
      </div>

      <Dialog open={pendingPath !== null} onOpenChange={(open) => { if (!open) setPendingPath(null); }}>
        <DialogContent className="w-96">
          <DialogHeader>
            <DialogTitle>{t('import.navWarningTitle')}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">{t('import.navWarningBody')}</p>
          <div className="flex gap-3 justify-end">
            <Button
              onClick={async () => {
                const target = pendingPath;
                setPendingPath(null);
                if (target === '__close__') {
                  await getCurrentWindow().destroy();
                } else if (target) {
                  navigate(target);
                }
              }}
              variant="destructive"
              size="sm"
            >
              {t('import.navWarningLeave')}
            </Button>
            <Button onClick={() => setPendingPath(null)} variant="outline" size="sm">
              {t('common.cancel')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </header>
  );
}
