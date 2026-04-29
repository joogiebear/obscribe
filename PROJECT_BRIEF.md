# Obscribe Project Brief

## One-line Concept

**Obscribe is a calm notebook workspace for your notes, projects, and ideas — without the bloat.**

It combines the approachable structure of notebooks with the flexibility of a lightweight Notion-style editor, optimized for solo thinkers, writers, researchers, and personal knowledge workers.

---

## Product Positioning

### Primary Audience

Obscribe is for solo users who want flexible notes without the complexity of Notion:

- Writers and thinkers
- Personal knowledge workers
- Researchers and messy-note people
- Users who feel Notion is too much
- People who want a calmer, faster personal workspace

### Not For MVP

Obscribe is **not** initially for:

- Teams
- Real-time collaboration
- Full database workflows
- Project management-heavy use cases
- Native mobile or desktop-first usage
- AI-first workspace/chat over all notes

### Core Promise

> A calmer, faster Notion that feels like a notebook.

### Brand Voice

Warm, practical, and thoughtful.

Example tone:

> Capture the thought. Shape it later.

Avoid:

- productivity hustle
- corporate SaaS language
- overly precious notebook cosplay
- excessive Notion comparisons once the product has its own identity

---

## Core Product Model

### Information Architecture

The product is organized as:

```text
Notebook → Section → Page
```

This is the primary mental model. Backlinks and page links exist, but they are secondary power features, not the main organizing principle.

### Main Objects

#### Notebook

A top-level personal workspace container.

Fields/behavior:

- name
- notebook-level accent color
- manual order
- archived state
- trashed state
- timestamps
- sections

#### Section

A notebook subdivision, visually represented with tabs.

Default starter sections:

- Inbox
- Journal
- Projects
- References

Fields/behavior:

- name
- parent notebook
- manual order
- archived state
- trashed state
- timestamps
- pages

#### Page

The primary writing/editing surface.

Fields/behavior:

- title, auto-derived from first heading/first line
- temporary fallback title: `Untitled`
- parent notebook/section
- pinned state
- manual order
- archived state
- trashed state
- timestamps
- Tiptap/ProseMirror JSON content
- derived indexes for search, tags, backlinks, todos, headings

#### Inbox Item

A lightweight global capture object.

Supports:

- text
- links
- attachments
- optional notebook destination
- filing into existing page
- converting into new page
- sending to Today page if daily notes are enabled

Inbox items are not full pages until filed or expanded.

---

## MVP Product Scope

### MVP Type

The first serious milestone is **Local Alpha**.

Local Alpha should be a real local-first app, not just a prototype. It should prove the core notebook workspace loop.

### Local Alpha Includes

- Notebook dashboard
- Notebook creation
- Section creation
- Page creation
- Notebook shelf + section tabs
- Manual page ordering
- Pinned pages
- Tiptap/ProseMirror editor
- Markdown shortcuts that convert as you type
- Slash-command block insertion
- Local persistence with Dexie/IndexedDB
- Offline create/edit/browse/search
- Search and basic command palette
- Quick capture inbox
- Todos
- Callouts
- Images/files
- Basic static tables
- Basic safe deletion behavior if deletion exists

### Local Alpha Does Not Include

- Accounts
- Sync
- AI
- Collaboration
- Public sharing
- Polished marketing onboarding
- Full export system
- Backlinks/page previews, unless cheap after core loop
- Full Archive/Trash UI beyond minimal soft-delete safety

---

## Full MVP Feature Set

After Local Alpha and polish, the MVP should include the following.

### Home Dashboard

Default home screen is a notebook dashboard with:

- quick capture box
- recent pages
- notebook cards
- inbox count

### Notebook Navigation

Navigation should feel notebook-native, not like a generic SaaS tree.

Preferred structure:

- notebook shelf
- section tabs
- small page list inside the active section

Pages should support:

- manual ordering
- pinned pages
- drag-and-drop within a section
- drag-and-drop between sections
- Move command/dialog fallback

### Page Editor

Editor foundation:

- Tiptap/ProseMirror
- JSON document source of truth
- Markdown/PDF export generated from JSON

Editor behavior:

- writing-first rich text surface
- Markdown shortcuts convert as typed
- slash commands insert blocks only
- broader actions live in command palette
- local undo/redo in MVP
- page history/snapshots later

