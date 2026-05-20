import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { useAppConfigStore } from '../stores/appConfigStore';
import { useImportStore } from '../stores/importStore';
import { useTimelineStore } from '../stores/timelineStore';
import { useGroupStore } from '../stores/dataStore';
import { useUIStore } from '../stores/uiStore';
import { useRescan } from '../hooks/useRescan';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

export function Topbar() {
  const { t } = useTranslation();
  const { config, setConfig } = useAppConfigStore();
  const navigate = useNavigate();
  const location = useLocation();
  const { phase } = useImportStore();
  const { clearImages, selectImage } = useTimelineStore();
  const clearGroups = useGroupStore((s) => s.clearGroups);
  const { settingsOpen, toggleSettings } = useUIStore();
  const { isRescanning, handleRescan } = useRescan();
  const [pendingPath, setPendingPath] = useState<string | null>(null);

  const isImportActive = phase === 'scanning' || phase === 'analyzing' || phase === 'thumbnailing' || phase === 'importing';

  useEffect(() => {
    if (!isImportActive) return;
    let unlisten: (() => void) | undefined;
    getCurrentWindow().onCloseRequested(async (event) => {
      event.preventDefault();
      setPendingPath('__close__');
    }).then(fn => { unlisten = fn; });
    return () => { unlisten?.(); };
  }, [isImportActive]);

  const handleOpenArchive = async () => {
    const selected = await open({ directory: true });
    if (selected) {
      clearImages();
      selectImage(null);
      clearGroups();
      try { await invoke('init_archive', { archivePath: selected }); } catch {}
      setConfig({ archive_path: selected as string });
    }
  };

  const handleNav = (to: string) => navigate(to);
  const isActive = (to: string) => to === '/' ? location.pathname === '/' : location.pathname.startsWith(to);

  return (
    <header className="h-[52px] bg-background border-b border-border flex items-center justify-between px-4">
      <button
        onClick={handleOpenArchive}
        disabled={isImportActive}
        title={t('timeline.openArchive')}
        className="flex items-center gap-2 rounded-lg px-1 py-0.5 hover:bg-foreground/8 transition-colors disabled:opacity-40 cursor-pointer"
      >
        <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center shrink-0">
          <svg className="w-5 h-5 text-primary-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"
            />
          </svg>
        </div>
        <div className="flex flex-col leading-none text-left">
          <span className="text-lg font-medium text-foreground leading-none">{t('app.name')}</span>
          {config.archive_path && (
            <span className="text-[10px] text-muted-foreground truncate max-w-[200px]" title={config.archive_path}>
              {config.archive_path}
            </span>
          )}
        </div>
      </button>

      <nav className="flex items-center bg-muted rounded-lg p-0.5">
        {[
          { to: '/', label: t('nav.timeline') },
          { to: '/groups', label: t('nav.groups') },
          { to: '/favourites', label: t('nav.favourites') },
        ].map(({ to, label }) => (
          <button
            key={to}
            onClick={() => handleNav(to)}
            className={cn(
              'px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
              isActive(to) ? 'bg-white text-foreground font-medium shadow-sm' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {label}
          </button>
        ))}
      </nav>

      <div className="flex items-center gap-1">
        {/* Import */}
        <button
          onClick={() => handleNav('/import')}
          title={t('nav.import')}
          className={cn(
            'relative p-1.5 rounded-md transition-colors',
            isActive('/import') ? 'text-primary bg-primary/12' : 'text-foreground/60 hover:text-foreground hover:bg-foreground/8'
          )}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
          </svg>
          {isImportActive && (
            <span className="absolute top-0.5 right-0.5 w-2 h-2 rounded-full bg-primary animate-pulse" />
          )}
        </button>

        {/* Rescan */}
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

        {/* Settings cog */}
        <button
          onClick={toggleSettings}
          title={t('nav.settings')}
          className={cn(
            'p-1.5 rounded-md transition-colors',
            settingsOpen
              ? 'text-primary bg-primary/12'
              : 'text-foreground/60 hover:text-foreground hover:bg-foreground/8'
          )}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </button>
      </div>

      <Dialog open={pendingPath === '__close__'} onOpenChange={(open) => { if (!open) setPendingPath(null); }}>
        <DialogContent className="w-96">
          <DialogHeader>
            <DialogTitle>{t('import.navWarningTitle')}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">{t('import.navWarningBody')}</p>
          <div className="flex gap-3 justify-end">
            <Button
              onClick={async () => {
                setPendingPath(null);
                await getCurrentWindow().destroy();
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
