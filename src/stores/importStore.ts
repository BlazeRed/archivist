import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { toast } from 'sonner';
import i18n from '@/i18n';
import { useUIStore } from './uiStore';

export interface ScannedImage {
  path: string;
  filename: string;
  size: number;
}

export interface AnalyzedImage {
  path: string;
  filename: string;
  size: number;
  hash: string;
  taken_at: string | null;
  width: number | null;
  height: number | null;
  has_exif: boolean;
  date_source: string | null;
  conflict: ConflictInfo | null;
  media_type: string;
  duration_ms: number | null;
}

export interface ConflictInfo {
  existing_id: string;
  existing_path: string;
  existing_date: string | null;
}

export interface ImportPlan {
  images: AnalyzedImage[];
  total_size: number;
  conflicts_count: number;
}

export interface ImportResolution {
  hash: string;
  action: 'Skip' | 'Replace' | 'KeepBoth';
}

export interface ImportResult {
  imported: number;
  skipped: number;
  errors: string[];
  imported_sources: string[];
}

export type ImportPhase = 'idle' | 'scanning' | 'analyzing' | 'thumbnailing' | 'review' | 'importing' | 'complete' | 'error';

/** Phases that lock source/destination: changing them mid-run would mix results. */
export const isBusyPhase = (phase: ImportPhase) =>
  phase === 'scanning' || phase === 'analyzing' || phase === 'thumbnailing' || phase === 'importing';

interface ImportState {
  phase: ImportPhase;
  sourcePath: string;
  archivePath: string;
  scannedImages: ScannedImage[];
  analyzedImages: AnalyzedImage[];
  importPlan: ImportPlan | null;
  resolutions: ImportResolution[];
  progress: { current: number; total: number; currentFile: string };
  result: ImportResult | null;
  error: string | null;
  setSourcePath: (path: string) => void;
  setArchivePath: (path: string) => Promise<void>;
  startAnalysis: () => Promise<void>;
  setResolution: (hash: string, action: ImportAction) => void;
  setAllResolutions: (action: ImportAction) => void;
  startImport: () => Promise<void>;
  reset: () => void;
}

export type ImportAction = 'Skip' | 'Replace' | 'KeepBoth';

export const useImportStore = create<ImportState>((set, get) => ({
  phase: 'idle',
  sourcePath: '',
  archivePath: '',
  scannedImages: [],
  analyzedImages: [],
  importPlan: null,
  resolutions: [],
  progress: { current: 0, total: 0, currentFile: '' },
  result: null,
  error: null,

  // New source: the previous analysis no longer applies
  setSourcePath: (path) => {
    if (isBusyPhase(get().phase)) return;
    discardUnimportedThumbnails(get().analyzedImages, get().archivePath);
    set({ sourcePath: path, ...EMPTY_ANALYSIS });
  },

  // New destination: hashes stay valid, only conflicts and thumbnails depend on the archive
  setArchivePath: async (path) => {
    const { phase, analyzedImages, archivePath } = get();
    if (isBusyPhase(phase) || path === archivePath) return;
    if (analyzedImages.length === 0) { set({ archivePath: path }); return; }
    // Lock at once: the current plan belongs to the old archive
    set({ archivePath: path, phase: 'analyzing', progress: { current: 0, total: 0, currentFile: '' } });
    discardUnimportedThumbnails(analyzedImages, archivePath);
    try {
      await planAndThumbnail(analyzedImages, path, set, get);
    } catch (e) {
      set({ error: String(e), phase: 'error' });
    }
  },

  startAnalysis: async () => {
    const { sourcePath, archivePath } = get();
    if (!sourcePath || !archivePath || isBusyPhase(get().phase)) return;

    set({ phase: 'scanning', error: null });

    let scannedImages: ScannedImage[];
    try {
      scannedImages = await invoke<ScannedImage[]>('scan_source', { sourcePath });
    } catch (e) {
      set({ error: String(e), phase: 'error' });
      return;
    }
    if (scannedImages.length === 0) {
      set({ ...EMPTY_ANALYSIS, importPlan: { images: [], total_size: 0, conflicts_count: 0 }, phase: 'review' });
      return;
    }

    set({ scannedImages, phase: 'analyzing', progress: { current: 0, total: scannedImages.length, currentFile: '' } });

    const unlisten = await listen<{ current: number; total: number; filename: string }>(
      'analyze_progress',
      (e) => set({
        progress: {
          current: Math.max(get().progress.current, e.payload.current),
          total: e.payload.total,
          currentFile: e.payload.filename,
        },
      })
    );

    try {
      const { images: analyzed, failed } = await invoke<{ images: AnalyzedImage[]; failed: string[] }>(
        'analyze_images', { scanned: scannedImages },
      );
      if (failed.length > 0) warnUnreadable(failed);
      await planAndThumbnail(analyzed, archivePath, set, get);
    } catch (e) {
      set({ error: String(e), phase: 'error' });
    } finally {
      unlisten();
    }
  },

  setResolution: (hash, action) => {
    const { resolutions } = get();
    const existing = resolutions.find(r => r.hash === hash);
    if (existing) {
      set({ resolutions: resolutions.map(r => r.hash === hash ? { ...r, action } : r) });
    } else {
      set({ resolutions: [...resolutions, { hash, action }] });
    }
  },

  setAllResolutions: (action) => {
    const { resolutions } = get();
    set({ resolutions: resolutions.map(r => ({ ...r, action })) });
  },

  startImport: async () => {
    const { importPlan, resolutions, archivePath } = get();
    if (!importPlan) return;

    set({ phase: 'importing', progress: { current: 0, total: importPlan.images.length, currentFile: '' } });

    const unlisten = await listen<{ current: number; total: number; filename: string }>(
      'import_progress',
      (e) => set({
        progress: {
          current: Math.max(get().progress.current, e.payload.current),
          total: e.payload.total,
          currentFile: e.payload.filename,
        },
      })
    );

    try {
      const result = await invoke<ImportResult>('execute_import', {
        plan: importPlan,
        resolutions,
        archivePath,
      });

      set({
        result,
        phase: 'complete',
        progress: { current: result.imported, total: importPlan.images.length, currentFile: '' },
      });
      // Replace can bring a trashed duplicate back out of the Trash
      useUIStore.getState().refreshTrashCount();
    } catch (e) {
      set({ error: String(e), phase: 'error' });
    } finally {
      unlisten();
    }
  },

  reset: () => {
    invoke('cleanup_temp_thumbnails').catch(() => {});
    discardUnimportedThumbnails(get().analyzedImages, get().archivePath);
    set({ sourcePath: '', archivePath: '', ...EMPTY_ANALYSIS, result: null });
  },
}));

