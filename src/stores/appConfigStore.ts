import { create } from 'zustand';

interface AppConfig {
  archive_path: string;
  language: 'en' | 'it';
  thumbnail_size: 'small' | 'medium' | 'large';
  last_import_source: string;
  block_size: number;
}

interface AppConfigStore {
  config: AppConfig;
  setConfig: (config: Partial<AppConfig>) => void;
}

export const useAppConfigStore = create<AppConfigStore>((set) => ({
  config: {
    archive_path: '',
    language: 'en',
    thumbnail_size: 'medium',
    last_import_source: '',
    block_size: 50,
  },
  setConfig: (newConfig) => set((state) => ({
    config: { ...state.config, ...newConfig }
  })),
}));