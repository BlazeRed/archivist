# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Dev (Tauri + Vite hot reload)
npm run tauri dev

# Build for current platform
npm run tauri build

# Frontend only (no Tauri, for quick UI iteration)
npm run dev

# Rust tests
cd src-tauri && cargo test

# TypeScript check
npx tsc --noEmit
```

No JS test suite exists. Rust unit tests live in `exif.rs`, `hasher.rs`, `thumbnail.rs`.

## Cross-platform releases

`.github/workflows/release.yml` at the project root (one level above `archivist/`) builds all platforms on GitHub Actions. Push a `v*` tag to trigger. Each platform runner builds natively — no cross-compilation required or attempted.

## Architecture

Tauri v2 desktop app. Two runtimes communicate via `invoke()`:

**Frontend** (`src/`) — React 19 + TypeScript + Tailwind v4 + shadcn/ui + Zustand v5 + react-router-dom v7

**Backend** (`src-tauri/src/`) — Rust. All Tauri commands defined in `lib.rs` and delegated to:
- `commands/import.rs` — scan → analyze → plan → execute pipeline (`import_one` copies+thumbnails+inserts one item atomically, rolling back the copy if the DB insert fails)
- `commands/export.rs` — group export
- `commands/rescan.rs` — archive rescan logic
- `db/image.rs`, `db/group.rs` — SQLite CRUD via rusqlite
- `exif.rs` — EXIF date extraction with filesystem-date fallback
- `hasher.rs` — SHA256 used as image primary key
- `thumbnail.rs` — generates thumbnails at import time
- `state.rs` — `Arc<AppState>` shared across commands (holds DB handle + archive path)
- `error.rs` — unified `AppError` type, serde-serialized to frontend

**DB**: SQLite at `{archive_path}/.archivist/archivist.db`. Dev DB hardcoded to `/tmp/archivist.db` in `lib.rs:run()`.

**Config**: JSON at `{app_data}/app_config.json`, managed by `appConfigStore.ts` via `save_config`/`load_config` Tauri commands.

## State Stores (Zustand)

| Store | Owns |
|-------|------|
| `appConfigStore` | `AppConfig` (archive path, language, thumbnail_size) |
| `dataStore` | Images + groups loaded from DB (`useImageStore`, `useGroupStore`) |
| `importStore` | Import wizard state machine (scanning → analyzing → review → importing → complete) |
| `timelineStore` | Year-range filter (`yearFrom`/`yearTo`), month filter, media type filter, selected image |
| `groupUIStore` | Multi-selection state for group assignment |
| `notificationStore` | Toast queue |
| `uiStore` | Settings panel open/close, rescan-in-progress flag |

### timelineStore filter shape

```typescript
interface TimelineFilter {
  yearFrom:  number | null;              // null = no lower bound
  yearTo:    number | null;              // null = no upper bound
  month:     number | null;              // 1–12; only active when yearFrom === yearTo
  noDate:    boolean;
  groupId:   number | null;
  mediaType: 'all' | 'images' | 'videos';
}
```

Month filter is auto-cleared whenever `yearFrom !== yearTo` or both are null.

## Tauri Commands

All registered in `lib.rs` via `tauri::generate_handler![]`:

| Command | Description |
|---------|-------------|
| `init_archive(archive_path)` | Set archive path in AppState |
| `get_image_count()` | Total image count |
| `get_all_images()` | All images |
| `get_images_by_date(year, month?)` | Images filtered by year/month |
| `get_all_groups()` | Groups with image counts |
| `create_group(name)` → `i64` | Create group, return id |
| `update_group(id, name)` | Rename group |
| `delete_group(id)` | Delete group |
| `add_image_to_group(image_id, group_id)` | Add image to group |
| `remove_image_from_group(image_id, group_id)` | Remove image from group |
| `get_images_in_group(group_id)` → `Vec<String>` | Image IDs in group |
| `get_groups_for_image(image_id)` → `Vec<i64>` | Group IDs for image |
| `scan_source(source_path)` | Scan folder for importable images |
| `analyze_image(scanned)` | EXIF + hash + dimensions |
| `create_import_plan(images)` | Build plan with conflict detection |
| `execute_import(plan, resolutions, archive_path)` | Run import |
| `export_group(group_id, dest_path)` | Copy group images to folder |
| `rescan_archive()` | Re-index archive files; archive path read from AppState. Returns missing files as `RescanResult.missing` — never deletes them itself |
| `remove_missing_images(ids)` | Delete DB records for missing files the user has explicitly confirmed |
| `generate_temp_thumbnail(source_path)` | Generate thumbnail for preview before import |
| `cleanup_temp_thumbnails()` | Delete temp thumbnails from previous session |
| `delete_files(paths)` → `{deleted, failed}` | Delete source files after import |
| `save_config(config)` | Persist app config JSON |
| `load_config()` | Load app config JSON |
| `path_exists(path)` | Check if path exists on disk |
| `trash_images(image_ids)` → `{moved, failed}` | Move files to `{archive}/Trash`, set `trashed_at` (rename undone if the DB write fails) |
| `restore_images(image_ids)` → `{moved, failed}` | Move back to the folder `destination_path(taken_at)` maps to, clear `trashed_at` |
| `get_trashed_images()` | Trashed items; rows whose file the user deleted by hand are dropped (with thumbnail) |
| `get_trash_count()` | Trashed item count (topbar dot) |
| `set_favourite_bulk(image_ids, is_favourite)` | Favourite/unfavourite many in one transaction |
| `add_images_to_group_bulk(image_ids, group_id)` | Add many to a group in one transaction |

## UI Components

Key components in `src/components/`:

| Component | Purpose |
|-----------|---------|
| `Topbar.tsx` | Floating pill nav bar — logo, page links, import/rescan/settings icon buttons |
| `ThumbnailGrid.tsx` | Virtualized image grid with sticky month headers |
| `AddMediaModal.tsx` | Full-screen group media picker (same layout as timeline) |
| `ImagePreview.tsx` | Timeline preview column, always visible: selected item or static skeleton. Exports the shared media actions (favourite, folder, groups) |
| `ImageDetail.tsx` | Fullscreen viewer: floating chrome, ⓘ metadata panel (closed by default), ←/→/Esc, FLIP zoom from/to the preview frame (`[data-preview-media]`) |
| `pages/TrashPage.tsx` | Trash: timeline look (grid under the floating chrome, `ThumbnailCell`) on a plain CSS grid, no bottom bar: the title pill holds Restore all, which becomes Restore + selected count while selecting; click/Shift-click selects, Esc clears, double-click opens the viewer; Open folder on the right |
| `FloatingSelectionBar.tsx` | Timeline multi-selection chrome: count pill + full-width bar; `BAR_BUTTON`/`BAR_LABEL` = icon only below @2xl, icon + label above |
| `ProgressBar.tsx` | Import progress indicator |
| `ConflictReview.tsx` | Duplicate conflict resolution UI |
| `Toast.tsx` / `ui/sonner.tsx` | Toast notification display |

UI primitives in `src/components/ui/` are shadcn/ui components (Button, Dialog, Select, Slider, Input, etc.).

### Button variants (shadcn CVA)

All buttons are pills (`rounded-full`), press = `scale(.97)`, hover = `brightness-95`.

| Variant | Use |
|---------|-----|
| `default` | Primary action (archive blue) |
| `secondary` | Secondary actions (navy fill; light fill in dark theme) |
| `violet` | Group-related actions |
| `gold` | Favourite actions |
| `outline` | Cancel / back (transparent + inset border) |
| `destructive` | Delete/remove (solid red) — always paired with an `outline` Cancel |
| `ghost` | Icon buttons, inline controls |
| `onMedia` | Icon buttons laid over a photo (dark translucent circle, white icon) |
| `link` | Text links |

**Framework first:** build UI only from `src/components/ui/` (shadcn, style `radix-nova`). Missing component → `npx shadcn@latest add <name>` (then switch its `cn` import to `@/lib/utils`; do not add the `cn` npm package). Customize only with token classes / CVA variants, and ask the user before customizing or creating a component.

Project variants on shadcn components: `Badge` `gold` / `violet`; `Toggle`/`ToggleGroup` `segmented` (pill segments, active = primary — topbar nav, media filter, theme); `Button` `violet` / `gold` / `onMedia`. Tooltips: `TooltipProvider delayDuration={400}` in `App.tsx`; icon-only buttons get a `Tooltip` + `aria-label`, not `title`.

## Critical Rules

1. **Never** store absolute paths in DB — always relative to `archive_root`
2. **Always copy** source files during import — never move
3. **Collect all conflicts** before showing UI — never one popup per duplicate
4. **Groups are DB-only** — never create physical folders for groups
5. **Never block UI** during analysis — Tauri async commands only
6. **Never delete** without explicit user confirmation
7. **Folder names on disk always in English** regardless of UI language (`01 - January`, not `01 - Gennaio`)
8. **Trash is soft**: trashed rows keep `trashed_at` set; every query that lists live images must filter `trashed_at IS NULL`. Emptying the Trash folder is always the user's manual act

## Physical Archive Layout

```
{archive_root}/
├── YYYY/
│   └── MM - MonthName/     ← always English, always this format
│       └── image.jpg
├── Trash/                ← trashed files (flat). Rescan skips it; Archivist never deletes from it
└── .archivist/
    ├── archivist.db
    └── thumbnails/
        └── {sha256}.jpg
