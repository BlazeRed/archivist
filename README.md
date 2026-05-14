# Archivist

Photographic archive organizer built with Tauri v2 + React + TypeScript.

## Features

- Import photos with automatic EXIF date detection and SHA-256 duplicate prevention
- Timeline view with year-range slider and month filter for browsing by date
- Group management: create, rename, and organize logical photo collections
- Add photos to groups via a full-screen picker with the same timeline structure
- Export groups to a destination folder
- Archive rescan to pick up manually added files
- Bilingual UI (English / Italian) — folder names always in English on disk

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
