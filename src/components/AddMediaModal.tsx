import { useState, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import { getThumbnailUrl } from "@/lib/archivePath";
import { yearMonthKey, parseYearMonth } from "@/lib/dateKeys";
import { useAppConfigStore } from "../stores/appConfigStore";
import type { Image } from "../types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { useMonthNames } from "@/lib/months";
import { cn } from "@/lib/utils";

function groupByDate(images: Image[], sortField: 'taken_at' | 'imported_at', monthNames: string[]) {
  const map = new Map<string, Image[]>();
  for (const img of images) {
    const dateStr = sortField === 'imported_at' ? img.imported_at : img.taken_at;
    const key = yearMonthKey(dateStr);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(img);
  }
  const sortedKeys = [...map.keys()].sort((a, b) => {
    if (a === "__nodate__") return 1;
    if (b === "__nodate__") return -1;
    return b.localeCompare(a);
  });
  return sortedKeys.map((key) => {
    const imgs = map.get(key)!.sort((a, b) => {
      const da = sortField === 'imported_at' ? a.imported_at : (a.taken_at ?? '');
      const db2 = sortField === 'imported_at' ? b.imported_at : (b.taken_at ?? '');
      return db2.localeCompare(da);
    });
    return {
      key,
      label:
        key === "__nodate__"
          ? "No Date"
          : (() => {
              const ym = parseYearMonth(key)!;
              return `${ym.year}  ›  ${monthNames[ym.month - 1]}`;
            })(),
      images: imgs,
    };
  });
}

interface Props {
  groupId: number;
  onClose: () => void;
  onAdded: () => void;
}

export function AddMediaModal({
  groupId,
  onClose,
  onAdded,
}: Props) {
  const { t } = useTranslation();
  const monthNames = useMonthNames();
  const { config } = useAppConfigStore();
  const [allImages, setAllImages] = useState<Image[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [yearFrom, setYearFrom] = useState<number | null>(null);
  const [yearTo, setYearTo] = useState<number | null>(null);
  const [filterMonth, setFilterMonth] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [sortBy, setSortBy] = useState<'taken_at' | 'imported_at'>('taken_at');

  const archivePath = config.archive_path;
  const thumbPx = config.thumbnail_size === 'small' ? 120 : config.thumbnail_size === 'large' ? 280 : 180;

  useEffect(() => {
    async function load() {
      const [existingIds, imgs] = await Promise.all([
        invoke<string[]>("get_images_in_group", { groupId }),
        invoke<Image[]>("get_all_images"),
      ]);
      const existingSet = new Set(existingIds);
      setAllImages(imgs.filter((img) => !existingSet.has(img.id)));
    }
    load();
  }, [groupId]);

  // oldest → newest for slider (left → right)
  const years = useMemo(() => {
    const set = new Set(
      allImages
        .filter((img) => img.taken_at)
        .map((img) => new Date(img.taken_at!).getFullYear()),
    );
    return [...set].sort((a, b) => a - b);
  }, [allImages]);

  const availableMonths = useMemo(() => {
    if (yearFrom === null || yearFrom !== yearTo) return [];
    const months = new Set(
      allImages
        .filter(
          (img) =>
            img.taken_at && new Date(img.taken_at).getFullYear() === yearFrom,
        )
        .map((img) => new Date(img.taken_at!).getMonth() + 1),
    );
    return [...months].sort((a, b) => a - b);
  }, [allImages, yearFrom, yearTo]);

  const filteredImages = useMemo(() => {
    let result = allImages;
    if (yearFrom !== null && yearTo !== null) {
      result = result.filter((img) => {
        if (!img.taken_at) return false;
        const y = new Date(img.taken_at).getFullYear();
        return y >= yearFrom && y <= yearTo;
      });
      if (yearFrom === yearTo && filterMonth !== null) {
        result = result.filter((img) =>
          img.taken_at
            ? new Date(img.taken_at).getMonth() + 1 === filterMonth
            : false,
        );
      }
    }
    return result;
  }, [allImages, yearFrom, yearTo, filterMonth]);

  const groups = useMemo(() => groupByDate(filteredImages, sortBy, monthNames), [filteredImages, sortBy, monthNames]);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
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
        await invoke("add_image_to_group", { imageId, groupId });
      }
      onAdded();
    } catch (e) {
      console.error("Failed to add images to group:", e);
    }
    setAdding(false);
  };

  const fromIdx = yearFrom !== null ? years.indexOf(yearFrom) : 0;
  const toIdx = yearTo !== null ? years.indexOf(yearTo) : years.length - 1;
  const rangeLabel =
    yearFrom === null
      ? t("timeline.allYears")
      : yearFrom === yearTo
        ? String(yearFrom)
        : `${yearFrom} – ${yearTo}`;

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="w-[95vw] max-w-[95vw] sm:max-w-[95vw] h-[90vh] max-h-[90vh] p-0 flex flex-col overflow-hidden bg-background">
        <DialogHeader className="shrink-0 px-6 py-4 border-b border-border bg-card">
          <DialogTitle className="text-foreground">
            {t("groups.addMediaTitle")}
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-1 min-h-0">
          {/* Filter sidebar — same width and structure as TimelinePage */}
          <aside className="w-56 shrink-0 p-4 border-r border-border bg-card overflow-y-auto">
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-foreground">
                {t("timeline.filter")}
              </h3>

              <div className="flex rounded-md border border-border overflow-hidden text-xs">
                <button
                  className={cn('flex-1 px-2 py-1 transition-colors', sortBy === 'taken_at' ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:bg-muted')}
                  onClick={() => setSortBy('taken_at')}
                >
                  {t('groups.sortByDate')}
                </button>
                <button
                  className={cn('flex-1 px-2 py-1 transition-colors border-l border-border', sortBy === 'imported_at' ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:bg-muted')}
                  onClick={() => setSortBy('imported_at')}
                >
                  {t('groups.sortByRecent')}
                </button>
              </div>

              {years.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">
                      {years[0]}
                    </span>
                    <span className="text-sm font-medium text-foreground">
                      {rangeLabel}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {years[years.length - 1]}
                    </span>
                  </div>
                  <Slider
                    min={0}
                    max={Math.max(years.length - 1, 1)}
                    step={1}
                    value={[fromIdx, Math.max(toIdx, fromIdx)]}
                    onValueChange={([from, to]) => {
                      setYearFrom(years[from]);
                      setYearTo(years[to]);
                      setFilterMonth(null);
                    }}
                  />
                </div>
              )}

              {yearFrom !== null &&
                yearFrom === yearTo &&
                availableMonths.length > 0 && (
                  <Select
                    value={filterMonth?.toString() ?? ""}
                    onValueChange={(v) => setFilterMonth(Number(v))}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder={t("timeline.allMonths")} />
                    </SelectTrigger>
                    <SelectContent>
                      {availableMonths.map((m) => (
                        <SelectItem key={m} value={m.toString()}>
                          {monthNames[m - 1]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}

              <p className="text-xs text-muted-foreground">
                {filteredImages.length} {t("timeline.items")}
              </p>
            </div>
          </aside>

          {/* Image grid — grouped by month with sticky headers, same pattern as ThumbnailGrid */}
          <main className="flex-1 overflow-y-auto">
            {filteredImages.length === 0 ? (
              <div className="flex items-center justify-center h-full">
                <p className="text-muted-foreground text-sm">
                  {t("groups.allMediaAdded")}
                </p>
              </div>
            ) : (
              groups.map((group) => (
                <div key={group.key}>
                  <div className="sticky top-0 z-10 flex items-center h-10 px-6 bg-background/95 backdrop-blur-sm border-b border-border">
                    <span className="text-[13px] font-semibold text-foreground tracking-wide">
                      {group.label}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2 px-6 py-3">
                    {group.images.map((img) => {
                      const thumbnailUrl = getThumbnailUrl(archivePath, img.thumbnail_path);
                      const isSelected = selectedIds.has(img.id);
                      return (
                        <div
                          key={img.id}
                          onClick={() => toggleSelect(img.id)}
                          className={`relative cursor-pointer rounded-md overflow-hidden border-2 transition-all shrink-0 ${
                            isSelected
                              ? "border-primary ring-2 ring-primary/30"
                              : "border-transparent hover:border-primary/40"
                          }`}
                          style={{ width: thumbPx, height: thumbPx }}
                        >
                          <div className="w-full h-full bg-card flex flex-col items-center justify-center">
                            {thumbnailUrl ? (
                              <img
                                src={thumbnailUrl}
                                alt={img.filename}
                                className="w-full h-full object-cover"
                                loading="lazy"
                              />
                            ) : (
                              <div className="flex flex-col items-center justify-center gap-1 text-muted-foreground">
                                <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                                  <line x1="3" y1="3" x2="21" y2="21"/>
                                  <circle cx="8.5" cy="8.5" r="1.5"/>
                                </svg>
                                <p className="text-[9px] text-center px-1 leading-tight">{t('common.noThumbnail')}</p>
                              </div>
                            )}
                          </div>

                          <div
                            className={`absolute top-1.5 left-1.5 w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${
                              isSelected
                                ? "bg-primary border-primary"
                                : "bg-black/30 border-white/70"
                            }`}
                          >
                            {isSelected && (
                              <svg
                                className="w-3 h-3 text-white"
                                fill="none"
                                viewBox="0 0 12 12"
                              >
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

                          <div className="absolute bottom-0 left-0 right-0 bg-foreground/60 px-1 py-0.5">
                            <p className="text-[10px] text-white truncate">
                              {img.filename}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </main>
        </div>

        {/* Action bar */}
        <div className="flex items-center gap-4 px-6 py-4 border-t border-border bg-foreground shrink-0">
          <span className="text-background text-sm font-medium">
            {t("timeline.selected", { count: selectedIds.size })}
          </span>
          <div className="ml-auto flex gap-3">
            <Button
              onClick={handleAdd}
              disabled={selectedIds.size === 0 || adding}
            >
              {selectedIds.size > 0
                ? t("groups.addMediaConfirm", { count: selectedIds.size })
                : t("groups.addMediaTitle")}
            </Button>
            <Button variant="secondary" onClick={onClose}>
              {t("common.cancel")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
