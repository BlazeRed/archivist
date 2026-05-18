import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/core';
import { convertFileSrc } from '@tauri-apps/api/core';
import { revealItemInDir } from '@tauri-apps/plugin-opener';
import { useTimelineStore } from '../stores/timelineStore';
import { useAppConfigStore } from '../stores/appConfigStore';
import type { GroupWithCount } from '../types';

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

export function ImageDetail() {
  const { t } = useTranslation();
  const { selectedImage, selectImage, availableGroups } = useTimelineStore();
  const { config } = useAppConfigStore();

  const [imageGroups, setImageGroups] = useState<number[]>([]);
  const [addingGroupId, setAddingGroupId] = useState<number | ''>('');
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imgSrc, setImgSrc] = useState('');

  const archivePath = config.archive_path.replace(/\/+$/, '');

  useEffect(() => {
    if (!selectedImage) { setImageGroups([]); setImgSrc(''); return; }
    setImageLoaded(false);
    setImgSrc('');
    invoke<number[]>('get_groups_for_image', { imageId: selectedImage.id })
      .then(setImageGroups)
      .catch(() => setImageGroups([]));
    const url = archivePath
      ? convertFileSrc(`${archivePath}/${selectedImage.file_path}`)
      : '';
    const id = requestAnimationFrame(() => setImgSrc(url));
    return () => cancelAnimationFrame(id);
  }, [selectedImage, archivePath]);

  if (!selectedImage) return null;

  const handleAddToGroup = async () => {
    if (!addingGroupId || !selectedImage) return;
    try {
      await invoke('add_image_to_group', { imageId: selectedImage.id, groupId: Number(addingGroupId) });
      setImageGroups(prev => [...prev, Number(addingGroupId)]);
      setAddingGroupId('');
    } catch (e) {
      console.error('Failed to add to group:', e);
    }
  };

  const handleShowInFolder = async () => {
    if (!archivePath || !selectedImage) return;
    await revealItemInDir(`${archivePath}/${selectedImage.file_path}`);
  };

  const handleRemoveFromGroup = async (groupId: number) => {
    if (!selectedImage) return;
    try {
      await invoke('remove_image_from_group', { imageId: selectedImage.id, groupId });
      setImageGroups(prev => prev.filter(id => id !== groupId));
    } catch (e) {
      console.error('Failed to remove from group:', e);
    }
  };

  const currentGroups = availableGroups.filter(g => imageGroups.includes(g.id));
  const addableGroups = availableGroups.filter(g => !imageGroups.includes(g.id));

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      onClick={() => selectImage(null)}
    >
      <div
        className="bg-[#E8F3FB] rounded-xl max-w-5xl w-full max-h-[90vh] flex overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Image */}
        <div className="flex-1 bg-[#001A36] flex items-center justify-center p-4 min-w-0 relative">
          {(!imgSrc || !imageLoaded) && (
            <svg className="animate-spin size-8 text-white/40" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
            </svg>
          )}
          <img
            src={imgSrc}
            alt={selectedImage.filename}
            decoding="async"
            onLoad={() => setImageLoaded(true)}
            className={`max-w-full max-h-[80vh] object-contain transition-opacity duration-200 ${imageLoaded ? 'opacity-100' : 'opacity-0 absolute'}`}
          />
        </div>

        {/* Details panel */}
        <div className="w-72 flex flex-col bg-[#E8F3FB] overflow-y-auto">
          {/* Header */}
          <div className="flex justify-between items-center px-4 py-3 border-b border-[rgba(0,45,88,0.12)]">
            <h3 className="text-sm font-semibold text-[#002D58]">{t('detail.title')}</h3>
            <button
              onClick={() => selectImage(null)}
              className="text-[rgba(0,45,88,0.55)] hover:text-[#0084C5] transition-colors"
              title={t('common.close')}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Metadata */}
          <div className="px-4 py-3 space-y-3 text-sm flex-1">
            <Field label={t('detail.filename')} value={selectedImage.filename} truncate />

            <div>
              <p className="text-[10px] text-[rgba(0,45,88,0.45)] uppercase tracking-wide mb-0.5">
                {t('detail.dateTaken')}
              </p>
              <p className="text-[#002D58] flex items-center gap-2">
                {selectedImage.taken_at
                  ? formatDate(selectedImage.taken_at, t('detail.noDate'))
                  : <span className="text-[rgba(0,45,88,0.45)]">{t('detail.noDate')}</span>
                }
                {selectedImage.taken_at && selectedImage.date_source === 'filename' && (
                  <span className="text-[10px] bg-[rgba(0,132,197,0.12)] text-[#0084C5] px-1.5 py-0.5 rounded-full">
                    {t('common.dateFromFilename')}
                  </span>
                )}
                {selectedImage.taken_at && selectedImage.date_source === 'created' && (
                  <span className="text-[10px] bg-[rgba(42,158,173,0.12)] text-[#2A9EAD] px-1.5 py-0.5 rounded-full">
                    {t('common.dateFromCreatedTime')}
                  </span>
                )}
                {selectedImage.taken_at && selectedImage.date_source === 'mtime' && (
                  <span className="text-[10px] bg-[rgba(230,168,23,0.15)] text-[#A87B0A] px-1.5 py-0.5 rounded-full">
                    {t('detail.noExif')}
                  </span>
                )}
              </p>
            </div>

            {selectedImage.width && selectedImage.height && (
              <Field
                label={t('detail.dimensions')}
                value={`${selectedImage.width} × ${selectedImage.height}`}
              />
            )}

            {selectedImage.file_size && (
              <Field label={t('detail.fileSize')} value={formatSize(selectedImage.file_size)} />
            )}

            <Field label={t('detail.imported')} value={formatDate(selectedImage.imported_at, '—')} />

            <div>
              <p className="text-[10px] text-[rgba(0,45,88,0.45)] mb-0.5 uppercase tracking-wide">
                {t('detail.id')}
              </p>
              <p className="text-xs font-mono text-[rgba(0,45,88,0.55)] truncate" title={selectedImage.id}>
                {selectedImage.id.substring(0, 16)}…
              </p>
            </div>

            <button
              onClick={handleShowInFolder}
              className="mt-1 w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg border border-[rgba(0,45,88,0.18)] text-[rgba(0,45,88,0.65)] hover:text-[#0084C5] hover:border-[#0084C5] transition-colors text-xs font-medium"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
                  d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
              </svg>
              {t('detail.showInFolder')}
            </button>
          </div>

          {/* Groups section */}
          <div className="px-4 py-3 border-t border-[rgba(0,45,88,0.12)]">
            <p className="text-xs font-semibold text-[#002D58] uppercase tracking-wide mb-2">
              {t('nav.groups')}
            </p>

            {currentGroups.length === 0 ? (
              <p className="text-xs text-[rgba(0,45,88,0.45)] mb-2">{t('detail.noGroups')}</p>
            ) : (
              <div className="flex flex-wrap gap-1 mb-2">
                {currentGroups.map((g: GroupWithCount) => (
                  <span
                    key={g.id}
                    className="inline-flex items-center gap-1 px-2 py-0.5 bg-[rgba(0,132,197,0.12)] text-[#0084C5] rounded-full text-xs"
                  >
                    {g.name}
                    <button
                      onClick={() => handleRemoveFromGroup(g.id)}
                      className="hover:text-[#C0392B] transition-colors leading-none"
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
                  className="flex-1 px-2 py-1 bg-[#F4F9FD] border border-[rgba(0,45,88,0.28)] rounded text-xs text-[#002D58]"
                >
                  <option value="">{t('detail.addToGroup')}</option>
                  {addableGroups.map((g: GroupWithCount) => (
                    <option key={g.id} value={g.id}>{g.name}</option>
                  ))}
                </select>
                <button
                  onClick={handleAddToGroup}
                  disabled={!addingGroupId}
                  className="px-2 py-1 bg-[#0084C5] text-white rounded text-xs disabled:opacity-40"
                >
                  +
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  truncate,
}: {
  label: string;
  value: string;
  truncate?: boolean;
}) {
  return (
    <div>
      <p className="text-[10px] text-[rgba(0,45,88,0.45)] uppercase tracking-wide mb-0.5">{label}</p>
      <p className={`text-[#002D58] ${truncate ? 'truncate' : ''}`}>{value}</p>
    </div>
  );
}
