# Archivist — Agent Documentation

## Project Overview

**Archivist** is a photographic archive organizer built with Tauri v2 + React + TypeScript. It imports photos with automatic EXIF date detection, organizes them by month, and provides timeline/group browsing with a year-range filter.

## Repository Structure

```
archivist/
├── src/                          # React frontend
│   ├── components/               # React components
│   │   ├── Topbar.tsx            # Navigation bar with mode/language toggles
│   │   ├── FilterPanel.tsx       # Year-range slider + month filter for timeline
│   │   ├── ThumbnailGrid.tsx     # Virtualized image grid with sticky month headers
│   │   ├── AddPhotosModal.tsx    # Full-screen group photo picker (mirrors timeline layout)
│   │   ├── ImageDetail.tsx       # Full image view modal
│   │   ├── ProgressBar.tsx       # Import progress indicator
│   │   ├── ConflictReview.tsx    # Conflict resolution UI
│   │   └── Toast.tsx             # Toast notification wrapper
│   │   └── ui/                   # shadcn/ui primitives
│   │       ├── button.tsx        # Button (default/secondary/outline/destructive/ghost/link)
│   │       ├── dialog.tsx        # Modal dialog
│   │       ├── select.tsx        # Dropdown select
│   │       ├── slider.tsx        # Range slider (single or two-thumb)
│   │       ├── input.tsx         # Text input
│   │       ├── progress.tsx      # Progress bar primitive
│   │       └── sonner.tsx        # Sonner toast integration
│   ├── pages/                    # Route pages
│   │   ├── TimelinePage.tsx      # Photo timeline view
│   │   ├── GroupsPage.tsx        # Group management (create, rename, delete, export)
│   │   ├── ImportPage.tsx        # Import wizard
│   │   └── SettingsPage.tsx      # App settings
│   ├── stores/                   # Zustand state stores
│   │   ├── appConfigStore.ts     # App configuration store
│   │   ├── dataStore.ts          # Images & groups data (useImageStore, useGroupStore)
│   │   ├── importStore.ts        # Import wizard state
│   │   ├── timelineStore.ts      # Timeline filtering/selection (year range + month)
│   │   ├── groupUIStore.ts       # Multi-selection for groups
│   │   └── notificationStore.ts  # Toast queue
│   ├── types/                    # TypeScript types
│   │   └── index.ts              # Image, Group, GroupWithCount types
│   ├── i18n/                     # Internationalization
│   │   ├── index.ts              # i18next configuration
│   │   └── locales/
│   │       ├── en.json           # English translations
│   │       └── it.json           # Italian translations
│   ├── index.css                 # Tailwind + design tokens (@theme)
│   ├── App.tsx                   # Main app with routing
│   └── main.tsx                  # Entry point
├── src-tauri/                    # Rust backend
│   ├── src/
│   │   ├── main.rs               # Tauri entry point
│   │   ├── lib.rs                # All Tauri command registrations
│   │   ├── error.rs              # Unified AppError type
│   │   ├── exif.rs               # EXIF extraction with 4-level fallback
│   │   ├── hasher.rs             # SHA256 hash computation
│   │   ├── thumbnail.rs          # Thumbnail generation (256×256 JPEG)
│   │   ├── state.rs              # Arc<AppState> (DB handle + archive path)
│   │   ├── commands/
│   │   │   ├── import.rs         # scan → analyze → plan → execute pipeline
│   │   │   └── export.rs         # Group export + archive rescan
│   │   └── db/                   # Database layer
│   │       ├── mod.rs            # DB init + schema migrations
│   │       ├── image.rs          # Image CRUD
│   │       └── group.rs          # Group CRUD (includes update_group)
│   ├── Cargo.toml                # Rust dependencies
│   └── tauri.conf.json           # Tauri configuration
├── .github/
│   └── workflows/
│       └── release.yml           # Cross-platform build (Linux + Windows + macOS)
├── package.json
├── vite.config.ts
└── AGENTS.md                     # This file
```

## Implementation Milestones

| Milestone | Description | Status |
|-----------|-------------|--------|
| **M1** | Scaffold: Tauri + React + Tailwind + i18n + routing | ✅ Done |
| **M2** | Database: SQLite schema, migrations, Rust CRUD | ✅ Done |
| **M3** | EXIF + Hash: exif.rs, hasher.rs, thumbnail.rs with tests | ✅ Done |
| **M4** | Import Core: Full backend import pipeline | ✅ Done |
| **M5** | Import UI: Wizard + conflict review + progress | ✅ Done |
| **M6** | Timeline: Timeline + year-range filter + image detail | ✅ Done |
| **M7** | Groups: Group management + inline rename + export + photo picker | ✅ Done |
| **M8** | Settings: Both modes + persistence | ✅ Done |
| **M9** | Polish: Mode toggle, notifications, error handling | ✅ Done |
| **M10** | CI/CD: GitHub Actions cross-platform release builds | ✅ Done |

