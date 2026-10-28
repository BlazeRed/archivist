import { useState, useEffect, useMemo, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import { applyClientFilter, normalizeFilter, EMPTY_FILTER, type TimelineFilter } from "../stores/timelineStore";
import { useGridSelection } from "../hooks/useGridSelection";
import { MonthGrid, FLOATING_ROW, type DateField } from "./ThumbnailGrid";
import { FilterPopover } from "./FilterPopover";
import { BottomFade, InfoPill, SelectionCountPill } from "./FloatingSelectionBar";
import type { Image } from "../types";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Button } from "@/components/ui/button";

// The floating row sits one floating inset (12px) from the top of the dialog
const INSET_TOP = 12 + FLOATING_ROW;

interface Props {
  groupId: number;
  groupName: string;
  onClose: () => void;
  onAdded: () => void;
}

/** Picks media to add to a group. Timeline look inside a near-fullscreen dialog: virtualized month grid
 *  under floating chrome, same filters as the timeline (local state), click/Shift-click selection. */
export function AddMediaModal({ groupId, groupName, onClose, onAdded }: Props) {
  const { t } = useTranslation();
  const [allImages, setAllImages] = useState<Image[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilterState] = useState<TimelineFilter>(EMPTY_FILTER);
  const [sortBy, setSortBy] = useState<DateField>("taken_at");
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const [existingIds, imgs] = await Promise.all([
          invoke<string[]>("get_images_in_group", { groupId }),
          invoke<Image[]>("get_all_images"),
        ]);
        const existing = new Set(existingIds);
        setAllImages(imgs.filter((img) => !existing.has(img.id)));
      } catch (e) {
        console.error("Failed to load media:", e);
        toast.error(t("groups.loadMediaError"));
      }
      setLoading(false);
    }
    load();
  }, [groupId, t]);

  const setFilter = useCallback((partial: Partial<TimelineFilter>) => {
    setFilterState((prev) => normalizeFilter(prev, partial));
  }, []);

  const availableYears = useMemo(
    () => [...new Set(allImages.filter((img) => img.taken_at).map((img) => new Date(img.taken_at!).getFullYear()))].sort((a, b) => b - a),
    [allImages],
  );

  // Taken-at order comes from the backend (same as the timeline); "recently added" re-sorts by import date
  const visibleImages = useMemo(() => {
    const filtered = applyClientFilter(allImages, filter, null);
    return sortBy === "imported_at"
      ? [...filtered].sort((a, b) => b.imported_at.localeCompare(a.imported_at))
      : filtered;
  }, [allImages, filter, sortBy]);

  const { selected, clearSelection, toggle, handleClick, setMany } = useGridSelection(visibleImages);

  const handleSelectMonth = useCallback((imgs: Image[]) => {
    setMany(imgs.map((img) => img.id), !imgs.every((img) => selected.has(img.id)));
  }, [selected, setMany]);

  const handleAdd = async () => {
    if (selected.size === 0) return;
    setAdding(true);
    try {
      await invoke("add_images_to_group_bulk", { imageIds: [...selected], groupId });
      onAdded();
    } catch (e) {
      console.error("Failed to add images to group:", e);
      toast.error(t("groups.addMediaError"));
    } finally {
      setAdding(false);
    }
  };

  const countLabel = visibleImages.length !== allImages.length
    ? `${visibleImages.length} / ${allImages.length} ${t("timeline.items")}`
    : `${allImages.length} ${t("timeline.items")}`;

  const emptyText = loading
    ? t("common.loading")
    : allImages.length === 0 ? t("groups.allMediaAdded") : t("timeline.noMedia");

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent
        showCloseButton={false}
        aria-describedby={undefined}
        // Layered Esc: the first one clears the selection, the next closes the dialog
        onEscapeKeyDown={(e) => {
          if (selected.size > 0) {
            e.preventDefault();
            clearSelection();
          }
        }}
        className="inset-3 translate-x-0 translate-y-0 w-auto max-w-none sm:max-w-none block p-0 overflow-hidden bg-background"
      >
        <MonthGrid
          images={visibleImages}
          dateField={sortBy}
          emptyText={emptyText}
          isSelectionMode
          selectedIds={selected}
          onImageClick={handleClick}
          onToggleSelect={toggle}
          onSelectMonth={handleSelectMonth}
          insetTop={INSET_TOP}
          leading={
            <div className="h-9 flex items-center px-4 rounded-full bg-popover shadow-float min-w-0">
              <DialogTitle className="text-[13px] font-semibold text-popover-foreground truncate">
                {t("groups.addMediaTo", { name: groupName })}
              </DialogTitle>
            </div>
          }
          toolbar={
            <div className="flex items-center gap-2">
              <InfoPill>
                {countLabel}
              </InfoPill>
              <FilterPopover
                filter={filter}
                setFilter={setFilter}
                allImages={allImages}
                availableYears={availableYears}
              >
                <ToggleGroup
                  type="single"
                  variant="segmented"
                  spacing={0.5}
                  value={sortBy}
                  onValueChange={(v) => { if (v) setSortBy(v as DateField); }}
                  className="bg-muted rounded-full p-[3px] shrink-0"
                >
                  <ToggleGroupItem value="taken_at" className="px-3 text-xs">{t("groups.sortByDate")}</ToggleGroupItem>
                  <ToggleGroupItem value="imported_at" className="px-3 text-xs">{t("groups.sortByRecent")}</ToggleGroupItem>
                </ToggleGroup>
              </FilterPopover>
            </div>
          }
        />

        <BottomFade height={INSET_TOP + 8} />

        {/* Floating actions, bottom-right: Cancel first, as in every dialog */}
        <div className="absolute bottom-3 right-4 z-20 flex items-center gap-2">
          {selected.size > 0 && <SelectionCountPill count={selected.size} onClear={clearSelection} tooltipSide="top" />}
          <Button size="lg" variant="outline" className="bg-popover hover:bg-card shadow-float" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          {/* Disabled stays opaque (muted fill): a translucent pill would let the photos show through */}
          <Button
            size="lg"
            variant="violet"
            className="shadow-float disabled:opacity-100 disabled:bg-muted disabled:text-muted-foreground"
            onClick={handleAdd}
            disabled={selected.size === 0 || adding}
          >
            {selected.size > 0
              ? t("groups.addMediaConfirm", { count: selected.size })
              : t("groups.addMediaTitle")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
