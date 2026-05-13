# Archivist — Agent Documentation

## Project Overview

**Archivist** is a photographic archive organizer built with Tauri + React + TypeScript. It imports photos with automatic EXIF date detection, organizes them by month, and provides timeline/group browsing.

## Repository Structure

```
archivist/
├── src/                          # React frontend
│   ├── components/               # React components
│   │   ├── Topbar.tsx            # Navigation bar with mode/language toggles
│   │   └── ...
│   ├── pages/                    # Route pages
│   │   ├── TimelinePage.tsx      # Photo timeline view
│   │   ├── GroupsPage.tsx        # Group management
│   │   ├── ImportPage.tsx        # Import wizard
│   │   └── SettingsPage.tsx      # App settings
│   ├── stores/                   # Zustand state stores
│   │   └── appConfigStore.ts     # App configuration store
│   ├── i18n/                     # Internationalization
│   │   ├── index.ts              # i18next configuration
│   │   └── locales/
│   │       ├── en.json           # English translations
│   │       └── it.json           # Italian translations
│   ├── index.css                 # Tailwind + design tokens
│   ├── App.tsx                   # Main app with routing
│   └── main.tsx                  # Entry point
├── src-tauri/                    # Rust backend
│   ├── src/
│   │   ├── main.rs               # Tauri entry point
│   │   ├── lib.rs                # Library root
│   │   ├── error.rs              # Unified error type
│   │   ├── exif.rs               # EXIF extraction
│   │   ├── thumbnail.rs          # Thumbnail generation
│   │   ├── commands/             # Tauri commands
│   │   │   ├── import.rs         # Import pipeline
│   │   │   └── ...
│   │   └── db/                   # Database layer
│   ├── Cargo.toml                # Rust dependencies
│   └── tauri.conf.json           # Tauri configuration
├── package.json
├── vite.config.ts
└── tailwind.config.js            # (or via @tailwindcss/vite plugin)
```

## Implementation Milestones

| Milestone | Description | Status |
|-----------|-------------|--------|
| **M1** | Scaffold: Tauri + React + Tailwind + i18n + routing | ✅ Done |
| **M2** | Database: SQLite schema, migrations, Rust CRUD | Pending |
| **M3** | EXIF + Hash: exif.rs, hasher.rs, thumbnail.rs with tests | Pending |
| **M4** | Import Core: Full backend import pipeline | Pending |
| **M5** | Import UI: Wizard + conflict review + progress | Pending |
| **M6** | Timeline: Virtualized timeline + filters | Pending |
| **M7** | Groups: Group management + export | Pending |
| **M8** | Settings: Both modes + persistence | Pending |
| **M9** | Polish: Mode toggle, notifications, error handling | Pending |

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
    FOREIGN KEY (image_id) REFERENCES images(id),
    FOREIGN KEY (group_id) REFERENCES groups(id)
);
```

**Critical**: Never store absolute paths in DB — always relative to `archive_root`.

## Physical Folder Structure

```
{archive_root}/
└── YYYY/
    └── MM - MonthName/
        └── image.jpg
```

**Month folder names are ALWAYS in English** regardless of UI language:
- `01 - January`
- `07 - July`
- `11 - November`

## Design System Tokens (CSS)

```css
:root {
  --color-background: #D2E8F7;   /* Sky background */
  --color-text: #002D58;          /* Deep navy */
  --color-accent: #0084C5;        /* Archive blue - primary buttons */
  --color-tertiary: #2A9EAD;       /* Teal isle - success/sparingly */
  --color-card: #E8F3FB;          /* Card backgrounds */
  --color-surface: #F4F9FD;       /* Inputs, dropdowns */
  --color-border: rgba(0,45,88,0.15);
  --color-muted: rgba(0,45,88,0.55);
  --color-warning: #E6A817;
  --color-error: #C0392B;
  --color-success: #2A9EAD;
}
```

## Button Styles (Tailwind)

| Button | Classes |
|--------|---------|
| Primary | `bg-[#0084C5] text-white` |
| Secondary | `bg-[#002D58] text-[#D2E8F7]` |
| Tertiary | `bg-[#2A9EAD] text-white` |
| Ghost | `bg-transparent text-[#002D58] border border-[#002D58]` |
| Danger | `bg-[#C0392B] text-white` |

## Key Components

### Topbar
- Height: 52px
- Background: `#D2E8F7`
- Contains: Logo (left), Nav links (center), Mode toggle + language (right)

### Mode Toggle (pill)
- Two segments: "Beginner" / "Advanced"
- Active: `bg-[#0084C5] text-white`
- Inactive: `bg-[#F4F9FD] text-[rgba(0,45,88,0.5)]`

### Thumbnail Grid
- Background: `#E8F3FB`
- Border radius: 6px
- EXIF warning dot: 7px circle, `#E6A817`, top-right

## State Management

### Zustand Stores

**useAppConfigStore**: App configuration
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

## Tauri Commands (Backend)

- `scan_source(path)` → List images in source folder
- `analyze_batch(images, archive_path)` → Extract EXIF, compute hash, detect conflicts
- `execute_import(plan, resolutions)` → Copy files to archive
- `get_images(filters)` → Query images from DB
- `create_group(name, image_ids)` → Create group
- `export_group(group_id, dest_path)` → Export group to folder
- `rescan_archive(archive_path)` → Re-scan archive folder

## Critical Rules (Non-Negotiable)

1. **NEVER** store absolute paths in the DB — always relative to `archive_root`
2. **NEVER** move source files — **ALWAYS** copy. Propose deletion only after successful import
3. **NEVER** show a popup per duplicate — collect ALL conflicts and show in `ConflictReviewScreen`
4. **NEVER** create physical folders for groups — groups exist ONLY in the database
5. **NEVER** block the UI during analysis — use Tauri async commands + event emitter
6. **NEVER** delete anything without explicit user confirmation
7. Physical folder names on disk are **ALWAYS** in English regardless of UI language

## Running the App

```bash
# Development
npm run tauri dev

# Build
npm run tauri build
```

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