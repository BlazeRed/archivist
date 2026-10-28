import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/core';
import { revealItemInDir } from '@tauri-apps/plugin-opener';
import { trimArchivePath } from '@/lib/archivePath';
import { useTimelineStore } from '../stores/timelineStore';
import { useAppConfigStore } from '../stores/appConfigStore';
import type { Image, GroupWithCount } from '../types';
import { formatDuration } from '@/lib/formatDuration';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { XIcon } from 'lucide-react';

function formatDate(dateStr: string | null, fallback: string) {
  if (!dateStr) return fallback;
  return new Date(dateStr).toLocaleDateString(undefined, {
    year: 'numeric', month: 'long', day: 'numeric',
  });
}

function formatSize(bytes: number | null) {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function useShowInFolder(image: Image) {
  const { config } = useAppConfigStore();
  const archivePath = trimArchivePath(config.archive_path);
  return async () => {
    if (!archivePath) return;
    await revealItemInDir(`${archivePath}/${image.file_path}`);
  };
}

/** Group membership of one image. Shared by the metadata list and the preview action bar. */
export function useImageGroups(imageId: string) {
  const { availableGroups, fetchGroups } = useTimelineStore();
  const [imageGroups, setImageGroups] = useState<number[]>([]);

  useEffect(() => {
    invoke<number[]>('get_groups_for_image', { imageId })
      .then(setImageGroups)
      .catch(() => setImageGroups([]));
  }, [imageId]);

  const add = async (groupId: number) => {
    try {
      await invoke('add_image_to_group', { imageId, groupId });
      setImageGroups(prev => [...prev, groupId]);
      fetchGroups(); // refresh per-group image counts
    } catch (e) {
      console.error('Failed to add to group:', e);
    }
  };

  const remove = async (groupId: number) => {
    try {
      await invoke('remove_image_from_group', { imageId, groupId });
      setImageGroups(prev => prev.filter(id => id !== groupId));
      fetchGroups();
    } catch (e) {
      console.error('Failed to remove from group:', e);
    }
  };

  return {
    allGroups: availableGroups,
    currentGroups: availableGroups.filter(g => imageGroups.includes(g.id)),
    addableGroups: availableGroups.filter(g => !imageGroups.includes(g.id)),
    isMember: (groupId: number) => imageGroups.includes(groupId),
    toggle: (groupId: number) => (imageGroups.includes(groupId) ? remove(groupId) : add(groupId)),
    add,
    remove,
  };
}

export type ImageGroups = ReturnType<typeof useImageGroups>;

function Field({ label, value, truncate }: { label: string; value: string; truncate?: boolean }) {
  return (
    <div>
      <p className="text-[11px] text-muted-foreground mb-0.5">{label}</p>
      <p className={`text-foreground tabular-nums ${truncate ? 'truncate' : ''}`}>{value}</p>
    </div>
  );
}

/** Metadata panel that owns its group state (used by ImageDetail). */
export function ImageMetadata({ image, hideGroups }: { image: Image; hideGroups?: boolean }) {
  const groups = useImageGroups(image.id);
  return <ImageMetadataView image={image} groups={groups} hideGroups={hideGroups} />;
}

export function ImageMetadataView({ image, groups, hideGroups, readOnly }: {
  image: Image;
  groups: ImageGroups;
  hideGroups?: boolean;
  /** Display only: no "Show in folder", no group add/remove (the preview card has its own action pills). */
  readOnly?: boolean;
}) {
  const { t } = useTranslation();
  const handleShowInFolder = useShowInFolder(image);
  const { currentGroups, addableGroups } = groups;

  return (
    <>
      {/* Metadata fields */}
      <div className="space-y-3 text-sm">
        <Field label={t('detail.filename')} value={image.filename} truncate />

        <div>
          <p className="text-[11px] text-muted-foreground mb-0.5">
            {t('detail.dateTaken')}
          </p>
          <p className="text-foreground flex items-center gap-2 flex-wrap">
            {image.taken_at
              ? formatDate(image.taken_at, t('detail.noDate'))
              : <span className="text-muted-foreground">{t('detail.noDate')}</span>
            }
            {image.taken_at && image.date_source === 'filename' && (
              <span className="text-[11px] font-semibold bg-primary/12 text-primary-ink px-2 py-0.5 rounded-full">
                {t('common.dateFromFilename')}
              </span>
            )}
            {image.taken_at && image.date_source === 'mtime' && (
              <span className="text-[11px] font-semibold bg-warning/15 text-warning-ink px-2 py-0.5 rounded-full">
                {t('detail.noExif')}
              </span>
            )}
          </p>
        </div>

        {image.media_type === 'video' && image.duration_ms != null && (
          <Field label={t('detail.duration')} value={formatDuration(image.duration_ms)} />
        )}

        {image.width && image.height && (
          <Field label={t('detail.dimensions')} value={`${image.width} × ${image.height}`} />
        )}

        {image.file_size && (
          <Field label={t('detail.fileSize')} value={formatSize(image.file_size)} />
        )}

        {image.latitude != null && image.longitude != null && (
          <Field label={t('detail.location')} value={`${image.latitude.toFixed(5)}, ${image.longitude.toFixed(5)}`} />
        )}

        <Field label={t('detail.imported')} value={formatDate(image.imported_at, '—')} />

        <div>
          <p className="text-[11px] text-muted-foreground mb-0.5">
            {t('detail.id')}
          </p>
          <p className="text-xs font-mono text-muted-foreground truncate" title={image.id}>
            {image.id.substring(0, 16)}…
          </p>
        </div>

        {!readOnly && (
          <Button variant="outline" size="sm" onClick={handleShowInFolder} className="mt-1 w-full">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
                d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
            </svg>
            {t('detail.showInFolder')}
          </Button>
        )}
      </div>

      {/* Groups section */}
      {!hideGroups && <div className="pt-3 mt-3 border-t border-border">
        <p className="text-[11px] font-semibold text-primary-ink uppercase tracking-[0.1em] mb-2">
          {t('nav.groups')}
        </p>

        {currentGroups.length === 0 ? (
          <p className="text-xs text-muted-foreground mb-2">{t('detail.noGroups')}</p>
        ) : (
          <div className="flex flex-wrap gap-1 mb-2">
            {currentGroups.map((g: GroupWithCount) => (
              <Badge key={g.id} variant="violet" className="h-6 px-2.5">
                {g.name}
                {!readOnly && (
                  <button
                    onClick={() => groups.remove(g.id)}
                    aria-label={t('detail.removeFromGroup')}
                    className="-mr-1 rounded-full hover:text-destructive transition-colors"
                  >
                    <XIcon />
                  </button>
                )}
              </Badge>
            ))}
          </div>
        )}

        {!readOnly && addableGroups.length > 0 && (
          <Select value="" onValueChange={(v) => groups.add(Number(v))}>
            <SelectTrigger size="sm" className="w-full rounded-full text-xs">
              <SelectValue placeholder={t('detail.addToGroup')} />
            </SelectTrigger>
            <SelectContent>
              {addableGroups.map((g: GroupWithCount) => (
                <SelectItem key={g.id} value={g.id.toString()}>{g.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>}
    </>
  );
}
