import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';

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

    const analyzed: AnalyzedImage[] = [];
    
    set({ progress: { current: 0, total: scannedImages.length, currentFile: '' } });

    for (let i = 0; i < scannedImages.length; i++) {
      const scanned = scannedImages[i];
      set({ 
        progress: { 
          current: i + 1, 
          total: scannedImages.length, 
          currentFile: scanned.filename 
        } 
      });

      try {
        const result = await invoke<AnalyzedImage>('analyze_image', { scanned });
        analyzed.push(result);
      } catch (e) {
        console.error('Failed to analyze:', scanned.filename, e);
      }
    }

    const plan = await invoke<ImportPlan>('create_import_plan', { images: analyzed });

    // plan.images has conflict fields populated by the backend — use them as source of truth
    const conflictRes: ImportResolution[] = plan.images
      .filter(img => img.conflict)
      .map(img => ({ hash: img.hash, action: 'KeepBoth' as ImportAction }));

    set({
      analyzedImages: plan.images,
      importPlan: plan,
      resolutions: conflictRes,
      phase: 'review'
    });
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

    try {
      const result = await invoke<ImportResult>('execute_import', {
        plan: importPlan,
        resolutions,
        archivePath
      });
      
      set({ 
        result, 
        phase: 'complete',
        progress: { current: result.imported, total: importPlan.images.length, currentFile: '' }
      });
    } catch (e) {
      set({ error: String(e), phase: 'error' });
    }
  },

  reset: () => set({
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
  }),
}));