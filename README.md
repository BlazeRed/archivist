# Archivist

<p align="center">
  <img src="screenshots/timeline.png" alt="Archivist Timeline" width="800" />
</p>

<p align="center">
  <img alt="Platform" src="https://img.shields.io/badge/platform-Linux%20%7C%20Windows%20%7C%20macOS-0084C5">
  <img alt="Tauri" src="https://img.shields.io/badge/Tauri-v2-24C8D8?logo=tauri&logoColor=white">
  <img alt="Rust" src="https://img.shields.io/badge/Rust-stable-CE422B?logo=rust&logoColor=white">
  <img alt="React" src="https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white">
</p>

<p align="center"><em>Your media, organized locally. No cloud. No accounts. No subscription.</em></p>

Archivist is a desktop media archive organizer that imports, indexes, and browses your photos and videos in a clean folder layout on disk — entirely offline, with no external services.

## Screenshots

<table>
  <tr>
    <td><img src="screenshots/timeline-filters.png" alt="Timeline" /></td>
    <td><img src="screenshots/import.png" alt="Import Wizard" /></td>
  </tr>
  <tr>
    <td align="center"><em>Timeline — browse by date with filters</em></td>
    <td align="center"><em>Import — source → destination with duplicate detection</em></td>
  </tr>
  <tr>
    <td><img src="screenshots/detail.png" alt="Fullscreen viewer" /></td>
    <td><img src="screenshots/groups.png" alt="Groups" /></td>
  </tr>
  <tr>
    <td align="center"><em>Viewer — fullscreen with EXIF metadata panel</em></td>
    <td align="center"><em>Groups — logical collections, no extra folders</em></td>
  </tr>
  <tr>
    <td><img src="screenshots/map.png" alt="Map" /></td>
    <td><img src="screenshots/dark-theme.png" alt="Dark theme" /></td>
  </tr>
  <tr>
    <td align="center"><em>Map — photos placed by GPS location</em></td>
    <td align="center"><em>Light and dark theme</em></td>
  </tr>
</table>

## Why Archivist?

- **100% local** — all data stays on your machine, zero telemetry, works fully offline
- **Duplicate-proof** — SHA-256 hash detection; re-importing the same photo is a no-op
- **Non-destructive** — always copies on import, never moves; originals untouched
- **Clean disk layout** — `YYYY/MM - MonthName/` folders you can browse without the app
- **Fast** — Rust backend with parallel processing and a thumbnail cache

## Download

Grab the latest installer from [**GitHub Releases**](../../releases/latest).

| Platform | Installer |
|----------|-----------|
| Linux    | `.deb`, `.AppImage` |
| Windows  | `.msi`, `.exe` (NSIS) |
| macOS    | `.dmg` (Intel + Apple Silicon) |

## Features

### Import
- **One page, source → destination** — pick the source (folder or files, drag-and-drop or button) and the destination in any order; the destination defaults to the open archive but can be any other archive
- **Automatic analysis** as soon as both are set; changing the destination only re-plans, hashes are reused
- **EXIF date extraction** — DateTimeOriginal, CreateDate, DateTime, filename-pattern parsing, with original filesystem-mtime preserved as last fallback
- **SHA-256 duplicate detection** — re-importing the same file is a no-op
- **Conflict review** — choose a resolution per item or apply one to all, before anything is copied
- **Completion summary** with stats and an error list; source cleanup is an optional action that always asks for confirmation

### Timeline
- Browse all archived media in chronological order with sticky month headers
- **Media type filter** — All / Images / Videos toggle
- Year-range slider and month filter for narrowing the view
- **No Date** filter for media with no date metadata
- Filter by group membership
- **Preview panel** on the right (resizable) with metadata, dimensions, file size, group membership, favourite toggle and **Show in Folder**
- **Keyboard navigation** — arrows to move, Enter to open, Esc to step back
- Multi-select with a floating action bar (favourite, add to group, move to trash)

### Fullscreen viewer
- Full-window view with previous / next navigation
- Metadata panel on demand (EXIF, location with a link to the map)

### Videos
- Full video playback in the preview and viewer
- Duration displayed on thumbnail
- On-demand transcoding for formats not natively supported by the browser

### Map
- Media with GPS coordinates shown as pins, clustered when zoomed out
- Click a pin to see its photos

### Favourites
- Star any media from the preview, the viewer or a multi-selection
- Dedicated Favourites page for quick access

### Groups
- Create named logical collections — no physical folders created on disk
- Add media from a full-screen picker that mirrors the timeline layout
- Remove individual items from a group, choose the cover image
- **Export a group** — copies all its files to a chosen destination folder

### Trash
- Deleted media are moved to a `Trash/` folder inside the archive — Archivist never deletes files itself
- Restore single items or everything from the Trash page; emptying `Trash/` is left to you

### Archive management
- **Rescan** button in the navbar for quick re-indexing after external changes
- Rescan detects new files, relinks files moved by hand, fixes incorrect dates, relocates misplaced files, and generates missing thumbnails
- Files missing from disk are **reported, never removed automatically** — you confirm which entries to drop
- **Regenerate thumbnails** from Settings
- Close and re-open an archive without restarting the app

### Settings
- Light / dark / system theme
- Bilingual UI (English / Italian) — folder names on disk are always in English regardless of language setting
- Configurable thumbnail size (Small / Medium / Large)

## Archive layout on disk

```
{archive_root}/
├── 2024/
│   └── 06 - June/
│       └── photo.jpg
├── Trash/
│   └── ...
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
| State | Zustand 5 (8 stores), React Router 7 |
| i18n | i18next + react-i18next (en / it) |
| Backend | Rust, Tauri v2, rusqlite (SQLite bundled) |
| Media | nom-exif, image crate, sha2, rayon, ffmpeg-sidecar |
