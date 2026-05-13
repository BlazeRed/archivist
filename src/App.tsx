import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/core';
import { Routes, Route } from 'react-router-dom';
import { Topbar } from './components/Topbar';
import { ToastContainer } from './components/Toast';
import { TimelinePage } from './pages/TimelinePage';
import { GroupsPage } from './pages/GroupsPage';
import { ImportPage } from './pages/ImportPage';
import { SettingsPage } from './pages/SettingsPage';
import { useAppConfigStore } from './stores/appConfigStore';

function App() {
  const { i18n } = useTranslation();
  const { setConfig } = useAppConfigStore();

  useEffect(() => {
    (async () => {
      try {
        const saved = await invoke<Record<string, unknown> | null>('load_config');
        if (!saved) return;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        setConfig(saved as any);
        if (typeof saved.language === 'string') {
          i18n.changeLanguage(saved.language);
        }

        if (typeof saved.archive_path === 'string' && saved.archive_path) {
          const exists = await invoke<boolean>('path_exists', { path: saved.archive_path });
          if (exists) {
            await invoke('init_archive', { archivePath: saved.archive_path });
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
    <div className="min-h-screen flex flex-col bg-[#D2E8F7]">
      <Topbar />
      <main className="flex-1">
        <Routes>
          <Route path="/" element={<TimelinePage />} />
          <Route path="/groups" element={<GroupsPage />} />
          <Route path="/import" element={<ImportPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </main>
      <ToastContainer />
    </div>
  );
}

export default App;