### MVP Slash Blocks

Slash commands should insert:

- Heading
- Todo
- Bullet list
- Numbered list
- Quote
- Callout
- Image/file
- Table
- Divider

### Structured Blocks

#### Todos

- simple checkboxes only
- no due dates
- no reminders
- no separate task manager

#### Callouts

MVP callout types:

- Note
- Idea
- Warning
- Quote
- Question

Light customization can come later.

#### Images / Files

- inline attachments only
- drag/drop into page
- no attachment library in MVP

#### Tables

- basic static tables only
- rows and columns with text
- no column types
- no sorting/filtering/views
- no database behavior

### Links and Backlinks

Page links:

- support `[[Page Name]]`
- typing `[[New Page]]` creates a placeholder page automatically

Backlinks:

- automatic backlinks panel
- bottom backlinks panel first
- right sidebar later
- no graph view in MVP

Page previews:

- hover preview for `[[page links]]` in MVP
- no page-list preview cards initially

### Page Outlines

- auto-generated from headings
- available from small page menu or collapsible panel

### Tags

Tags should work naturally:

- basic hashtags inside pages, e.g. `#idea`
- page-level tag display
- indexed for search/filtering
- no heavy tag manager in MVP

### Search and Command Palette

Search should include:

- full-text search across pages
- notebooks
- sections
- tags
- archived filter support

Architecture:

- Dexie metadata filters
- MiniSearch full-text index

Command palette should support:

- navigation
- creation
- core editor/page actions

Examples:

- open page/notebook/section
- create page/notebook/section
- insert common blocks
- move/archive page
- export page

### Keyboard Shortcuts

MVP priority:

- `Cmd/Ctrl+K` command palette
- `Cmd/Ctrl+Shift+F` search
- `Cmd/Ctrl+N` new page
- `Cmd/Ctrl+Shift+I` quick capture
- standard formatting shortcuts

Custom shortcuts can wait.

### Daily Notes

Daily notes are:

- off by default
- easy to enable
- available as quick capture destination with “send to today”

Obscribe remains notebook-first, not journal-first.

### Templates

MVP includes built-in templates only.

Templates:

- Blank Page
- Project Plan
- Reading Notes
- Journal Entry
- Research Notes
- Idea Brief

User-created templates come later.

### Onboarding

First-run flow:

- no account required
- create first notebook wizard
- ask notebook name
- suggest starter sections
- open an editable welcome page

Welcome page teaches:

- notebook/section/page model
- slash commands
- `[[page links]]`
- todos
- callouts
- quick capture/inbox

Empty states:

- helpful prompts
- restrained template suggestions where relevant

### Archive and Trash

Deletion should never be instant/destructive by default.

MVP behavior:

- Archive + Trash
- applies to pages, sections, and notebooks
- archived items hidden from normal navigation
- Archive view/filter available
- search excludes archived by default unless “include archived” is enabled
- Trash preserves hierarchy/content
- permanent deletion is manual only

### Export

#### Markdown Export

MVP:

- individual page export first
- export `.md` plus asset folder
- image/file links rewritten relative to asset folder

Later:

- section export
- notebook export
- JSON backup

#### PDF Export

MVP:

- clean browser print-to-PDF for individual pages
- use print stylesheet

---

## AI Scope

AI is not part of Local Alpha.

For MVP or early premium phase, AI should be light and explicit.

Privacy principle:

- no background scanning
- no surprise uploads
- user explicitly invokes AI on selected text or a page

AI actions:

- Improve writing
- Summarize
- Extract todos
- Suggest tags
- Suggest title

Architecture should leave room for smarter organization later, such as suggested filing destinations, but that is not MVP-default behavior.

---

## Storage, Privacy, and Sync

### Local-first Direction

Obscribe should be local-first.

MVP behavior:

- no account required to start
- create/edit/browse/search offline
- local notebooks stored client-side
- app usable without internet

### Local Storage

Use:

- Dexie over IndexedDB

Reasons:

- practical browser-native local-first storage
- mature IndexedDB wrapper
- good developer experience
- enough querying for MVP

### Page Content Storage

Use:

- Tiptap/ProseMirror editor JSON as source of truth
- Markdown/PDF generated on export