## Database Schema (SQLite)

**Location**: `{archive_path}/.archivist/archivist.db`

```sql
CREATE TABLE images (
    id TEXT PRIMARY KEY,           -- SHA256 hash
    filename TEXT NOT NULL,
    file_path TEXT NOT NULL,       -- Relative to archive_root
    taken_at TEXT,                 -- ISO8601 or NULL
    imported_at TEXT NOT NULL,     -- ISO8601
    width INTEGER,
    height INTEGER,
    file_size INTEGER,
    has_exif INTEGER DEFAULT 0
);

CREATE TABLE groups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE TABLE image_groups (
    image_id TEXT NOT NULL,
    group_id INTEGER NOT NULL,
    PRIMARY KEY (image_id, group_id),
    FOREIGN KEY (image_id) REFERENCES images(id) ON DELETE CASCADE,
    FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE
);
```

**Critical**: Never store absolute paths in DB — always relative to `archive_root`.

## Physical Folder Structure

```
{archive_root}/
├── YYYY/
│   └── MM - MonthName/
│       └── image.jpg
└── .archivist/
    ├── archivist.db
    └── thumbnails/
        └── {sha256}.jpg
```

**Month folder names are ALWAYS in English** regardless of UI language:
- `01 - January`, `07 - July`, `11 - November`

## Design System Tokens (CSS)

```css
:root {
  --color-background: #D2E8F7;   /* Sky background */
  --color-text: #002D58;          /* Deep navy / foreground */
  --color-accent: #0084C5;        /* Archive blue — primary buttons */
  --color-tertiary: #2A9EAD;      /* Teal isle — success/sparingly */
  --color-card: #E8F3FB;          /* Card backgrounds */
  --color-surface: #F4F9FD;       /* Inputs, dropdowns, popovers */
  --color-border: rgba(0,45,88,0.15);
  --color-muted: rgba(0,45,88,0.55);
  --color-warning: #E6A817;
  --color-error: #C0392B;
  --color-success: #2A9EAD;
}
```

These are exposed as Tailwind semantic tokens via `@theme` in `index.css` (`bg-background`, `text-foreground`, `bg-primary`, etc.).

## Button Variants (shadcn/ui CVA)

Defined in `src/components/ui/button.tsx` using class-variance-authority.
All variants use `hover:brightness-90` or `hover:brightness-95` — never `[a]:hover:` (that only fires on `<a>` elements).

| Variant | Visual | Use case |
|---------|--------|----------|
| `default` | Accent blue bg, white text | Primary action |
| `secondary` | Navy bg, light text | Secondary action (e.g. Export, Cancel) |
| `outline` | Border only, transparent | Tertiary / less prominent |
| `destructive` | Red tint bg, red text | Delete / remove |
| `ghost` | Transparent | Icon buttons, inline controls |
| `link` | Underline on hover | Text links |

## Key Components

### FilterPanel (`src/components/FilterPanel.tsx`)
- Two-thumb Radix UI `Slider` for selecting a year range (oldest → newest, left → right)
- Month `Select` appears only when `yearFrom === yearTo` (single year selected)
- "No Date" toggle to show images without EXIF dates
- Group filter dropdown
- "Clear filters" link when any filter is active

### AddPhotosModal (`src/components/AddPhotosModal.tsx`)
- Full-screen dialog (`95vw × 90vh`) matching page background (`bg-background`)
- Left sidebar: same filter structure as FilterPanel (year-range slider, month select)
- Right area: images grouped by month with sticky headers, 150×150 thumbnails
- Checkbox overlay on each thumbnail for multi-select
- Action bar at bottom: count of selected + Add / Cancel buttons

### GroupsPage (`src/pages/GroupsPage.tsx`)
- Groups sidebar with inline rename: pencil icon on hover → input field → Enter/blur confirms, Escape cancels
- Main area shows selected group's images in a 4-column grid
- Remove-from-group button (×) on thumbnail hover

### ThumbnailGrid (`src/components/ThumbnailGrid.tsx`)
- `react-window` virtualized list of month sections
- Sticky month/year headers
- Three thumbnail size presets (small/medium/large)

## State Management

