import { invoke } from '@tauri-apps/api/core';

type MediaServer = { port: number; token: string };

let serverCache: Promise<MediaServer> | null = null;

function getServer(): Promise<MediaServer> {
  serverCache ??= invoke<MediaServer>('get_media_server');
  return serverCache;
}

const transcoding = new Map<string, Promise<string>>();

/**
 * Transcodes a video once: callers asking while it runs (preview + viewer, StrictMode's
 * double effect) share the same ffmpeg run instead of starting a second one on the same file.
 * Resolves to the new `web_path`.
 */
export function transcodeVideo(imageId: string): Promise<string> {
  let run = transcoding.get(imageId);
  if (!run) {
    run = invoke<string>('transcode_video', { imageId }).finally(() => transcoding.delete(imageId));
    transcoding.set(imageId, run);
  }
  return run;
}

/** The backend runs one transcode at a time: a newer one stops the previous with this error. Not a failure. */
export const isTranscodeCancelled = (e: unknown) => String(e) === 'Cancelled';

/** Toast id per video, so repeated notices about the same conversion replace each other. */
export const transcodeToastId = (imageId: string) => `transcode-${imageId}`;

/** URL of a file of the open archive on the local media server. `webPath` is archive-relative. */
export async function makeVideoUrl(webPath: string): Promise<string> {
  const { port, token } = await getServer();
  // Encode each segment: `#`, `?`, `%` in names would otherwise break the URL. Windows rows may use `\`
  const path = webPath.split(/[\\/]/).map(encodeURIComponent).join('/');
  return `http://127.0.0.1:${port}/${token}/${path}`;
}
