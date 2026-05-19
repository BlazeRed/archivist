import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/core';
import { revealItemInDir } from '@tauri-apps/plugin-opener';
import { trimArchivePath } from '@/lib/archivePath';
import { useTimelineStore } from '../stores/timelineStore';
import { useAppConfigStore } from '../stores/appConfigStore';
import type { Image, GroupWithCount } from '../types';

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

function Field({ label, value, truncate }: { label: string; value: string; truncate?: boolean }) {
  return (
    <div>
      <p className="text-[10px] text-foreground/45 uppercase tracking-wide mb-0.5">{label}</p>
      <p className={`text-foreground ${truncate ? 'truncate' : ''}`}>{value}</p>
    </div>
  );
}

export function ImageMetadata({ image, hideGroups }: { image: Image; hideGroups?: boolean }) {
  const { t } = useTranslation();
  const { availableGroups } = useTimelineStore();
  const { config } = useAppConfigStore();
  const archivePath = trimArchivePath(config.archive_path);

  const [imageGroups, setImageGroups] = useState<number[]>([]);
  const [addingGroupId, setAddingGroupId] = useState<number | ''>('');

  useEffect(() => {
    invoke<number[]>('get_groups_for_image', { imageId: image.id })
      .then(setImageGroups)
      .catch(() => setImageGroups([]));
  }, [image.id]);

  const handleShowInFolder = async () => {
    if (!archivePath) return;
    await revealItemInDir(`${archivePath}/${image.file_path}`);
  };

  const handleAddToGroup = async () => {
    if (!addingGroupId) return;
    try {
      await invoke('add_image_to_group', { imageId: image.id, groupId: Number(addingGroupId) });
      setImageGroups(prev => [...prev, Number(addingGroupId)]);
      setAddingGroupId('');
    } catch (e) {
      console.error('Failed to add to group:', e);
    }
  };

  const handleRemoveFromGroup = async (groupId: number) => {
    try {
      await invoke('remove_image_from_group', { imageId: image.id, groupId });
      setImageGroups(prev => prev.filter(id => id !== groupId));
    } catch (e) {
      console.error('Failed to remove from group:', e);
    }
  };

  const currentGroups = availableGroups.filter(g => imageGroups.includes(g.id));
  const addableGroups = availableGroups.filter(g => !imageGroups.includes(g.id));

  return (
    <>
      {/* Metadata fields */}
      <div className="space-y-3 text-sm">
        <Field label={t('detail.filename')} value={image.filename} truncate />

        <div>
          <p className="text-[10px] text-foreground/45 uppercase tracking-wide mb-0.5">
            {t('detail.dateTaken')}
          </p>
          <p className="text-foreground flex items-center gap-2">
            {image.taken_at
              ? formatDate(image.taken_at, t('detail.noDate'))
              : <span className="text-foreground/45">{t('detail.noDate')}</span>
            }
            {image.taken_at && image.date_source === 'filename' && (
              <span className="text-[10px] bg-primary/12 text-primary px-1.5 py-0.5 rounded-full">
                {t('common.dateFromFilename')}
              </span>
            )}
            {image.taken_at && image.date_source === 'mtime' && (
              <span className="text-[10px] bg-[rgba(230,168,23,0.15)] text-[#A87B0A] px-1.5 py-0.5 rounded-full">
                {t('detail.noExif')}
              </span>
            )}
          </p>
        </div>

        {image.width && image.height && (
          <Field label={t('detail.dimensions')} value={`${image.width} × ${image.height}`} />
        )}

        {image.file_size && (
          <Field label={t('detail.fileSize')} value={formatSize(image.file_size)} />
        )}

        <Field label={t('detail.imported')} value={formatDate(image.imported_at, '—')} />

        <div>
          <p className="text-[10px] text-foreground/45 mb-0.5 uppercase tracking-wide">
            {t('detail.id')}
          </p>
          <p className="text-xs font-mono text-muted-foreground truncate" title={image.id}>
            {image.id.substring(0, 16)}…
          </p>
        </div>

        <button
          onClick={handleShowInFolder}
          className="mt-1 w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg border border-foreground/18 text-foreground/65 hover:text-primary hover:border-primary transition-colors text-xs font-medium"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
              d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
          </svg>
          {t('detail.showInFolder')}
        </button>
      </div>

      {/* Groups section */}
      {!hideGroups && <div className="pt-3 mt-1 border-t border-border">
        <p className="text-xs font-semibold text-foreground uppercase tracking-wide mb-2">
          {t('nav.groups')}
        </p>

        {currentGroups.length === 0 ? (
          <p className="text-xs text-foreground/45 mb-2">{t('detail.noGroups')}</p>
        ) : (
          <div className="flex flex-wrap gap-1 mb-2">
            {currentGroups.map((g: GroupWithCount) => (
              <span
                key={g.id}
                className="inline-flex items-center gap-1 px-2 py-0.5 bg-primary/12 text-primary rounded-full text-xs"
              >
                {g.name}
                <button
                  onClick={() => handleRemoveFromGroup(g.id)}
                  className="hover:text-destructive transition-colors leading-none"
                  title={t('detail.removeFromGroup')}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}

        {addableGroups.length > 0 && (
          <div className="flex gap-1">
            <select
              value={addingGroupId}
              onChange={(e) => setAddingGroupId(e.target.value ? Number(e.target.value) : '')}
              className="flex-1 px-2 py-1 bg-muted border border-border rounded text-xs text-foreground"
            >
              <option value="">{t('detail.addToGroup')}</option>
              {addableGroups.map((g: GroupWithCount) => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
            <button
              onClick={handleAddToGroup}
              disabled={!addingGroupId}
              className="px-2 py-1 bg-primary text-primary-foreground rounded text-xs disabled:opacity-40"
            >
              +
            </button>
          </div>
        )}
      </div>}
    </>
  );
}