### useAppConfigStore
```typescript
interface AppConfig {
  archive_path: string;
  language: 'en' | 'it';
  ui_mode: 'beginner' | 'advanced';
  thumbnail_size: 'small' | 'medium' | 'large';
  last_import_source: string;
  block_size: number;
}
```

### useTimelineStore — filter shape
```typescript
interface TimelineFilter {
  yearFrom: number | null;  // null = all years (no lower bound)
  yearTo:   number | null;  // null = all years (no upper bound)
  month:    number | null;  // 1–12; only active when yearFrom === yearTo
  noDate:   boolean;
  groupId:  number | null;
}
```
Month is auto-cleared whenever `yearFrom !== yearTo` or both are null.

### useGroupStore (in dataStore.ts)
```typescript
interface GroupStore {
  groups: GroupWithCount[];
  fetchGroups: () => Promise<void>;
  createGroup: (name: string) => Promise<number>;
  updateGroup: (id: number, name: string) => Promise<void>;
  deleteGroup: (id: number) => Promise<void>;
}
```

### useImportStore
Import wizard state machine: `idle → scanning → analyzing → review → importing → complete`

## Tauri Commands (Backend)

All registered in `lib.rs`. New commands must be added both as `#[tauri::command]` fn and in `tauri::generate_handler![]`.

| Command | I/O | Description |
|---------|-----|-------------|
| `init_archive(archive_path: String)` | `()` | Set archive path in AppState |
| `get_image_count()` | `i64` | Total image count |
| `get_all_images()` | `Vec<Image>` | All images |
| `get_images_by_date(year, month?)` | `Vec<Image>` | Images by year/month |
| `get_all_groups()` | `Vec<GroupWithCount>` | Groups with image counts |
| `create_group(name)` | `i64` | Create group, return id |
| `update_group(id, name)` | `()` | Rename group |
| `delete_group(id)` | `()` | Delete group |
| `add_image_to_group(image_id, group_id)` | `()` | Add image to group |
| `remove_image_from_group(image_id, group_id)` | `()` | Remove image from group |
| `get_images_in_group(group_id)` | `Vec<String>` | Image IDs in group |
| `get_groups_for_image(image_id)` | `Vec<i64>` | Group IDs for image |
| `scan_source(source_path)` | `Vec<ScannedImage>` | Scan folder for importable images |
| `analyze_image(scanned)` | `AnalyzedImage` | EXIF + hash + dimensions |
| `create_import_plan(images)` | `ImportPlan` | Build plan with conflict detection |
| `execute_import(plan, resolutions, archive_path)` | `ImportResult` | Run import |
| `export_group(group_id, dest_path)` | `ExportResult` | Copy group images to folder |
| `rescan_archive()` | `usize` | Re-index existing archive files |
| `save_config(config)` | `()` | Persist app config JSON |
| `load_config()` | `Option<Value>` | Load app config JSON |
| `path_exists(path)` | `bool` | Check if path exists on disk |

## Cross-Platform Builds (GitHub Actions)

`.github/workflows/release.yml` (at project root, one level above `archivist/`):
- Triggered by `v*` tags or `workflow_dispatch`
- Matrix: `ubuntu-22.04`, `windows-latest`, `macos-latest` × 2 (Intel + Apple Silicon)
- Each runner builds natively — no cross-compilation
- Produces `.deb`/`.AppImage`, `.msi`/`.exe`, `.dmg` attached to a draft GitHub Release

## Rust Tests

All modules have unit tests:
- `exif.rs`: Date parsing, fallback cascade
- `hasher.rs`: Hash determinism, verification
- `thumbnail.rs`: Size presets, image resizing

Run tests with: `cd src-tauri && cargo test`

## Critical Rules (Non-Negotiable)

1. **NEVER** store absolute paths in the DB — always relative to `archive_root`
2. **NEVER** move source files — **ALWAYS** copy. Propose deletion only after successful import
3. **NEVER** show a popup per duplicate — collect ALL conflicts and show in `ConflictReview`
4. **NEVER** create physical folders for groups — groups exist ONLY in the database
5. **NEVER** block the UI during analysis — use Tauri async commands
6. **NEVER** delete anything without explicit user confirmation
7. Physical folder names on disk are **ALWAYS** in English regardless of UI language

## Configuration File

`{app_data}/app_config.json`:
```json
{
  "archive_path": "/path/to/archive",
  "language": "en",
  "ui_mode": "beginner",
  "thumbnail_size": "medium",
  "last_import_source": "",
  "block_size": 50
}
```
