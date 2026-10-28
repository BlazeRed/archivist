import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/core';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Topbar } from './components/Topbar';
import { Toaster } from './components/ui/sonner';
import { TooltipProvider } from './components/ui/tooltip';
import { TimelinePage } from './pages/TimelinePage';
import { MapPage } from './pages/MapPage';
import { GroupsPage } from './pages/GroupsPage';
import { ImportPage } from './pages/ImportPage';
import { SettingsPage } from './pages/SettingsPage';
import { FavouritesPage } from './pages/FavouritesPage';
import { useAppConfigStore } from './stores/appConfigStore';
import { useUIStore } from './stores/uiStore';
import { cn } from './lib/utils';

function App() {
  const { i18n } = useTranslation();
  const { config, setConfig } = useAppConfigStore();
  const { settingsOpen, closeSettings } = useUIStore();

  useEffect(() => {
    (async () => {
      try {
        const saved = await invoke<Record<string, unknown> | null>('load_config');
        if (!saved) return;

        const { archive_path, ...rest } = saved;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        setConfig(rest as any);
        if (typeof saved.language === 'string') {
          i18n.changeLanguage(saved.language);
        }

        if (typeof archive_path === 'string' && archive_path) {
          const exists = await invoke<boolean>('path_exists', { path: archive_path });
          if (exists) {
            await invoke('init_archive', { archivePath: archive_path });
            setConfig({ archive_path });
          } else {
            setConfig({ archive_path: '' });
          }
        }
      } catch (e) {
        console.error('Failed to load config:', e);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Theme: explicit choice, or follow the OS while set to 'system'
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const dark = config.theme === 'dark' || (config.theme === 'system' && media.matches);
      document.documentElement.classList.toggle('dark', dark);
    };
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [config.theme]);

  return (
    <TooltipProvider delayDuration={400}>
    <div className="min-h-screen flex flex-col bg-background">
      <Topbar />
      {/* Topbar is fixed: pages start below it (Timeline opts out to scroll underneath) */}
      <main className="flex-1 relative pt-[var(--topbar-offset)]">
        <Routes>
          <Route path="/" element={<TimelinePage />} />
          <Route path="/map" element={<MapPage />} />
          <Route path="/groups" element={<GroupsPage />} />
          <Route path="/import" element={<ImportPage />} />
          <Route path="/favourites" element={<FavouritesPage />} />
          <Route path="/settings" element={<Navigate to="/" replace />} />
        </Routes>
      </main>

      {/* Settings backdrop */}
      <div
        className={cn(
          'fixed inset-0 z-40 bg-foreground/20 dark:bg-black/50 transition-opacity duration-200',
          settingsOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        )}
        onClick={closeSettings}
      />

      {/* Settings floating panel: detached card, same 12px inset as the topbar */}
      <div
        className={cn(
          'squircle fixed top-[calc(var(--topbar-offset)+8px)] right-3 bottom-3 z-50 w-80 rounded-xl bg-popover shadow-overlay ring-1 ring-frame overflow-hidden transition-[translate,opacity]',
          settingsOpen
            ? 'translate-x-0 opacity-100 duration-300 ease-[cubic-bezier(.2,.8,.2,1)]'
            : 'translate-x-[calc(100%+12px)] opacity-0 pointer-events-none duration-200 ease-[cubic-bezier(.4,0,1,1)]'
        )}
      >
        <SettingsPage />
      </div>

      <Toaster theme={config.theme} />
    </div>
    </TooltipProvider>
  );
}

export default App;