const EMPTY_ANALYSIS = {
  phase: 'idle' as ImportPhase,
  scannedImages: [],
  analyzedImages: [],
  importPlan: null,
  resolutions: [],
  progress: { current: 0, total: 0, currentFile: '' },
  error: null,
};

/** Removes thumbnails pre-generated in `archivePath` for items that were never imported. */
function discardUnimportedThumbnails(analyzed: AnalyzedImage[], archivePath: string) {
  if (analyzed.length === 0 || !archivePath) return;
  invoke('cleanup_unimported_thumbnails', {
    hashes: analyzed.map(img => img.hash),
    archivePath,
  }).catch(() => {});
}

/** Files the analysis could not read are left out of the import: say which, not just how many. */
function warnUnreadable(paths: string[]) {
  console.error('Unreadable files:', paths);
  const names = paths.slice(0, 5).map((p) => p.split(/[\\/]/).pop()).join(', ');
  toast.warning(i18n.t('import.unreadable', { count: paths.length }), {
    description: paths.length > 5 ? `${names}…` : names,
    duration: 10000,
  });
}

type SetState = (partial: Partial<ImportState>) => void;

/** Conflicts against `archivePath` + thumbnails into it, then review. Shared by analysis and destination change. */
async function planAndThumbnail(analyzed: AnalyzedImage[], archivePath: string, set: SetState, get: () => ImportState) {
  const plan = await invoke<ImportPlan>('create_import_plan', { images: analyzed, archivePath });

  set({ phase: 'thumbnailing', progress: { current: 0, total: plan.images.length, currentFile: '' } });

  const unlistenThumb = await listen<{ current: number; total: number }>(
    'thumb_progress',
    (e) => set({
      progress: {
        current: Math.max(get().progress.current, e.payload.current),
        total: e.payload.total,
        currentFile: '',
      },
    })
  );

  try {
    await invoke('pre_generate_all_thumbnails_batch', { analyzed: plan.images, archivePath });
  } catch { /* non-fatal */ }
  finally {
    unlistenThumb();
  }

  set({
    analyzedImages: plan.images,
    importPlan: plan,
    // Conflicts differ per archive: choices start over at Skip
    resolutions: plan.images
      .filter(img => img.conflict)
      .map(img => ({ hash: img.hash, action: 'Skip' as ImportAction })),
    phase: 'review',
  });
}