```

## Design Tokens

Spec: `../Archivist_Design_System.md` (v2.0) — single source of truth. All colors are CSS vars in `src/index.css` (`:root` = light, `.dark` = dark). Never hardcode hex in components; use the Tailwind token classes:

- Surfaces: `bg-background`, `bg-card` (static panels), `bg-popover` (floating: topbar, preview card, menus, dialogs), `bg-media` (letterbox behind photos)
- Brand: `primary` / `text-primary-ink` (blue text), `gold` / `gold-ink` / `gold-soft` (favourites), `violet` / `violet-ink` / `violet-soft` (groups)
- Status: `success(-ink)`, `warning(-ink)`, `destructive`. Use `-ink` variants for text, never the fill color
- `accent` = neutral hover fill (shadcn convention), not a brand color
- Elevation: `shadow-raised`, `shadow-float`, `shadow-overlay`. Gold frame `ring-1 ring-frame` (opaque color, whole-pixel width, no regular border) only on primary floating chrome: topbar, preview card, settings panel; selected thumbnails a solid gold ring. Everything else floating (filters popover, selection bar, count/month badges, filter button) gets no ring: opaque `bg-popover` + shadow only (the shadow blur is the floating cue; no translucent/backdrop-blur glass). Gold marks only the primary three; adding it to all floating chrome makes the UI heavy
- Radius: `--radius: 1rem` → `rounded-sm` 10 (thumbs), `md` 12, `lg` 16 (cards), `xl` 24 (floating panels), `full` (buttons, chips)
- `.squircle` = superellipse corners where supported (progressive enhancement)
- Topbar is `fixed`; `<main>` has `pt-[var(--topbar-offset)]`. Page heights: `h-[calc(100vh-var(--topbar-offset))]`, never a hardcoded topbar height. Timeline opts out (`h-screen -mt-[var(--topbar-offset)]`) so the grid scrolls under the floating chrome
- Animations: `tw-animate-css` (`animate-in fade-in slide-in-from-*`). shadcn `data-open:`/`data-closed:`/`data-checked:` classes work only through the `@custom-variant`s in `index.css` (Radix sets `data-state`); keep them when re-adding components. Panels (Popover, DropdownMenu, Select, Settings) share one motion: slide + fade, 300ms `cubic-bezier(.2,.8,.2,1)` in, 200ms `cubic-bezier(.4,0,1,1)` out; every `animate-out` needs `fill-mode-forwards` (else 1-frame flash before unmount); animate only transform/opacity, never the width of anything beside the grid (exception: the `segmented` ToggleGroup sliding pill, built into `ui/toggle-group.tsx`, animates `left`/`width`; it is absolute + out of flow, so no reflow)

Theme: `AppConfig.theme` (`system` | `light` | `dark`) toggles `.dark` on `<html>` in `App.tsx`.

## i18n

`src/i18n/index.ts` bootstraps i18next with `en`/`it` locales. All UI strings through `useTranslation()` — no hardcoded user-visible strings in components. Language stored in `AppConfig.language`. Folder names on disk are always English regardless.

## Image Identity

SHA256 hash = image primary key (`id` in DB). Duplicate detection is hash-based. Thumbnails stored inside archive at `.archivist/thumbnails/{id}.jpg`.
