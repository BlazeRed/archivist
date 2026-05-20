import { useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useAppConfigStore } from '../stores/appConfigStore';
import { useTimelineStore } from '../stores/timelineStore';

interface VideoStub {
  id: string;
  file_path: string;
}

export function useTranscodeQueue() {
  const archivePath = useAppConfigStore((s) => s.config.archive_path);
  const images = useTimelineStore((s) => s.images);
  const updateImageWebPath = useTimelineStore((s) => s.updateImageWebPath);
  const runningRef = useRef(false);

  useEffect(() => {
    if (!archivePath) return;

    const needsTranscode = images.some(
      (img) => img.media_type === 'video' && img.web_path === null
    );
    if (!needsTranscode || runningRef.current) return;

    let cancelled = false;
    runningRef.current = true;

    const run = async () => {
      console.log('[transcode-queue] archivePath:', archivePath);
      try {
        const queue = await invoke<VideoStub[]>('get_videos_needing_transcode');
        console.log('[transcode-queue] queue:', queue);
        for (const video of queue) {
          if (cancelled) break;
          console.log('[transcode-queue] processing:', video.id, video.file_path);
          try {
            const webPath = await invoke<string>('transcode_video', {
              imageId: video.id,
              filePath: video.file_path,
            });
            console.log('[transcode-queue] done:', video.id, '→', webPath);
            updateImageWebPath(video.id, webPath);
          } catch (e) {
            console.error('[transcode-queue] transcode failed:', video.id, e);
          }
        }
      } catch (e) {
        console.error('[transcode-queue] fetch failed:', e);
      } finally {
        runningRef.current = false;
      }
    };

    run();
    return () => { cancelled = true; };
  }, [archivePath, images]);
}
