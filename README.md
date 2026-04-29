# Obscribe

A calm notebook workspace for your notes, projects, and ideas — without the bloat.

This is the Local Alpha test slice: a browser-local Next.js app with notebooks, sections, pages, local persistence, search, quick capture, and a Tiptap editor.

## Tech Stack

- Next.js
- React
- Tiptap / ProseMirror
- Dexie / IndexedDB
- MiniSearch

## Local Development

```bash
npm install
npm run dev
```

Open http://localhost:3000.

## Current Notes

- Notes are stored locally in the browser via IndexedDB.
- There is no account, cloud sync, or AI yet.
- Deletion in this Local Alpha is permanent after confirmation; Trash/restore is planned next.

## Project Brief

See [`PROJECT_BRIEF.md`](./PROJECT_BRIEF.md) for the product decisions, MVP scope, architecture, and roadmap.
