import { useState, useEffect, type CSSProperties, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { toast } from 'sonner';
import { getThumbnailUrl } from '@/lib/archivePath';
import { useGroupStore } from '../stores/dataStore';
import { useGroupUIStore } from '../stores/groupUIStore';
import { useAppConfigStore } from '../stores/appConfigStore';
import { useTimelineStore } from '../stores/timelineStore';
import { useUIStore } from '../stores/uiStore';
import { useGridSelection } from '../hooks/useGridSelection';
import { AddMediaModal } from '../components/AddMediaModal';
import { ImageDetail } from '../components/ImageDetail';
import { MediaButton, CHROME_BUTTON } from '../components/ImagePreview';
import { ThumbnailCell, SIZES, FLOATING_TOP, type SizeKey } from '../components/ThumbnailGrid';
import type { Image, GroupWithCount } from '../types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface ExportResult {
  copied: number;
  errors: string[];
  dest_path: string;
}

const PILL = 'cursor-default select-none h-9 px-4 border-0 bg-popover text-popover-foreground shadow-float';

export function GroupsPage() {
  const { t } = useTranslation();
  const { groups, fetchGroups, createGroup, updateGroup, deleteGroup, clearGroups } = useGroupStore();
  const { config, setConfig } = useAppConfigStore();
  const { selectImage, clearImages } = useTimelineStore();
  const { selectedImageIds, isSelectionMode, clearSelection: clearTimelineSelection, getSelectedCount } = useGroupUIStore();

  const [view, setView] = useState<'grid' | 'detail'>('grid');
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null);
  const [groupImages, setGroupImages] = useState<Image[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [renamingGroupId, setRenamingGroupId] = useState<number | null>(null);
  const [groupName, setGroupName] = useState('');
  const [deletingGroupId, setDeletingGroupId] = useState<number | null>(null);
  const [showAddMedia, setShowAddMedia] = useState(false);
  const [exportingGroupId, setExportingGroupId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const { selected, clearSelection, toggle, handleClick } = useGridSelection(groupImages);

  const size = SIZES[config.thumbnail_size as SizeKey];
  const coverPx = config.group_cover_size === 'small' ? 140 : config.group_cover_size === 'large' ? 220 : 176;
  const archivePath = config.archive_path ? config.archive_path.replace(/\/+$/, '') : '';
  const thumbnailCacheBust = useUIStore((s) => s.thumbnailCacheBust);

  useEffect(() => {
    fetchGroups();
  }, [fetchGroups]);

  const handleOpenArchive = async () => {
    const selected = await open({ directory: true });
    if (selected) {
      clearImages();
      selectImage(null);
      clearGroups();
      try {
        await invoke('init_archive', { archivePath: selected });
      } catch (e) {
        console.error('Failed to init archive:', e);
      }
      setConfig({ archive_path: selected as string });
    }
  };

  const handleOpenGroup = async (groupId: number) => {
    setSelectedGroupId(groupId);
    setView('detail');
    try {
      const imageIds = await invoke<string[]>('get_images_in_group', { groupId });
      const allImages = await invoke<Image[]>('get_all_images');
      setGroupImages(allImages.filter(img => imageIds.includes(img.id)));
    } catch (e) {
      console.error('Failed to load group images:', e);
    }
  };

  const handleBack = () => {
    setView('grid');
    setSelectedGroupId(null);
    setGroupImages([]);
    clearSelection();
  };

  // One dialog for create and rename: the name field and the confirm flow are the same
  const isNameDialogOpen = showCreateModal || renamingGroupId !== null;

  const closeNameDialog = () => {
    setShowCreateModal(false);
    setRenamingGroupId(null);
    setGroupName('');
  };

  const handleStartRename = (group: GroupWithCount) => {
    setRenamingGroupId(group.id);
    setGroupName(group.name);
  };

  const handleConfirmName = async () => {
    const name = groupName.trim();
    if (!name) return;
    if (renamingGroupId !== null) {
      await updateGroup(renamingGroupId, name);
      closeNameDialog();
      return;
    }
    const id = await createGroup(name);
    closeNameDialog();
    if (selectedImageIds.size > 0) {
      await invoke('add_images_to_group_bulk', { imageIds: [...selectedImageIds], groupId: id });
      clearTimelineSelection();
      fetchGroups();
    }
  };

  const handleExportGroup = async (groupId: number) => {
    const dest = await open({ directory: true });
    if (dest) {
      setExportingGroupId(groupId);
      try {
        const result = await invoke<ExportResult>('export_group', { groupId, destPath: dest });
        toast.success(t('groups.exportSuccess', { count: result.copied, path: result.dest_path }));
      } catch (e) {
        toast.error(t('groups.exportError'));
        console.error('Export failed:', e);
      } finally {
        setExportingGroupId(null);
      }
    }
  };

  const handleConfirmDelete = async () => {
    if (deletingGroupId === null) return;
    await deleteGroup(deletingGroupId);
    if (selectedGroupId === deletingGroupId) handleBack();
    setDeletingGroupId(null);
  };

  const handleMediaAdded = async () => {
    setShowAddMedia(false);
    if (selectedGroupId !== null) {
      await handleOpenGroup(selectedGroupId);
    }
    fetchGroups();
  };

  // Only unlinks (no file touched, reversible), so no confirmation, as in the preview's groups popover
  const handleRemoveSelected = async () => {
    if (selectedGroupId === null) return;
    setBusy(true);
    const ids = [...selected];
    try {
      for (const imageId of ids) {
        await invoke('remove_image_from_group', { imageId, groupId: selectedGroupId });
      }
    } catch (e) {
      console.error('Failed to remove images from group:', e);
    }
    setGroupImages(prev => prev.filter(img => !ids.includes(img.id)));
    clearSelection();
    fetchGroups();
    setBusy(false);
  };

  const handleSetCover = async () => {
    if (selectedGroupId === null || selected.size !== 1) return;
    try {
      await invoke('set_group_cover', { groupId: selectedGroupId, imageId: [...selected][0] });
      clearSelection();
      fetchGroups();
    } catch (e) {
      console.error('Failed to set cover:', e);
    }
  };

  if (!config.archive_path) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-var(--topbar-offset))]">
        <div className="squircle bg-card px-8 py-6 rounded-xl text-center max-w-sm">
          <p className="text-muted-foreground text-sm mb-4">{t('timeline.archiveNotSet')}</p>
          <Button onClick={handleOpenArchive}>{t('timeline.openArchive')}</Button>
        </div>
      </div>
    );
  }

  const selectedGroup = groups.find(g => g.id === selectedGroupId);
  const deletingGroup = groups.find(g => g.id === deletingGroupId);

  return (
    // Full-height, pulled up under the fixed topbar so the content scrolls beneath the floating chrome (like Timeline)
    <div className="relative h-screen -mt-[var(--topbar-offset)]">
      {/* Content */}
      <div
        className="h-full overflow-y-auto scroll-inset px-6"
        style={{ paddingTop: FLOATING_TOP, paddingBottom: 12, '--scroll-inset-top': `${FLOATING_TOP}px`, '--scroll-inset-bottom': '12px' } as CSSProperties}
      >
        {view === 'grid' ? (
          groups.length === 0 ? (
            <EmptyState text={t('groups.noGroups')}>
              <Button variant="violet" onClick={() => setShowCreateModal(true)}>
                <PlusIcon />
                {t('groups.create')}
              </Button>
            </EmptyState>
          ) : (
            <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${coverPx}px, 1fr))` }}>
              {groups.map(group => (
                <GroupCard
                  key={group.id}
                  group={group}
                  coverUrl={getThumbnailUrl(archivePath, group.cover_thumbnail_path, thumbnailCacheBust) || null}
                  onOpen={() => handleOpenGroup(group.id)}
                  onRename={() => handleStartRename(group)}
                  onDelete={() => setDeletingGroupId(group.id)}
                />
              ))}
            </div>
          )
        ) : groupImages.length === 0 ? (
          <EmptyState text={t('groups.noMedia')}>
            <Button onClick={() => setShowAddMedia(true)}>
              <PlusIcon />
              {t('groups.addMediaTitle')}
            </Button>
          </EmptyState>
        ) : (
          /* Detail: timeline look. Click selects, double-click opens the viewer */
          <div className="grid" style={{ gap: size.gap, gridTemplateColumns: `repeat(auto-fill, minmax(${size.px}px, 1fr))` }}>
            {groupImages.map(img => (
              <div key={img.id} className="relative" onDoubleClick={() => selectImage(img)}>
                <ThumbnailCell
                  image={img}
                  archivePath={archivePath}
                  cacheBust={thumbnailCacheBust}
                  isSelectionMode
                  isSelected={selected.has(img.id)}
                  isPreviewed={false}
                  onImageClick={handleClick}
                  onToggleSelect={toggle}
                />
                {/* Cover marker: violet, the groups color (gold is reserved for favourites) */}
                {selectedGroup?.cover_image_id === img.id && (
                  <Badge className="absolute bottom-1.5 right-1.5 h-5 px-2 bg-violet text-violet-foreground text-[10px] font-semibold shadow-[0_1px_3px_rgba(0,0,0,.4)] pointer-events-none">
                    {t('groups.cover')}
                  </Badge>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Scroll-edge fade: content dissolves as it passes under the floating chrome */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 z-10 bg-linear-to-b from-background from-55% to-transparent"
        style={{ height: FLOATING_TOP + 8 }}
      />

      {/* Floating row: title/back (left), actions (right) */}
      <div className="pointer-events-none absolute inset-x-0 z-20 flex items-start justify-between gap-3 px-4 top-[calc(var(--topbar-offset)+8px)]">
        {view === 'detail' ? (
          <div className="pointer-events-auto flex items-center gap-2 min-w-0">
            <MediaButton label={t('common.back')} onClick={handleBack} className={`${CHROME_BUTTON} size-9 shrink-0`}>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </MediaButton>
            <Badge variant="outline" className={`${PILL} text-[13px] font-semibold min-w-0`}>
              <span className="truncate">{selectedGroup?.name}</span>
            </Badge>
            {selected.size > 0 && (
              <Badge variant="outline" className={`${PILL} text-xs font-normal text-muted-foreground tabular-nums animate-in fade-in duration-200`}>
                {t('timeline.selected', { count: selected.size })}
              </Badge>
            )}
          </div>
        ) : <div /> /* No title pill (like the timeline): the topbar already says where you are */}

        <div className="pointer-events-auto flex items-center gap-2 shrink-0">
          {view === 'grid' ? (
            groups.length > 0 && (
              <Button size="lg" variant="violet" className="shadow-float" onClick={() => setShowCreateModal(true)}>
                <PlusIcon />
                {t('groups.create')}
              </Button>
            )
          ) : selected.size > 0 ? (
            <>
              {selected.size === 1 && (
                <Button size="lg" variant="outline" className="bg-popover hover:bg-card shadow-float" onClick={handleSetCover}>
                  {t('groups.setCover')}
                </Button>
              )}
              <Button size="lg" variant="violet" className="shadow-float" onClick={handleRemoveSelected} disabled={busy}>
                {t('detail.removeFromGroup')}
              </Button>
            </>
          ) : (
            <>
              <Button size="lg" className="shadow-float" onClick={() => setShowAddMedia(true)}>
                <PlusIcon />
                {t('groups.addMediaTitle')}
              </Button>
              {groupImages.length > 0 && (
                <Button
                  size="lg"
                  variant="violet"
                  className="shadow-float"
                  onClick={() => handleExportGroup(selectedGroupId!)}
                  disabled={exportingGroupId === selectedGroupId}
                >
                  {exportingGroupId === selectedGroupId && (
                    <svg className="animate-spin" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                    </svg>
                  )}
                  {t('groups.export')}
                </Button>
              )}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-lg"
                    aria-label={t('groups.deleteGroup')}
                    onClick={() => setDeletingGroupId(selectedGroupId)}
                    className="bg-popover shadow-float text-muted-foreground hover:bg-popover hover:text-destructive"
                  >
                    <TrashIcon />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">{t('groups.deleteGroup')}</TooltipContent>
              </Tooltip>
            </>
          )}
        </div>
      </div>

      <ImageDetail hideGroups navImages={groupImages} />

      {/* Add media modal */}
      {showAddMedia && selectedGroupId !== null && (
        <AddMediaModal
          groupId={selectedGroupId}
          groupName={selectedGroup?.name ?? ''}
          onClose={() => setShowAddMedia(false)}
          onAdded={handleMediaAdded}
        />
      )}

      {/* Create / rename group modal */}
      <Dialog open={isNameDialogOpen} onOpenChange={(open) => { if (!open) closeNameDialog(); }}>
        <DialogContent className="w-96">
          <DialogHeader>
            <DialogTitle>{t(renamingGroupId !== null ? 'groups.rename' : 'groups.create')}</DialogTitle>
          </DialogHeader>

          {renamingGroupId === null && isSelectionMode && (
            <div className="p-3 bg-violet-soft rounded-lg">
              <p className="text-sm text-violet-ink">
                {t('groups.selectedMediaInfo', { count: getSelectedCount() })}
              </p>
            </div>
          )}

          <Input
            type="text"
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleConfirmName()}
            placeholder={t('groups.namePlaceholder')}
            autoFocus
          />

          <div className="flex gap-3 justify-end">
            <Button variant="outline" onClick={closeNameDialog}>
              {t('common.cancel')}
            </Button>
            <Button onClick={handleConfirmName}>{t('common.confirm')}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete confirm modal */}
      <Dialog open={deletingGroupId !== null} onOpenChange={(open) => { if (!open) setDeletingGroupId(null); }}>
        <DialogContent className="w-96">
          <DialogHeader>
            <DialogTitle>{t('common.delete')} "{deletingGroup?.name}"</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">{t('groups.deleteConfirm')}</p>
          <div className="flex gap-3 justify-end">
            <Button variant="outline" onClick={() => setDeletingGroupId(null)}>{t('common.cancel')}</Button>
            <Button variant="destructive" onClick={handleConfirmDelete}>{t('common.delete')}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function GroupCard({ group, coverUrl, onOpen, onRename, onDelete }: {
  group: GroupWithCount;
  coverUrl: string | null;
  onOpen: () => void;
  onRename: () => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation();

  return (
    <div
      onClick={onOpen}
      className="group/card squircle cursor-pointer rounded-lg overflow-hidden bg-card shadow-raised transition-transform duration-150 active:scale-[.97]"
    >
      <div className="aspect-[4/3] bg-muted overflow-hidden relative">
        {coverUrl ? (
          <img src={coverUrl} alt={group.name} className="w-full h-full object-cover" loading="lazy" />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-muted-foreground/50">
            <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"/>
            </svg>
            {group.image_count === 0 && (
              <span className="text-[10px]">{t('groups.noCover')}</span>
            )}
          </div>
        )}

        {/* Hover dark overlay, as on timeline thumbnails */}
        <div className="absolute inset-0 bg-black/15 opacity-0 group-hover/card:opacity-100 transition-opacity pointer-events-none" />

        {/* Hover actions: opaque chrome buttons, same as the preview/viewer. Clicks stop here so the card doesn't open */}
        <div
          onClick={e => e.stopPropagation()}
          className="absolute top-2 right-2 flex gap-1.5 opacity-0 group-hover/card:opacity-100 focus-within:opacity-100 transition-opacity"
        >
          <MediaButton label={t('groups.rename')} onClick={onRename} className={CHROME_BUTTON}>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16.862 4.487a2.1 2.1 0 113 3L8.5 18.85 4 20l1.15-4.5L16.862 4.487z" />
          </MediaButton>
          <MediaButton label={t('groups.deleteGroup')} onClick={onDelete} className={`${CHROME_BUTTON} hover:text-destructive`}>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </MediaButton>
        </div>
      </div>

      <div className="p-3 flex flex-col items-start gap-1.5">
        <p className="w-full font-medium text-sm truncate text-foreground">{group.name}</p>
        <Badge variant="violet" className="text-[11px] font-semibold">
          {t('groups.mediaCount', { count: group.image_count })}
        </Badge>
      </div>
    </div>
  );
}

function EmptyState({ text, children }: { text: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-center h-full">
      <div className="squircle bg-card px-8 py-6 rounded-xl text-center max-w-sm flex flex-col items-center gap-4">
        <p className="text-muted-foreground text-sm">{text}</p>
        {children}
      </div>
    </div>
  );
}

function PlusIcon() {
  return (
    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
    </svg>
  );
}
