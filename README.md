# Archivist

Photographic archive organizer built with Tauri + React + TypeScript.

## Features

- Import photos with automatic date detection from EXIF metadata
- Timeline view for browsing photos by date
- Group management for organizing photos
- Bilingual support (English / Italian)
- Beginner and Advanced UI modes

## Development

### Prerequisites

- Node.js 18+
- Rust (latest stable)
- For Linux: `libwebkit2gtk-4.1-dev`, `libssl-dev`, `libsoup-3.0-dev`

### Setup

```bash
npm install
npm run tauri dev
```

### Build

```bash
npm run tauri build
```

## Tech Stack

- **Frontend**: React, TypeScript, Tailwind CSS, React Router, Zustand, i18next
- **Backend**: Rust, Tauri, SQLite