Avoid:

- Markdown-only source of truth
- dual-writing JSON and Markdown

### Derived Indexes

Maintain lightweight derived indexes from page JSON:

- full-text search text
- headings
- backlinks/page links
- tags
- todos
- metadata filters

### Sync Later

Paid sync should use:

- change log / operation log sync
- stable IDs
- `createdAt`
- `updatedAt`
- `deletedAt`
- revision/change metadata

Conflict handling:

- keep conflicting copies for early sync
- example: `Page conflicted copy from MacBook`
- smarter merging later
- no last-write-wins data loss

### Backend Later

Use Supabase for sync/auth/storage backend v1, with a custom sync API layer when needed.

Supabase should support:

- auth
- cloud storage
- sync backend records
- AI API access gating later

### Privacy

MVP:

- local-first
- no account required
- clear privacy posture

Paid sync later:

- encryption in transit
- encryption at rest

Do not promise full E2EE in MVP because it complicates:

- AI
- sharing
- account recovery
- sync ergonomics

---

## Business Model

Direction:

- free local/PWA core
- paid sync
- paid AI

Rationale:

Users own their local notes. Cloud convenience, backup, cross-device sync, and AI helpers are premium.

---

## Visual Design Direction

### Overall Feel

Cozy notebook, restrained.

Keywords:

- warm
- focused
- premium
- calm
- tactile but not gimmicky

Avoid:

- fake leather notebook styling
- childish decoration
- generic SaaS dashboard look
- excessive visual clutter

### Design System

Use:

- shadcn/ui + Tailwind
- customized heavily

Visual anchors:

- section tabs
- warm page canvas
- subtle paper texture
- soft dividers
- calm typography
- notebook-level accent colors

Themes:

- light mode
- dark mode
- notebook-level accent colors

Accent colors apply to notebooks only.

---

## Technical Architecture

### App Stack

Use:

- Next.js
- React
- PWA-first approach
- shadcn/ui
- Tailwind
- Tiptap/ProseMirror
- Dexie/IndexedDB
- MiniSearch

Backend/API routes can be added later for:

- sync
- auth
- AI

### Recommended Data Model Sketch

Entities:

- `notebooks`
- `sections`
- `pages`
- `pageContents`
- `inboxItems`
- `attachments`
- `searchIndex`
- `pageLinks`
- `tags`
- `todosIndex`
- `headingsIndex`
- `changes` later for sync

Core principles:

- stable IDs from day one
- soft deletion support
- archive state support
- manual ordering fields
- timestamps everywhere
- revision/change metadata where useful
- content JSON stored separately or cleanly enough to index

Possible fields:

```ts
type Notebook = {
  id: string
  name: string
  accentColor: string
  order: number
  archivedAt?: string | null
  trashedAt?: string | null
  createdAt: string
  updatedAt: string
  deletedAt?: string | null
}

type Section = {
  id: string
  notebookId: string
  name: string
  order: number
  archivedAt?: string | null
  trashedAt?: string | null
  createdAt: string
  updatedAt: string
  deletedAt?: string | null
}

type Page = {
  id: string
  notebookId: string
  sectionId: string
  title: string
  titleSource: 'manual' | 'auto' | 'untitled'
  pinned: boolean
  order: number
  archivedAt?: string | null
  trashedAt?: string | null
  createdAt: string
  updatedAt: string
  deletedAt?: string | null
  revision: number
}

type PageContent = {
  pageId: string
  doc: unknown // Tiptap JSON
  plainText: string
  updatedAt: string
}
```

---

## Build Roadmap

### Phase 0 — Project Setup

- Create Next.js app
- Add Tailwind
- Add shadcn/ui
- Add Dexie
- Add Tiptap
- Add MiniSearch
- Configure PWA basics
- Establish app layout shell

### Phase 1 — Vertical Slice

Goal:

```text
create notebook → create section → create page → edit content → persist locally → find it again
```

Build:

- Dexie schema
- stable ID generation
- notebook dashboard skeleton
- notebook creation modal
- starter sections toggle
- notebook view
- section tabs
- page list
- page creation
- Tiptap editor
- local save/load
- basic text search

### Phase 2 — Editor Blocks

Build:

