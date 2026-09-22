import { convertFileSrc } from '@tauri-apps/api/core';

export function trimArchivePath(path: string): string {
  return path.replace(/\/+$/, '');
}

export function getThumbnailUrl(archivePath: string, thumbnailPath: string | null | undefined, cacheBust?: number): string {
  const root = trimArchivePath(archivePath);
  if (!root || !thumbnailPath) return '';
  const url = convertFileSrc(`${root}/${thumbnailPath}`);
  return cacheBust ? `${url}?v=${cacheBust}` : url;
}
