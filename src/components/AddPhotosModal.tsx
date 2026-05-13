import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/core';
import { convertFileSrc } from '@tauri-apps/api/core';
import { useAppConfigStore } from '../stores/appConfigStore';
import type { Image } from '../types';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

interface Props {
  groupId: number;
  existingImageIds: Set<string>;
  onClose: () => void;
  onAdded: () => void;
}

export function AddPhotosModal({ groupId, existingImageIds, onClose, onAdded }: Props) {
  const { t } = useTranslation();
  const { config } = useAppConfigStore();
  const [allImages, setAllImages] = useState<Image[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [filterYear, setFilterYear] = useState<number | null>(null);
  const [filterMonth, setFilterMonth] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);

  const archivePath = config.archive_path.replace(/\/+$/, '');

  useEffect(() => {
    invoke<Image[]>('get_all_images').then(imgs => {
      setAllImages(imgs.filter(img => !existingImageIds.has(img.id)));
    });
  }, [existingImageIds]);

  const availableYears = useMemo(() => {
    const years = new Set(
      allImages.filter(img => img.taken_at).map(img => new Date(img.taken_at!).getFullYear())
    );
    return [...years].sort((a, b) => b - a);
  }, [allImages]);

  const availableMonths = useMemo(() => {
    if (!filterYear) return [];
    const months = new Set(
      allImages
        .filter(img => img.taken_at && new Date(img.taken_at).getFullYear() === filterYear)
        .map(img => new Date(img.taken_at!).getMonth() + 1)
    );
    return [...months].sort((a, b) => a - b);
  }, [allImages, filterYear]);

  const filteredImages = useMemo(() => {
    let result = allImages;
    if (filterYear !== null) {
      result = result.filter(img => {
        if (!img.taken_at) return false;
        return new Date(img.taken_at).getFullYear() === filterYear;
      });
      if (filterMonth !== null) {
        result = result.filter(img => {
          if (!img.taken_at) return false;
          return new Date(img.taken_at).getMonth() + 1 === filterMonth;
        });
      }
    }
    return result;
  }, [allImages, filterYear, filterMonth]);

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleAdd = async () => {
    if (selectedIds.size === 0) return;
    setAdding(true);
    try {
      for (const imageId of selectedIds) {
        await invoke('add_image_to_group', { imageId, groupId });
      }
      onAdded();
    } catch (e) {
      console.error('Failed to add images to group:', e);
    }
    setAdding(false);
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-[#D2E8F7] w-[90vw] h-[85vh] rounded-xl flex flex-col overflow-hidden shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[rgba(0,45,88,0.15)] bg-[#E8F3FB] flex-shrink-0">
          <h2 className="text-lg font-medium text-[#002D58]">{t('groups.addPhotosTitle')}</h2>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-full flex items-center justify-center text-[rgba(0,45,88,0.55)] hover:text-[#002D58] hover:bg-[rgba(0,45,88,0.08)] text-xl leading-none transition-colors"
          >
            ×
          </button>
        </div>

        <div className="flex flex-1 min-h-0">
          {/* Filter sidebar */}
          <aside className="w-52 flex-shrink-0 p-4 border-r border-[rgba(0,45,88,0.15)] bg-[#E8F3FB] flex flex-col gap-3">
            <h3 className="text-sm font-semibold text-[#002D58]">{t('timeline.filter')}</h3>

            <select
              value={filterYear ?? ''}
              onChange={(e) => {
                setFilterYear(e.target.value ? Number(e.target.value) : null);
                setFilterMonth(null);
              }}
              className="w-full px-3 py-2 bg-[#F4F9FD] border border-[rgba(0,45,88,0.28)] rounded-lg text-sm text-[#002D58]"
            >
              <option value="">{t('timeline.allYears')}</option>
              {availableYears.map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>

            {filterYear && (
              <select
                value={filterMonth ?? ''}
                onChange={(e) => setFilterMonth(e.target.value ? Number(e.target.value) : null)}
                className="w-full px-3 py-2 bg-[#F4F9FD] border border-[rgba(0,45,88,0.28)] rounded-lg text-sm text-[#002D58]"
              >
                <option value="">{t('timeline.allMonths')}</option>
                {availableMonths.map(m => (
                  <option key={m} value={m}>{MONTH_NAMES[m - 1]}</option>
                ))}
              </select>
            )}

            <p className="text-xs text-[rgba(0,45,88,0.55)] mt-auto">
              {filteredImages.length} {t('timeline.photos')}
            </p>
          </aside>

          {/* Image grid */}
          <main className="flex-1 overflow-y-auto p-4">
            {filteredImages.length === 0 ? (
              <div className="flex items-center justify-center h-full">
                <p className="text-[rgba(0,45,88,0.55)] text-sm">{t('groups.allPhotosAdded')}</p>
              </div>
            ) : (
              <div
                className="grid gap-2"
                style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))' }}
              >
                {filteredImages.map(img => {
                  const url = archivePath
                    ? convertFileSrc(`${archivePath}/${img.file_path}`)
                    : '';
                  const isSelected = selectedIds.has(img.id);
                  return (
                    <div
                      key={img.id}
                      onClick={() => toggleSelect(img.id)}
                      className={`relative cursor-pointer rounded-lg overflow-hidden border-2 transition-all ${
                        isSelected
                          ? 'border-[#0084C5] ring-2 ring-[#0084C5]/30'
                          : 'border-transparent hover:border-[rgba(0,132,197,0.4)]'
                      }`}
                    >
                      <div className="aspect-square bg-[#001A36] overflow-hidden">
                        {url && (
                          <img
                            src={url}
                            alt={img.filename}
                            className="w-full h-full object-cover"
                            loading="lazy"
                          />
                        )}
                      </div>

                      {/* Checkbox overlay */}
                      <div
                        className={`absolute top-1.5 left-1.5 w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${
                          isSelected
                            ? 'bg-[#0084C5] border-[#0084C5]'
                            : 'bg-black/30 border-white/70'
                        }`}
                      >
                        {isSelected && (
                          <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 12 12">
                            <path
                              d="M2 6l3 3 5-5"
                              stroke="currentColor"
                              strokeWidth="1.5"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        )}
                      </div>

                      <div className="p-1.5 bg-[#E8F3FB]">
                        <p className="text-[10px] text-[#002D58] truncate font-medium">{img.filename}</p>
                        <p className="text-[9px] text-[rgba(0,45,88,0.45)]">
                          {img.taken_at
                            ? new Date(img.taken_at).toLocaleDateString()
                            : t('detail.noDate')}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </main>
        </div>

        {/* Action bar */}
        <div className="flex items-center gap-4 px-6 py-4 border-t border-[rgba(0,45,88,0.15)] bg-[#002D58] flex-shrink-0">
          <span className="text-[#D2E8F7] text-sm font-medium">
            {t('timeline.selected', { count: selectedIds.size })}
          </span>
          <div className="ml-auto flex gap-3">
            <button
              onClick={handleAdd}
              disabled={selectedIds.size === 0 || adding}
              className="px-4 py-2 bg-[#0084C5] text-white rounded-lg text-sm font-medium disabled:opacity-40 transition-opacity"
            >
              {selectedIds.size > 0
                ? t('groups.addPhotosConfirm', { count: selectedIds.size })
                : t('groups.addPhotosTitle')}
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2 border border-[rgba(255,255,255,0.3)] text-[#D2E8F7] rounded-lg text-sm"
            >
              {t('common.cancel')}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
