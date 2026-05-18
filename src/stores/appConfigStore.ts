import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';

interface AppConfig {
  archive_path: string;
  language: 'en' | 'it';
  thumbnail_size: 'small' | 'medium' | 'large';
  group_cover_size: 'small' | 'medium' | 'large';
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
    group_cover_size: 'medium',
  },
  setConfig: (newConfig) => set((state) => {
    const config = { ...state.config, ...newConfig };
    invoke('save_config', { config }).catch(console.error);
    return { config };
  }),
}));