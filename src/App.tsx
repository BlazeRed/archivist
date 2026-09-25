import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/core';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Topbar } from './components/Topbar';
import { Toaster } from './components/ui/sonner';
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
  const { setConfig } = useAppConfigStore();
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

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Topbar />
      <main className="flex-1 relative">
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
          'fixed inset-0 z-40 bg-black/30 transition-opacity duration-200',
          settingsOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        )}
        onClick={closeSettings}
      />

      {/* Settings slide-over panel */}
      <div
        className={cn(
          'fixed top-[52px] right-0 bottom-0 z-50 w-80 bg-card border-l border-border shadow-xl transition-transform duration-200',
          settingsOpen ? 'translate-x-0' : 'translate-x-full'
        )}
      >
        <SettingsPage />
      </div>

      <Toaster />
    </div>
  );
}

export default App;
