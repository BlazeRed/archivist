# Archivist

Photographic archive organizer built with Tauri v2 + React + TypeScript.

Archivist helps you import, browse, and organize a local photo archive. Photos are stored in a structured folder layout on disk (`YYYY/MM - MonthName/`) and indexed in a SQLite database. All operations are local — no cloud, no accounts.

## Features

### Import
- Drag-and-drop or button-pick a source folder or individual file
- EXIF date extraction (DateTimeOriginal, CreateDate, DateTime) with filesystem-date fallback for non-EXIF images
- SHA-256-based duplicate detection — re-importing the same file is a no-op
- Conflict review UI: keep existing, replace, or keep both side-by-side
- Optional deletion of source files after import
- Thumbnail generation at import time; thumbnails stored inside the archive

### Timeline
- Browse all archived photos in chronological order with sticky month headers
- Year-range slider and month filter for narrowing the view
- "No Date" filter for images with no date metadata
- Filter by group membership
- Click any photo to open a detail panel showing EXIF metadata, dimensions, file size, group membership, and a Show in Folder button that opens the OS file manager at the image location

### Groups
- Create named logical collections (no physical folders created)
- Add photos from a full-screen picker that mirrors the timeline layout
- Remove individual photos from a group
- Export a group: copies all its photos to a chosen destination folder

### Archive management
- Rescan button in the navbar for quick re-indexing after external changes
- Rescan detects new files, removes stale DB entries, fixes incorrect dates, relocates misplaced files, and generates any missing thumbnails
- Close and re-open an archive without restarting the app

### Other
- Bilingual UI (English / Italian) — folder names on disk always in English regardless of language setting
- Configurable thumbnail size (Small / Medium / Large)
- Native OS tooltip on hover for icon controls

## Archive layout on disk

```
{archive_root}/
├── 2024/
│   └── 06 - June/
│       └── photo.jpg
└── .archivist/
    ├── archivist.db
    └── thumbnails/
        └── {sha256}.jpg
```

## Development

### Prerequisites

- Node.js 20+
- Rust latest stable
- Linux only: `libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf`

### Setup

```bash
npm install
npm run tauri dev
```

### Build (current platform)

```bash
npm run tauri build
```

### Cross-platform release builds

A GitHub Actions workflow is included at `.github/workflows/release.yml`.
Push a `v*` tag to trigger builds for Linux, Windows, and macOS simultaneously:

```bash
git tag v0.1.0
git push origin v0.1.0
```

A draft GitHub Release is created automatically with all platform installers attached.
The workflow can also be triggered manually from the Actions tab (`workflow_dispatch`).

### Bumping the version

Version must be updated in three files before tagging:

| File | Field |
|------|-------|
| `src-tauri/tauri.conf.json` | `"version"` |
| `src-tauri/Cargo.toml` | `version` (line 3) |
| `package.json` | `"version"` |

```bash
# 1. Edit version in all three files (e.g. 0.2.0)

# 2. Commit
git add src-tauri/tauri.conf.json src-tauri/Cargo.toml package.json
git commit -m "chore: bump version to 0.2.0"

# 3. Tag and push — triggers the release workflow
git tag v0.2.0
git push origin main
git push origin v0.2.0
```

Tag name and version in files must match.

| Platform | Artifacts |
|----------|-----------|
| Linux | `.deb`, `.AppImage` |
| Windows | `.msi`, `.exe` (NSIS) |
| macOS | `.dmg` (Intel + Apple Silicon) |

## Tech Stack

| Layer | Technologies |
|-------|-------------|
| Frontend | React 19, TypeScript 5, Tailwind CSS 4, shadcn/ui, Radix UI |
| State | Zustand 5 (6 stores), React Router 7 |
| i18n | i18next + react-i18next (en / it) |
| Backend | Rust, Tauri v2, rusqlite (SQLite bundled) |
| Images | kamadak-exif, image crate, sha2, rayon |
