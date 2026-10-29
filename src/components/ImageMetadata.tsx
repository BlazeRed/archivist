import { useState, useEffect, type ReactNode } from 'react';
import { CalendarIcon, FolderIcon, MapPinIcon, XIcon, type LucideIcon } from 'lucide-react';
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
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

export function formatDate(dateStr: string | null, fallback: string) {
  if (!dateStr) return fallback;
  return new Date(dateStr).toLocaleDateString(undefined, {
    year: 'numeric', month: 'long', day: 'numeric',
  });
}

export function formatSize(bytes: number | null) {
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

/** `useImageGroups` for a multi-selection: a group counts as joined when every selected item is in it. */
export function useBulkGroups(imageIds: string[]): ImageGroups {
  const { availableGroups, fetchGroups } = useTimelineStore();
  const [members, setMembers] = useState<Record<number, Set<string>>>({});

  // Reloads whenever fetchGroups() refreshes the group list (i.e. after every add/remove)
  useEffect(() => {
    Promise.all(availableGroups.map(async g =>
      [g.id, new Set(await invoke<string[]>('get_images_in_group', { groupId: g.id }))] as const
    ))
      .then(entries => setMembers(Object.fromEntries(entries)))
      .catch(() => setMembers({}));
  }, [availableGroups]);

  const isMember = (groupId: number) => imageIds.length > 0 && imageIds.every(id => members[groupId]?.has(id));

  const add = async (groupId: number) => {
    try {
      await invoke('add_images_to_group_bulk', { imageIds, groupId });
      fetchGroups();
    } catch (e) {
      console.error('Failed to add to group:', e);
    }
  };

  const remove = async (groupId: number) => {
    try {
      for (const imageId of imageIds) {
        await invoke('remove_image_from_group', { imageId, groupId });
      }
      fetchGroups();
    } catch (e) {
      console.error('Failed to remove from group:', e);
    }
  };

  return {
    allGroups: availableGroups,
    currentGroups: availableGroups.filter(g => isMember(g.id)),
    addableGroups: availableGroups.filter(g => !isMember(g.id)),
    isMember,
    toggle: (groupId: number) => (isMember(groupId) ? remove(groupId) : add(groupId)),
    add,
    remove,
  };
}

/** Metadata row, same look as `Field`. With `onClick` the whole row is a ghost button (cross-link to another
 *  page): value in the link tone, small trailing icon, tinted fill on hover. The fill bleeds 8px past the text
 *  (-mx-2 px-2), which the preview's scroll container leaves room for (its px-3); radius lg = card xl (24) − 8 inset. */
function LinkRow({ label, onClick, tooltip, icon: Icon, valueClassName, hoverClassName, children }: {
  label: string;
  onClick?: () => void;
  tooltip: string;
  icon: LucideIcon;
  valueClassName: string;
  hoverClassName: string;
  children: ReactNode;
}) {
  const value = cn('flex flex-wrap items-center gap-2', valueClassName);
  if (!onClick) {
    return (
      <div>
        <p className="text-[11px] text-muted-foreground mb-0.5">{label}</p>
        <p className={value}>{children}</p>
      </div>
    );
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {/* -mt-1.5 py-1.5 mb-1.5: the fill grows 6px up/down while the rows' 12px rhythm (space-y = own bottom margin) holds */}
        <Button
          variant="ghost"
          onClick={onClick}
          className={cn(
            '-mx-2 -mt-1.5 mb-1.5 h-auto w-[calc(100%+1rem)] flex-col items-start gap-0 rounded-lg border-0 px-2 py-1.5 text-left text-sm font-normal whitespace-normal active:not-aria-[haspopup]:scale-100',
            hoverClassName,
          )}
        >
          <span className="text-[11px] text-muted-foreground mb-0.5">{label}</span>
          <span className={value}>
            {children}
            <Icon className="size-3.5 -ml-0.5" />
          </span>
        </Button>
      </TooltipTrigger>
      <TooltipContent side="top">{tooltip}</TooltipContent>
    </Tooltip>
  );
}

function formatCoords(image: Image) {
  return image.latitude != null && image.longitude != null
    ? `${image.latitude.toFixed(5)}, ${image.longitude.toFixed(5)}`
    : '—';
}

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

export function ImageMetadataView({ image, groups, hideGroups, readOnly, onShowOnMap, onShowInTimeline }: {
  image: Image;
  groups: ImageGroups;
  hideGroups?: boolean;
  /** Makes the whole location row a button (Timeline preview: open the photo on the map). */
  onShowOnMap?: () => void;
  /** Makes the whole date row a button (Map preview: open the photo in the Timeline). */
  onShowInTimeline?: () => void;
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

        <LinkRow
          label={t('detail.dateTaken')}
          onClick={onShowInTimeline}
          tooltip={t('map.showInTimeline')}
          icon={CalendarIcon}
          valueClassName={onShowInTimeline ? 'text-primary-ink' : 'text-foreground'}
          hoverClassName="hover:bg-primary/12"
        >
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
        </LinkRow>

        {image.media_type === 'video' && image.duration_ms != null && (
          <Field label={t('detail.duration')} value={formatDuration(image.duration_ms)} />
        )}

        {/* Rows stay even when the value is missing ("—"), so switching photos never shifts the layout */}
        <Field label={t('detail.dimensions')} value={image.width && image.height ? `${image.width} × ${image.height}` : '—'} />

        <Field label={t('detail.fileSize')} value={formatSize(image.file_size)} />

        {/* Violet = places (like the map pins) */}
        <LinkRow
          label={t('detail.location')}
          onClick={onShowOnMap}
          tooltip={t('preview.showOnMap')}
          icon={MapPinIcon}
          valueClassName={image.latitude != null ? 'text-violet-ink' : 'text-foreground'}
          hoverClassName="hover:bg-violet-soft"
        >
          <span className="tabular-nums">{formatCoords(image)}</span>
        </LinkRow>

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
            <FolderIcon />
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
            <SelectTrigger size="sm" className="w-full">
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
