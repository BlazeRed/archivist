import { Activity, useEffect, useLayoutEffect, useRef, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/core';
import { useLocation } from 'react-router-dom';
import { Topbar } from './components/Topbar';
import { Toaster } from './components/ui/sonner';
import { TooltipProvider } from './components/ui/tooltip';
import { TimelinePage } from './pages/TimelinePage';
import { MapPage } from './pages/MapPage';
import { GroupsPage } from './pages/GroupsPage';
import { ImportPage } from './pages/ImportPage';
import { SettingsPage } from './pages/SettingsPage';
import { FavouritesPage } from './pages/FavouritesPage';
import { TrashPage } from './pages/TrashPage';
import { useAppConfigStore } from './stores/appConfigStore';
import { openArchive } from './lib/openArchive';
import { useUIStore } from './stores/uiStore';
import { cn } from './lib/utils';

const PAGES: { path: string; element: ReactNode }[] = [
  { path: '/', element: <TimelinePage /> },
  { path: '/map', element: <MapPage /> },
  { path: '/groups', element: <GroupsPage /> },
  { path: '/import', element: <ImportPage /> },
  { path: '/favourites', element: <FavouritesPage /> },
  { path: '/trash', element: <TrashPage /> },
];

/** Restores the scroll offsets of a page's scrollers when its Activity is shown again:
 *  display:none can reset them. Offsets read while hidden (0×0 box) are ignored. */
function KeepScroll({ children }: { children: ReactNode }) {
  const offsets = useRef(new Map<Element, number>());
  // Layout effects re-run each time the Activity becomes visible
  useLayoutEffect(() => {
    for (const [el, top] of offsets.current) {
      if (el.isConnected) el.scrollTop = top;
      else offsets.current.delete(el);
    }
  }, []);
  return (
    <div
      className="contents"
      onScrollCapture={(e) => {
        const el = e.target as Element;
        if (el.clientHeight > 0) offsets.current.set(el, el.scrollTop);
      }}
    >
      {children}
    </div>
  );
}

function App() {
  const { i18n } = useTranslation();
  const { pathname } = useLocation();
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
          if (!exists || !(await openArchive(archive_path))) setConfig({ archive_path: '' });
        }
      } catch (e) {
        console.error('Failed to load config:', e);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Esc closes the settings panel — unless a select/menu inside it owns the key
  useEffect(() => {
    if (!settingsOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      if ((e.target as Element | null)?.closest?.('[role="listbox"], [role="dialog"], [role="menu"]')) return;
      e.preventDefault(); // so the Timeline doesn't also clear the preview on the same key
      closeSettings();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [settingsOpen, closeSettings]);

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
        {/* Pages stay mounted: switching keeps their state (scroll, selection, map view). Hidden ones run no
            effects (no fetches, no map, no keyboard listeners); effects re-run each time a page is shown */}
        {PAGES.map(({ path, element }) => (
          <Activity key={path} mode={(path === '/' ? pathname === '/' : pathname.startsWith(path)) ? 'visible' : 'hidden'}>
            <KeepScroll>{element}</KeepScroll>
          </Activity>
        ))}
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
