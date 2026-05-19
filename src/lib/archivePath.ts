import { convertFileSrc } from '@tauri-apps/api/core';

export function trimArchivePath(path: string): string {
  return path.replace(/\/+$/, '');
}

export function getThumbnailUrl(archivePath: string, thumbnailPath: string | null | undefined): string {
  const root = trimArchivePath(archivePath);
  return root && thumbnailPath ? convertFileSrc(`${root}/${thumbnailPath}`) : '';
}
