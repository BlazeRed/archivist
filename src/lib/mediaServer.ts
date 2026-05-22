import { invoke } from '@tauri-apps/api/core';

let portCache: number | null = null;

async function getPort(): Promise<number> {
  if (portCache === null) {
    portCache = await invoke<number>('get_media_server_port');
  }
  return portCache;
}

export async function makeVideoUrl(archivePath: string, webPath: string): Promise<string> {
  const port = await getPort();
  return `http://127.0.0.1:${port}${archivePath}/${webPath}`;
}
