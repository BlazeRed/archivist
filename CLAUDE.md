# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Dev (Tauri + Vite hot reload)
npm run tauri dev

# Build
npm run tauri build

# Frontend only (no Tauri, for quick UI iteration)
npm run dev

# Rust tests
cd src-tauri && cargo test

# TypeScript check
npx tsc --noEmit
```

No JS test suite exists. Rust unit tests live in `exif.rs`, `hasher.rs`, `thumbnail.rs`.

## Architecture

Tauri v2 desktop app. Two runtimes communicate via `invoke()`:

**Frontend** (`src/`) — React 19 + TypeScript + Tailwind v4 + Zustand v5 + react-router-dom v7

**Backend** (`src-tauri/src/`) — Rust. All Tauri commands defined in `lib.rs` and delegated to:
- `commands/import.rs` — scan → analyze → plan → execute pipeline
- `commands/export.rs` — group export
- `db/image.rs`, `db/group.rs` — SQLite CRUD via rusqlite
- `exif.rs` — EXIF date extraction with filesystem-date fallback
- `hasher.rs` — SHA256 used as image primary key
- `thumbnail.rs` — generates thumbnails at import time
- `state.rs` — `Arc<AppState>` shared across commands (holds DB handle + archive path)
- `error.rs` — unified `AppError` type, serde-serialized to frontend

**DB**: SQLite at `{archive_path}/.archivist/archivist.db`. Dev DB hardcoded to `/tmp/archivist.db` in `lib.rs:run()`.

**Config**: JSON at `{app_data}/app_config.json`, managed by `appConfigStore.ts` via Tauri's file system API.

## State Stores (Zustand)

| Store | Owns |
|-------|------|
| `appConfigStore` | `AppConfig` (archive path, language, ui_mode, thumbnail_size) |
| `dataStore` | All images + groups loaded from DB |
| `importStore` | Import wizard state machine (scanning → analyzing → review → importing → complete) |
| `timelineStore` | Year/month filter + selected image |
| `groupUIStore` | Multi-selection state for group assignment |
| `notificationStore` | Toast queue |

## Critical Rules

1. **Never** store absolute paths in DB — always relative to `archive_root`
2. **Always copy** source files during import — never move. Propose deletion only after successful import
3. **Collect all conflicts** before showing UI — never one popup per duplicate, use `ConflictReview`
4. **Groups are DB-only** — never create physical folders for groups
5. **Never block UI** during analysis — Tauri async commands only
6. **Never delete** without explicit user confirmation
7. **Folder names on disk always in English** regardless of UI language (`01 - January`, not `01 - Gennaio`)

## Physical Archive Layout

```
{archive_root}/
└── YYYY/
    └── MM - MonthName/     ← always English, always this format
        └── image.jpg
```

## Design Tokens

All colors defined as CSS vars in `src/index.css`. Use these — never hardcode hex elsewhere:

```
--color-background: #D2E8F7
--color-text:       #002D58
--color-accent:     #0084C5   ← primary buttons
--color-tertiary:   #2A9EAD   ← success / sparingly
--color-card:       #E8F3FB
--color-surface:    #F4F9FD   ← inputs, dropdowns
--color-warning:    #E6A817
--color-error:      #C0392B
```

Button variant classes: Primary `bg-[#0084C5] text-white`, Secondary `bg-[#002D58] text-[#D2E8F7]`, Ghost `bg-transparent border border-[#002D58] text-[#002D58]`, Danger `bg-[#C0392B] text-white`.

## i18n

`src/i18n/index.ts` bootstraps i18next with `en`/`it` locales. All UI strings go through `useTranslation()` — no hardcoded user-visible strings in components. Language stored in `AppConfig.language`.

## Image Identity

SHA256 hash = image primary key (`id` in DB). Duplicate detection is hash-based. Thumbnails stored inside archive at `.archivist/thumbnails/{id}.jpg`.
