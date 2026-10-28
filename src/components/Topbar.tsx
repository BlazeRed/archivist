import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { useAppConfigStore } from '../stores/appConfigStore';
import { useImportStore } from '../stores/importStore';
import { useTimelineStore } from '../stores/timelineStore';
import { useMapStore } from '../stores/mapStore';
import { useGroupStore } from '../stores/dataStore';
import { useUIStore } from '../stores/uiStore';
import { useRescan } from '../hooks/useRescan';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

export function Topbar() {
  const { t } = useTranslation();
  const { config, setConfig } = useAppConfigStore();
  const navigate = useNavigate();
  const location = useLocation();
  const { phase } = useImportStore();
  const { clearImages, selectImage } = useTimelineStore();
  const clearGroups = useGroupStore((s) => s.clearGroups);
  const clearLocations = useMapStore((s) => s.clearLocations);
  const { settingsOpen, toggleSettings, trashCount, refreshTrashCount } = useUIStore();
  const { isRescanning, handleRescan } = useRescan();
  const [pendingPath, setPendingPath] = useState<string | null>(null);

  const isImportActive = phase === 'scanning' || phase === 'analyzing' || phase === 'thumbnailing' || phase === 'importing';

  useEffect(() => {
    if (config.archive_path) refreshTrashCount();
  }, [config.archive_path, refreshTrashCount]);

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
      clearLocations();
      try { await invoke('init_archive', { archivePath: selected }); } catch {}
      setConfig({ archive_path: selected as string });
    }
  };

  const handleNav = (to: string) => navigate(to);
  const isActive = (to: string) => to === '/' ? location.pathname === '/' : location.pathname.startsWith(to);

  const navItems = [
    { to: '/', label: t('nav.timeline') },
    { to: '/map', label: t('nav.map') },
    { to: '/groups', label: t('nav.groups') },
    { to: '/favourites', label: t('nav.favourites') },
  ];
  const activeNav = navItems.find(n => isActive(n.to))?.to ?? '';

  return (
    <header className="fixed top-3 inset-x-3 z-40 h-[52px] rounded-full bg-popover shadow-float ring-1 ring-frame grid grid-cols-[1fr_auto_1fr] items-center gap-3 pl-2.5 pr-2">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            onClick={handleOpenArchive}
            disabled={isImportActive}
            className="h-auto min-w-0 justify-self-start gap-2.5 pl-0.5 pr-3 py-0.5"
          >
            <span className="squircle w-[34px] h-[34px] rounded-[11px] bg-linear-145 from-primary to-violet flex items-center justify-center shrink-0">
              <svg className="size-5! text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"
                />
              </svg>
            </span>
            <span className="flex flex-col leading-none text-left">
              <span className="text-[15px] font-semibold text-foreground leading-none">{t('app.name')}</span>
              {config.archive_path && (
                <span className="mt-1 text-[10px] font-normal text-muted-foreground truncate max-w-[200px]">
                  {config.archive_path}
                </span>
              )}
            </span>
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">{t('timeline.openArchive')}</TooltipContent>
      </Tooltip>

      <ToggleGroup
        type="single"
        variant="segmented"
        spacing={0.5}
        value={activeNav}
        onValueChange={(to) => { if (to) handleNav(to); }}
        className="bg-muted rounded-full p-[3px]"
      >
        {navItems.map(({ to, label }) => (
          <ToggleGroupItem key={to} value={to} className="px-[13px] text-[12.5px]">
            {label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>

      <div className="flex items-center justify-self-end gap-0.5">
        {/* Import */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-lg"
              onClick={() => handleNav('/import')}
              aria-label={t('nav.import')}
              className={cn('relative', isActive('/import') ? 'text-primary-ink bg-primary/12 hover:bg-primary/12' : 'text-muted-foreground')}
            >
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              {isImportActive && (
                <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-primary animate-pulse" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">{t('nav.import')}</TooltipContent>
        </Tooltip>

        {/* Rescan */}
        {config.archive_path && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-lg"
                onClick={handleRescan}
                disabled={isRescanning || isImportActive}
                aria-label={t('nav.rescan')}
                className="text-muted-foreground"
              >
                <svg className={cn(isRescanning && 'animate-spin')} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">{t('nav.rescan')}</TooltipContent>
          </Tooltip>
        )}

        {/* Trash */}
        {config.archive_path && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-lg"
                onClick={() => handleNav('/trash')}
                aria-label={t('nav.trash')}
                className={cn('relative', isActive('/trash') ? 'text-primary-ink bg-primary/12 hover:bg-primary/12' : 'text-muted-foreground')}
              >
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                {trashCount > 0 && (
                  <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-destructive" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">{t('nav.trash')}</TooltipContent>
          </Tooltip>
        )}

        {/* Settings cog */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-lg"
              onClick={toggleSettings}
              aria-label={t('nav.settings')}
              className={cn(settingsOpen ? 'text-primary-ink bg-primary/12 hover:bg-primary/12' : 'text-muted-foreground')}
            >
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">{t('nav.settings')}</TooltipContent>
        </Tooltip>
      </div>

      <Dialog open={pendingPath === '__close__'} onOpenChange={(open) => { if (!open) setPendingPath(null); }}>
        <DialogContent className="w-96">
          <DialogHeader>
            <DialogTitle>{t('import.navWarningTitle')}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">{t('import.navWarningBody')}</p>
          <div className="flex gap-3 justify-end">
            <Button onClick={() => setPendingPath(null)} variant="outline" size="sm">
              {t('common.cancel')}
            </Button>
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
          </div>
        </DialogContent>
      </Dialog>
    </header>
  );
}
