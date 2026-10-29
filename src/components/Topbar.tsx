import { useState, useEffect } from 'react';
import { ArchiveIcon, RefreshCwIcon, SettingsIcon, Trash2Icon, UploadIcon } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { pickAndOpenArchive } from '@/lib/openArchive';
import { useAppConfigStore } from '../stores/appConfigStore';
import { useImportStore } from '../stores/importStore';
import { useUIStore } from '../stores/uiStore';
import { useRescan } from '../hooks/useRescan';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

export function Topbar() {
  const { t } = useTranslation();
  const { config } = useAppConfigStore();
  const navigate = useNavigate();
  const location = useLocation();
  const { phase } = useImportStore();
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

  const handleOpenArchive = () => pickAndOpenArchive();

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
    <header className="fixed top-3 inset-x-3 z-40 h-[52px] rounded-full bg-popover shadow-float ring-1 ring-frame grid grid-cols-[1fr_auto_1fr] items-center gap-3 pl-1 pr-2">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            onClick={handleOpenArchive}
            disabled={isImportActive}
            className="h-11 min-w-0 justify-self-start gap-3 pl-[5px] pr-5"
          >
            <span className="w-[34px] h-[34px] rounded-full bg-linear-145 from-primary to-violet flex items-center justify-center shrink-0">
              <ArchiveIcon className="size-5! text-white" />
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
              <UploadIcon />
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
                <RefreshCwIcon className={cn(isRescanning && 'animate-spin')} />
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
                <Trash2Icon />
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
              <SettingsIcon />
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
