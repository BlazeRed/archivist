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

## UI Components

Key components in `src/components/`:

| Component | Purpose |
|-----------|---------|
| `Topbar.tsx` | Nav bar — logo, page links, rescan icon button, language toggle |
| `ThumbnailGrid.tsx` | Virtualized image grid with sticky month headers |
| `AddMediaModal.tsx` | Full-screen group media picker (same layout as timeline) |
| `ImageDetail.tsx` | Full image view modal with metadata panel and Show in Folder button |
| `ProgressBar.tsx` | Import progress indicator |
| `ConflictReview.tsx` | Duplicate conflict resolution UI |
| `Toast.tsx` / `ui/sonner.tsx` | Toast notification display |

UI primitives in `src/components/ui/` are shadcn/ui components (Button, Dialog, Select, Slider, Input, etc.).

### Button variants (shadcn CVA)

All variants use `hover:brightness-90/95` for consistent tone-shift hover — no `[a]:hover:` prefix.

| Variant | Use |
|---------|-----|
| `default` | Primary action (accent blue) |
| `secondary` | Secondary actions (navy bg) |
| `outline` | Tertiary/ghost actions |
| `destructive` | Delete/remove actions |
| `ghost` | Icon buttons, inline controls |
| `link` | Text links |

## Critical Rules

1. **Never** store absolute paths in DB — always relative to `archive_root`
2. **Always copy** source files during import — never move
3. **Collect all conflicts** before showing UI — never one popup per duplicate
4. **Groups are DB-only** — never create physical folders for groups
5. **Never block UI** during analysis — Tauri async commands only
6. **Never delete** without explicit user confirmation
7. **Folder names on disk always in English** regardless of UI language (`01 - January`, not `01 - Gennaio`)

## Physical Archive Layout

```
{archive_root}/
├── YYYY/
│   └── MM - MonthName/     ← always English, always this format
│       └── image.jpg
└── .archivist/
    ├── archivist.db
    └── thumbnails/
        └── {sha256}.jpg
```

## Design Tokens

All colors defined as CSS vars in `src/index.css`. Never hardcode hex elsewhere:

```
--color-background: #D2E8F7   (page background)
--color-text:       #002D58   (foreground / deep navy)
--color-accent:     #0084C5   (primary — buttons, active states)
--color-tertiary:   #2A9EAD   (success / teal / sparingly)
--color-card:       #E8F3FB   (card backgrounds)
--color-surface:    #F4F9FD   (inputs, dropdowns, popover)
--color-warning:    #E6A817
--color-error:      #C0392B
```

These map to Tailwind semantic tokens (`bg-background`, `text-foreground`, `bg-primary`, etc.) via `@theme` in `index.css`.

## i18n

`src/i18n/index.ts` bootstraps i18next with `en`/`it` locales. All UI strings through `useTranslation()` — no hardcoded user-visible strings in components. Language stored in `AppConfig.language`. Folder names on disk are always English regardless.

## Image Identity

SHA256 hash = image primary key (`id` in DB). Duplicate detection is hash-based. Thumbnails stored inside archive at `.archivist/thumbnails/{id}.jpg`.