- Markdown shortcuts
- slash command menu
- headings
- todos
- bullet/numbered lists
- quote
- divider
- callouts
- image/file attachment block
- basic static tables

### Phase 3 — Navigation and Speed

Build:

- command palette
- keyboard shortcuts
- quick capture inbox
- recent pages
- pinned pages
- manual ordering
- drag/drop movement
- Move command

### Phase 4 — Local Alpha Polish

Build/refine:

- offline reliability
- search quality
- empty states
- soft-delete safety if deletion exists
- visual notebook polish
- dark mode
- notebook accent colors
- performance pass

Outcome:

Local Alpha is ready for personal daily-use testing.

### Phase 5 — Tester Prep

After Local Alpha:

- usability polish pass
- invite 3–5 testers
- guided setup flow
- feedback collection

Tester mix:

- 1 builder/friend for brutal UX feedback
- 1–2 “Notion is too much” users
- 1–2 writers/researchers/PKM users

Tester task:

- create a notebook
- make sections/pages
- capture a few thoughts
- write one real note/project/research page
- search for something
- report friction/delight

Feedback questions:

- What felt confusing?
- What felt surprisingly nice?
- Where did you hesitate?
- What would make you come back tomorrow?
- What current tool/workflow could this replace?

### Phase 6 — MVP Completion

Add after Local Alpha feedback:

- backlinks panel
- `[[page links]]`
- hover previews
- archive/trash full behavior
- Markdown export
- PDF print stylesheet
- templates
- onboarding welcome page
- heading outline

### Phase 7 — Public Launch

Launch publicly after tiny tester feedback is addressed.

Do not wait for:

- sync
- AI
- native apps
- team collaboration

Public launch should be a polished local-first notebook MVP.

---

## Initial Success Criteria

MVP success means:

1. Users can create notebooks, sections, pages, write, search, export, and use Obscribe offline.
2. The app feels good enough that we personally want to use it daily.
3. 5–10 people try it and some say it could replace part of Notion, Apple Notes, Obsidian, OneNote, or Evernote for them.

The real bar:

> If Obscribe does not feel good enough to use daily, it is not ready, even if the checklist is complete.

---

## Locked Decisions Summary

- Solo-first, not team-first
- Notebook → Section → Page model
- Writing-first hybrid pages with optional blocks
- Calm, faster Notion that feels like a notebook
- Light structure first
- Global quick capture inbox
- Web + installable PWA first
- Markdown shortcuts + slash commands
- Handwriting/sketching later, architecture-aware
- MVP blocks: todos, callouts, images/files, simple tables
- Simplified Collections later, not full databases now
- Cozy restrained notebook visuals
- Notebook shelf + section tabs
- Notebook dashboard home
- Global Inbox with optional notebook destination
- Light AI later, explicit actions only
- Local-first architecture
- Free local core + paid sync/AI
- No account required to start
- No collaboration in MVP
- Markdown + PDF export
- First notebook wizard
- Starter sections: Inbox, Journal, Projects, References
- Manual page ordering + pinned pages
- Hashtags inside pages + page-level display
- Full-text search + command palette
- Page links + backlinks panel
- Placeholder page auto-created from `[[New Page]]`
- Daily notes off by default
- Built-in templates first
- Simple checkboxes only
- Inline attachments only
- Basic static tables only
- Callout types
- Local undo/redo first, page history later
- Fully usable offline
- Sync conflicts create copies
- No full E2EE promise in MVP
- Tiptap/ProseMirror editor
- Next.js + React stack
- Dexie/IndexedDB local storage
- Editor JSON source of truth
- Derived block/search indexes
- MiniSearch + Dexie filtering
- Operation log sync later
- Supabase backend later
- Local Alpha first
- Vertical slice first
- shadcn/ui + Tailwind
- Tabs and paper visual system
- Light/dark/accent colors
- Notebook-level accent colors
- Multiple page creation paths
- Auto-title from first heading/line
- Archive + Trash
- Manual Trash emptying
- Archived hidden by default, filterable
- Inbox items: text + links + attachments
- Bottom backlinks panel first
- Hover preview for page links
- Auto-generated heading outline
- Slash menu inserts blocks only
- Plain links in MVP
- Individual page export first
- Welcome page onboarding
- Launch to “Notion is too much” users
- Stop grilling at 100 and build from this brief
