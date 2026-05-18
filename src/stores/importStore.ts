import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { convertFileSrc } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

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

export interface ImportSingleResult {
  status: string;
  error: string | null;
  source_path: string | null;
}

export type ImportPhase = 'idle' | 'scanning' | 'analyzing' | 'review' | 'importing' | 'complete' | 'error';

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
  conflictThumbs: Record<string, string>;
  setSourcePath: (path: string) => void;
  setArchivePath: (path: string) => void;
  startScan: () => Promise<void>;
  startAnalyze: () => Promise<void>;
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
  conflictThumbs: {},

  setSourcePath: (path) => set({ sourcePath: path }),
  
  setArchivePath: (path) => set({ archivePath: path }),

  startScan: async () => {
    const { sourcePath } = get();
    if (!sourcePath) return;
    
    set({ phase: 'scanning', error: null });
    
    try {
      const images = await invoke<ScannedImage[]>('scan_source', { sourcePath });
      set({ 
        scannedImages: images, 
        phase: 'analyzing',
        progress: { current: 0, total: images.length, currentFile: '' }
      });
    } catch (e) {
      set({ error: String(e), phase: 'error' });
    }
  },

  startAnalyze: async () => {
    const { scannedImages } = get();
    if (scannedImages.length === 0) return;

    set({ progress: { current: 0, total: scannedImages.length, currentFile: '' } });

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
      const analyzed = await invoke<AnalyzedImage[]>('analyze_images', { scanned: scannedImages });
      const plan = await invoke<ImportPlan>('create_import_plan', { images: analyzed });

      const conflictRes: ImportResolution[] = plan.images
        .filter(img => img.conflict)
        .map(img => ({ hash: img.hash, action: 'Skip' as ImportAction }));

      const conflictPaths = plan.images.filter(img => img.conflict).map(img => img.path);
      let conflictThumbs: Record<string, string> = {};
      if (conflictPaths.length > 0) {
        try {
          const raw = await invoke<Record<string, string>>('generate_temp_thumbnails_batch', {
            sourcePaths: conflictPaths,
          });
          conflictThumbs = Object.fromEntries(
            Object.entries(raw).map(([k, v]) => [k, convertFileSrc(v)])
          );
        } catch { /* non-fatal: conflict screen shows broken-image icon */ }
      }

      set({
        analyzedImages: plan.images,
        importPlan: plan,
        resolutions: conflictRes,
        conflictThumbs,
        phase: 'review',
      });
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
    } catch (e) {
      set({ error: String(e), phase: 'error' });
    } finally {
      unlisten();
    }
  },

  reset: () => {
    invoke('cleanup_temp_thumbnails').catch(() => {});
    set({
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
      conflictThumbs: {},
    });
  },
}));