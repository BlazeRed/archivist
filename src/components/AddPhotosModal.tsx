import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/core';
import { convertFileSrc } from '@tauri-apps/api/core';
import { useAppConfigStore } from '../stores/appConfigStore';
import type { Image } from '../types';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';

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
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="w-[90vw] max-w-[90vw] h-[85vh] max-h-[85vh] p-0 flex flex-col overflow-hidden">
        <DialogHeader className="flex-shrink-0 px-6 py-4 border-b border-border bg-card">
          <DialogTitle className="text-foreground">{t('groups.addPhotosTitle')}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-1 min-h-0">
          {/* Filter sidebar */}
          <aside className="w-52 flex-shrink-0 p-4 border-r border-border bg-card flex flex-col gap-3">
            <h3 className="text-sm font-semibold text-foreground">{t('timeline.filter')}</h3>

            <Select
              value={filterYear?.toString() ?? ''}
              onValueChange={(v) => {
                setFilterYear(Number(v));
                setFilterMonth(null);
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder={t('timeline.allYears')} />
              </SelectTrigger>
              <SelectContent>
                {availableYears.map(y => (
                  <SelectItem key={y} value={y.toString()}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {filterYear && (
              <Select
                value={filterMonth?.toString() ?? ''}
                onValueChange={(v) => setFilterMonth(Number(v))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={t('timeline.allMonths')} />
                </SelectTrigger>
                <SelectContent>
                  {availableMonths.map(m => (
                    <SelectItem key={m} value={m.toString()}>{MONTH_NAMES[m - 1]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            <p className="text-xs text-muted-foreground mt-auto">
              {filteredImages.length} {t('timeline.photos')}
            </p>
          </aside>

          {/* Image grid */}
          <main className="flex-1 overflow-y-auto p-4">
            {filteredImages.length === 0 ? (
              <div className="flex items-center justify-center h-full">
                <p className="text-muted-foreground text-sm">{t('groups.allPhotosAdded')}</p>
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
                          ? 'border-primary ring-2 ring-primary/30'
                          : 'border-transparent hover:border-primary/40'
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

                      <div
                        className={`absolute top-1.5 left-1.5 w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${
                          isSelected
                            ? 'bg-primary border-primary'
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

                      <div className="p-1.5 bg-card">
                        <p className="text-[10px] text-foreground truncate font-medium">{img.filename}</p>
                        <p className="text-[9px] text-muted-foreground">
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
        <div className="flex items-center gap-4 px-6 py-4 border-t border-border bg-foreground flex-shrink-0">
          <span className="text-background text-sm font-medium">
            {t('timeline.selected', { count: selectedIds.size })}
          </span>
          <div className="ml-auto flex gap-3">
            <Button
              onClick={handleAdd}
              disabled={selectedIds.size === 0 || adding}
            >
              {selectedIds.size > 0
                ? t('groups.addPhotosConfirm', { count: selectedIds.size })
                : t('groups.addPhotosTitle')}
            </Button>
            <Button variant="outline" onClick={onClose} className="border-white/30 text-background hover:text-foreground">
              {t('common.cancel')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
