'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import MiniSearch from 'minisearch';
import { BookOpen, CalendarDays, CheckCircle2, Inbox, ListTodo, Pencil, Plus, RotateCcw, Search, Sparkles, Trash2, XCircle } from 'lucide-react';
import AuthPanel from './AuthPanel';
import { db } from '@/lib/db';
import { supabase } from '@/lib/supabase';
import type { Notebook, PageRecord, Section } from '@/lib/types';
import { emptyDoc, tagsFromText, textFromDoc, titleFromText } from '@/lib/doc';
import type { JSONContent } from '@tiptap/react';
import type { User } from '@supabase/supabase-js';

const Editor = dynamic(() => import('./Editor'), { ssr: false });

const starterSections = ['Inbox', 'Journal', 'Projects', 'References'];
const colors = ['#d97706', '#dc6b8a', '#7c8f45', '#5b8fb9', '#8b6fb3'];

const alphaLimits = {
  notebooks: 50,
  sections: 500,
  pages: 5000,
  pageContentBytes: 350_000,
  quickCaptureChars: 4_000,
  notebookNameChars: 80,
  pageTitleChars: 160
};

function jsonBytes(value: unknown) {
  return new TextEncoder().encode(JSON.stringify(value)).length;
}


type CloudNotebook = {
  id: string;
  name: string;
  accent_color: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
  trashed_at?: string | null;
};

type CloudSection = {
  id: string;
  notebook_id: string;
  name: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
  trashed_at?: string | null;
};

type CloudPage = {
  id: string;
  notebook_id: string;
  section_id: string;
  title: string;
  title_source: 'auto' | 'manual' | 'untitled';
  pinned: boolean;
  sort_order: number;
  content: JSONContent;
  plain_text: string;
  tags: string[];
  created_at: string;
  updated_at: string;
  trashed_at?: string | null;
};

function newId() {
  return crypto.randomUUID();
}

function toNotebook(row: CloudNotebook): Notebook {
  return { id: row.id, name: row.name, accentColor: row.accent_color, order: row.sort_order, createdAt: row.created_at, updatedAt: row.updated_at, trashedAt: row.trashed_at ?? null };
}

function toSection(row: CloudSection): Section {
  return { id: row.id, notebookId: row.notebook_id, name: row.name, order: row.sort_order, createdAt: row.created_at, updatedAt: row.updated_at, trashedAt: row.trashed_at ?? null };
}

function toPage(row: CloudPage): PageRecord {
  return { id: row.id, notebookId: row.notebook_id, sectionId: row.section_id, title: row.title, titleSource: row.title_source, pinned: row.pinned, order: row.sort_order, content: row.content, plainText: row.plain_text, tags: row.tags ?? [], createdAt: row.created_at, updatedAt: row.updated_at, trashedAt: row.trashed_at ?? null };
}

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object') {
    const maybe = error as { message?: unknown; details?: unknown; hint?: unknown; code?: unknown };
    return [maybe.message, maybe.details, maybe.hint, maybe.code].filter(Boolean).join(' · ') || JSON.stringify(error);
  }
  return String(error || 'Unknown startup error');
}

function welcomePageContent(): JSONContent {
  return {
    type: 'doc',
    content: [
      { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Welcome to Obscribe' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'This is the first clickable Local Alpha slice: notebooks, section tabs, pages, saving, and search.' }] },
      { type: 'taskList', content: [
        { type: 'taskItem', attrs: { checked: true }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Create a notebook' }] }] },
        { type: 'taskItem', attrs: { checked: false }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Write a real note' }] }] }
      ]},
      { type: 'paragraph', content: [{ type: 'text', text: 'Try adding #ideas or searching for “Local Alpha”.' }] }
    ]
  };
}

type StarterPageKind = 'daily' | 'checklist' | 'study' | 'project';

const starterPageOptions: Array<{ kind: StarterPageKind; label: string; helper: string; icon: typeof CalendarDays }> = [
  { kind: 'daily', label: 'Daily note', helper: 'Date, focus, loose thoughts', icon: CalendarDays },
  { kind: 'checklist', label: 'Checklist', helper: 'A simple page of tasks', icon: ListTodo },
  { kind: 'study', label: 'Study notes', helper: 'Topic, key points, questions', icon: BookOpen },
  { kind: 'project', label: 'Project page', helper: 'Goal, next steps, notes', icon: Sparkles }
];

function todayTitle() {
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date());
}

function starterPageContent(kind: StarterPageKind): { title: string; content: JSONContent } {
  if (kind === 'daily') {
    const title = todayTitle();
    return {
      title,
      content: { type: 'doc', content: [
        { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: title }] },
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Focus' }] },
        { type: 'paragraph' },
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Notes' }] },
        { type: 'paragraph' }
      ] }
    };
  }

  if (kind === 'checklist') {
    return {
      title: 'Checklist',
      content: { type: 'doc', content: [
        { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Checklist' }] },
        { type: 'taskList', content: [
          { type: 'taskItem', attrs: { checked: false }, content: [{ type: 'paragraph' }] },
          { type: 'taskItem', attrs: { checked: false }, content: [{ type: 'paragraph' }] },
          { type: 'taskItem', attrs: { checked: false }, content: [{ type: 'paragraph' }] }
        ] }
      ] }
    };
  }

  if (kind === 'study') {
    return {
      title: 'Study Notes',
      content: { type: 'doc', content: [
        { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Study Notes' }] },
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Topic' }] },
        { type: 'paragraph' },
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Key points' }] },
        { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph' }] }] },
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Questions' }] },
        { type: 'paragraph' }
      ] }
    };
  }

  return {
    title: 'Project Page',
    content: { type: 'doc', content: [
      { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Project Page' }] },
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Goal' }] },
      { type: 'paragraph' },
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Next steps' }] },
      { type: 'taskList', content: [
        { type: 'taskItem', attrs: { checked: false }, content: [{ type: 'paragraph' }] },
        { type: 'taskItem', attrs: { checked: false }, content: [{ type: 'paragraph' }] }
      ] },
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Notes' }] },
      { type: 'paragraph' }
    ] }
  };
}

export default function ObscribeApp() {
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [notebooks, setNotebooks] = useState<Notebook[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [pages, setPages] = useState<PageRecord[]>([]);
  const [activeNotebookId, setActiveNotebookId] = useState<string>();
  const [activeSectionId, setActiveSectionId] = useState<string>();
  const [activePageId, setActivePageId] = useState<string>();
  const [query, setQuery] = useState('');
  const [capture, setCapture] = useState('');
  const [operationError, setOperationError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [showTrash, setShowTrash] = useState(false);
  const [trashedNotebooks, setTrashedNotebooks] = useState<Notebook[]>([]);
  const [trashedSections, setTrashedSections] = useState<Section[]>([]);
  const [trashedPages, setTrashedPages] = useState<PageRecord[]>([]);
  const [showNotebookModal, setShowNotebookModal] = useState(false);
  const [newNotebookName, setNewNotebookName] = useState('');
  const [newNotebookColor, setNewNotebookColor] = useState(colors[0]);
  const [includeStarterSections, setIncludeStarterSections] = useState(true);
  const [confirmModal, setConfirmModal] = useState<{ title: string; body: string; confirmLabel: string; destructive?: boolean; onConfirm: () => Promise<void> } | null>(null);
  const saveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const isCloudMode = Boolean(user && supabase);

  useEffect(() => {
    async function boot() {
      setReady(false);
      const currentUser = supabase ? (await supabase.auth.getUser()).data.user : null;
      setUser(currentUser ?? null);
      await loadWorkspace(currentUser ?? null);
      setReady(true);
    }

    boot().catch((error: unknown) => {
      console.error('Failed to open Obscribe notebook', error);
      setLoadError(errorMessage(error));
      setReady(true);
    });

    if (!supabase) return;
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      const nextUser = session?.user ?? null;
      setUser(nextUser);
      setReady(false);
      loadWorkspace(nextUser)
        .then(() => setReady(true))
        .catch((error: unknown) => {
          console.error('Failed to switch Obscribe workspace', error);
          setLoadError(errorMessage(error));
          setReady(true);
        });
    });
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    return () => {
      Object.values(saveTimers.current).forEach(clearTimeout);
    };
  }, []);

  async function loadWorkspace(currentUser: User | null) {
    if (currentUser && supabase) {
      await loadCloudWorkspace(currentUser.id);
    } else {
      await loadLocalWorkspace();
    }
  }

  async function loadLocalWorkspace() {
    let allBooks = await db.notebooks.orderBy('order').toArray();
    let books = allBooks.filter((book) => !book.trashedAt);
    const localStarterKey = 'obscribe-local-starter-created';
    if (!allBooks.length && localStorage.getItem(localStarterKey) !== 'true') {
      const now = new Date().toISOString();
      const notebook: Notebook = { id: newId(), name: 'My First Notebook', accentColor: colors[0], order: 0, createdAt: now, updatedAt: now };
      const secs: Section[] = starterSections.map((name, order) => ({ id: newId(), notebookId: notebook.id, name, order, createdAt: now, updatedAt: now }));
      const content = welcomePageContent();
      const plainText = textFromDoc(content);
      const page: PageRecord = { id: newId(), notebookId: notebook.id, sectionId: secs[0].id, title: 'Welcome to Obscribe', titleSource: 'manual', pinned: true, order: 0, content, plainText, tags: tagsFromText(plainText), createdAt: now, updatedAt: now };
      await db.transaction('rw', db.notebooks, db.sections, db.pages, async () => {
        await db.notebooks.add(notebook);
        await db.sections.bulkAdd(secs);
        await db.pages.add(page);
      });
      localStorage.setItem(localStarterKey, 'true');
      allBooks = [notebook];
      books = [notebook];
    }
    const allSecs = await db.sections.orderBy('order').toArray();
    const allPgs = await db.pages.orderBy('order').toArray();
    setTrashedNotebooks(allSecs.length || allPgs.length || allBooks.length ? allBooks.filter((book) => book.trashedAt) : []);
    setTrashedSections(allSecs.filter((section) => section.trashedAt));
    setTrashedPages(allPgs.filter((page) => page.trashedAt));
    setWorkspace(books, allSecs.filter((section) => !section.trashedAt), allPgs.filter((page) => !page.trashedAt));
  }

  async function loadCloudWorkspace(userId: string) {
    if (!supabase) return;
    const starterKey = `obscribe-cloud-starter-created:${userId}`;
    const starterAlreadyCreated = localStorage.getItem(starterKey) === 'true';
    const { count: totalNotebookCount, error: notebookCountError } = await supabase.from('notebooks').select('id', { count: 'exact', head: true });
    if (notebookCountError) throw notebookCountError;

    if (!totalNotebookCount && !starterAlreadyCreated) {
      await createCloudStarterWorkspace(userId);
      localStorage.setItem(starterKey, 'true');
    }

    const [{ data: cloudNotebooks, error: nError }, { data: cloudSections, error: sError }, { data: cloudPages, error: pError }] = await Promise.all([
      supabase.from('notebooks').select('*').is('trashed_at', null).order('sort_order'),
      supabase.from('sections').select('*').is('trashed_at', null).order('sort_order'),
      supabase.from('pages').select('*').is('trashed_at', null).order('sort_order')
    ]);
    if (nError) throw nError;
    if (sError) throw sError;
    if (pError) throw pError;

    setWorkspace((cloudNotebooks ?? []).map(toNotebook), (cloudSections ?? []).map(toSection), (cloudPages ?? []).map(toPage));

    const [{ data: trashBooks }, { data: trashSections }, { data: trashPages }] = await Promise.all([
      supabase.from('notebooks').select('*').not('trashed_at', 'is', null).order('trashed_at', { ascending: false }),
      supabase.from('sections').select('*').not('trashed_at', 'is', null).order('trashed_at', { ascending: false }),
      supabase.from('pages').select('*').not('trashed_at', 'is', null).order('trashed_at', { ascending: false })
    ]);
    setTrashedNotebooks((trashBooks ?? []).map(toNotebook));
    setTrashedSections((trashSections ?? []).map(toSection));
    setTrashedPages((trashPages ?? []).map(toPage));
  }

  async function createCloudStarterWorkspace(userId: string) {
    if (!supabase) return;
    const now = new Date().toISOString();
    const notebookId = newId();
    const sectionRows = starterSections.map((name, order) => ({ id: newId(), user_id: userId, notebook_id: notebookId, name, sort_order: order, created_at: now, updated_at: now }));
    const content = welcomePageContent();
    const plainText = textFromDoc(content);

    const { error: notebookError } = await supabase.from('notebooks').insert({ id: notebookId, user_id: userId, name: 'My First Notebook', accent_color: colors[0], sort_order: 0, created_at: now, updated_at: now });
    if (notebookError) throw notebookError;
    const { error: sectionError } = await supabase.from('sections').insert(sectionRows);
    if (sectionError) throw sectionError;
    const { error: pageError } = await supabase.from('pages').insert({ id: newId(), user_id: userId, notebook_id: notebookId, section_id: sectionRows[0].id, title: 'Welcome to Obscribe', title_source: 'manual', pinned: true, sort_order: 0, content, plain_text: plainText, tags: tagsFromText(plainText), created_at: now, updated_at: now });
    if (pageError) throw pageError;
  }

  function setWorkspace(books: Notebook[], secs: Section[], pgs: PageRecord[]) {
    setNotebooks(books);
    setSections(secs);
    setPages(pgs);
    const firstBook = books[0];
    const firstSection = secs.find((s) => s.notebookId === firstBook?.id);
    const firstPage = pgs.find((p) => p.sectionId === firstSection?.id) ?? pgs.find((p) => p.notebookId === firstBook?.id);
    setActiveNotebookId(firstBook?.id);
    setActiveSectionId(firstSection?.id);
    setActivePageId(firstPage?.id);
  }

  const activeNotebook = notebooks.find((n) => n.id === activeNotebookId);
  const notebookSections = sections.filter((s) => s.notebookId === activeNotebookId).sort((a, b) => a.order - b.order);
  const sectionPages = pages.filter((p) => p.sectionId === activeSectionId).sort((a, b) => Number(b.pinned) - Number(a.pinned) || a.order - b.order);
  const activePage = pages.find((p) => p.id === activePageId);
  const activePageIsBlank = Boolean(activePage && !activePage.plainText.trim());

  const searchResults = useMemo(() => {
    if (!query.trim()) return [];
    const mini = new MiniSearch({ fields: ['title', 'plainText', 'tags'], storeFields: ['title', 'sectionId'] });
    mini.addAll(pages.map((p) => ({ ...p, tags: p.tags.join(' ') })));
    return mini.search(query, { prefix: true, fuzzy: 0.2 }).slice(0, 8);
  }, [pages, query]);

  const refreshPages = async () => {
    if (isCloudMode && supabase) {
      const { data, error } = await supabase.from('pages').select('*').is('trashed_at', null).order('sort_order');
      if (error) throw error;
      setPages((data ?? []).map(toPage));
    } else {
      setPages((await db.pages.orderBy('order').toArray()).filter((page) => !page.trashedAt));
    }
  };

  const refreshNotebooks = async () => {
    if (isCloudMode && supabase) {
      const { data, error } = await supabase.from('notebooks').select('*').is('trashed_at', null).order('sort_order');
      if (error) throw error;
      setNotebooks((data ?? []).map(toNotebook));
    } else {
      setNotebooks((await db.notebooks.orderBy('order').toArray()).filter((notebook) => !notebook.trashedAt));
    }
  };

  const refreshSections = async () => {
    if (isCloudMode && supabase) {
      const { data, error } = await supabase.from('sections').select('*').is('trashed_at', null).order('sort_order');
      if (error) throw error;
      setSections((data ?? []).map(toSection));
    } else {
      setSections((await db.sections.orderBy('order').toArray()).filter((section) => !section.trashedAt));
    }
  };

  function openNotebookModal() {
    setNewNotebookName('');
    setNewNotebookColor(colors[notebooks.length % colors.length]);
    setIncludeStarterSections(true);
    setShowNotebookModal(true);
  }

  async function createNotebook() {
    if (notebooks.length >= alphaLimits.notebooks) { setOperationError(`Notebook limit reached (${alphaLimits.notebooks}).`); return; }
    const name = (newNotebookName.trim() || 'New Notebook').slice(0, alphaLimits.notebookNameChars);
    const now = new Date().toISOString();
    const notebook: Notebook = { id: newId(), name, accentColor: newNotebookColor, order: notebooks.length, createdAt: now, updatedAt: now };
    const sectionNames = includeStarterSections ? starterSections : ['Notes'];
    const secs: Section[] = sectionNames.map((section, order) => ({ id: newId(), notebookId: notebook.id, name: section, order, createdAt: now, updatedAt: now }));

    setOperationError(null);
    if (isCloudMode && supabase && user) {
      const { error: notebookError } = await supabase.from('notebooks').insert({ id: notebook.id, user_id: user.id, name: notebook.name, accent_color: notebook.accentColor, sort_order: notebook.order, created_at: now, updated_at: now });
      if (notebookError) throw notebookError;
      const { error: sectionError } = await supabase.from('sections').insert(secs.map((section) => ({ id: section.id, user_id: user.id, notebook_id: section.notebookId, name: section.name, sort_order: section.order, created_at: now, updated_at: now })));
      if (sectionError) throw sectionError;
    } else {
      await db.transaction('rw', db.notebooks, db.sections, async () => {
        await db.notebooks.add(notebook);
        await db.sections.bulkAdd(secs);
      });
    }

    setShowNotebookModal(false);
    await refreshNotebooks();
    await refreshSections();
    setShowTrash(false);
    setActiveNotebookId(notebook.id);
    setActiveSectionId(secs[0].id);
    setActivePageId(undefined);
  }


  async function createPage(sectionId = activeSectionId) {
    if (!activeNotebookId || !sectionId) return;
    if (pages.length >= alphaLimits.pages) { setOperationError(`Page limit reached (${alphaLimits.pages}).`); return; }
    const now = new Date().toISOString();
    const page: PageRecord = { id: newId(), notebookId: activeNotebookId, sectionId, title: 'Untitled', titleSource: 'untitled', pinned: false, order: pages.filter((p) => p.sectionId === sectionId).length, content: emptyDoc, plainText: '', tags: [], createdAt: now, updatedAt: now };

    if (isCloudMode && supabase && user) {
      const { error } = await supabase.from('pages').insert({ id: page.id, user_id: user.id, notebook_id: page.notebookId, section_id: page.sectionId, title: page.title, title_source: page.titleSource, pinned: page.pinned, sort_order: page.order, content: page.content, plain_text: page.plainText, tags: page.tags, created_at: now, updated_at: now });
      if (error) throw error;
    } else {
      await db.pages.add(page);
    }

    await refreshPages();
    setActivePageId(page.id);
  }

  async function savePageContent(page: PageRecord, content: JSONContent) {
    if (jsonBytes(content) > alphaLimits.pageContentBytes) {
      setSaveState('error');
      setOperationError(`Page is too large to save. Limit is about ${Math.round(alphaLimits.pageContentBytes / 1000)}KB of editor content.`);
      return;
    }
    const plainText = textFromDoc(content);
    const derived = page.titleSource === 'manual' ? { title: page.title, source: page.titleSource } : titleFromText(plainText);
    const updated: PageRecord = { ...page, content, plainText, title: derived.title, titleSource: derived.source, tags: tagsFromText(plainText), updatedAt: new Date().toISOString() };

    setPages((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
    setSaveState('saving');
    setOperationError(null);

    if (saveTimers.current[updated.id]) clearTimeout(saveTimers.current[updated.id]);
    saveTimers.current[updated.id] = setTimeout(async () => {
      try {
        if (isCloudMode && supabase) {
          const { error } = await supabase.from('pages').update({ title: updated.title, title_source: updated.titleSource, content: updated.content, plain_text: updated.plainText, tags: updated.tags, updated_at: updated.updatedAt }).eq('id', updated.id);
          if (error) throw error;
        } else {
          await db.pages.put(updated);
        }
        setSaveState('saved');
      } catch (error: unknown) {
        setSaveState('error');
        setOperationError(`Save failed: ${errorMessage(error)}`);
      }
    }, 750);
  }

  async function applyStarterPage(page: PageRecord, kind: StarterPageKind) {
    try {
      const starter = starterPageContent(kind);
      const plainText = textFromDoc(starter.content);
      const updatedAt = new Date().toISOString();
      const updated: PageRecord = {
        ...page,
        title: starter.title,
        titleSource: 'manual',
        content: starter.content,
        plainText,
        tags: tagsFromText(plainText),
        updatedAt
      };

      setPages((prev) => prev.map((item) => item.id === page.id ? updated : item));
      setSaveState('saving');
      setOperationError(null);

      if (saveTimers.current[page.id]) clearTimeout(saveTimers.current[page.id]);
      if (isCloudMode && supabase) {
        const { error } = await supabase.from('pages').update({ title: updated.title, title_source: updated.titleSource, content: updated.content, plain_text: updated.plainText, tags: updated.tags, updated_at: updatedAt }).eq('id', updated.id);
        if (error) throw error;
      } else {
        await db.pages.put(updated);
      }
      setSaveState('saved');
    } catch (error: unknown) {
      setSaveState('error');
      setOperationError(`Couldn’t set up that page: ${errorMessage(error)}`);
    }
  }


  async function quickCapture() {
    try {
      setOperationError(null);
      if (!capture.trim() || !activeNotebookId) return;
      if (capture.length > alphaLimits.quickCaptureChars) throw new Error(`Quick capture is too long. Limit is ${alphaLimits.quickCaptureChars} characters.`);
      if (pages.length >= alphaLimits.pages) throw new Error(`Page limit reached (${alphaLimits.pages}).`);
      let inbox = sections.find((s) => s.notebookId === activeNotebookId && s.name.toLowerCase() === 'inbox');
      const now = new Date().toISOString();

      if (!inbox) {
        if (sections.length >= alphaLimits.sections) throw new Error(`Section limit reached (${alphaLimits.sections}).`);
        inbox = { id: newId(), notebookId: activeNotebookId, name: 'Inbox', order: 0, createdAt: now, updatedAt: now };
        if (isCloudMode && supabase && user) {
          const { error } = await supabase.from('sections').insert({ id: inbox.id, user_id: user.id, notebook_id: inbox.notebookId, name: inbox.name, sort_order: inbox.order, created_at: now, updated_at: now });
          if (error) throw error;
        } else {
          await db.sections.add(inbox);
        }
        setSections((prev) => [...prev, inbox as Section]);
        setActiveSectionId(inbox.id);
      }

      const text = capture.trim();
      const page: PageRecord = { id: newId(), notebookId: activeNotebookId, sectionId: inbox.id, title: text.slice(0, 80), titleSource: 'auto', pinned: false, order: pages.filter((p) => p.sectionId === inbox.id).length, content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] }, plainText: text, tags: tagsFromText(text), createdAt: now, updatedAt: now };

      if (isCloudMode && supabase && user) {
        const { error } = await supabase.from('pages').insert({ id: page.id, user_id: user.id, notebook_id: page.notebookId, section_id: page.sectionId, title: page.title, title_source: page.titleSource, pinned: page.pinned, sort_order: page.order, content: page.content, plain_text: page.plainText, tags: page.tags, created_at: now, updated_at: now });
        if (error) throw error;
      } else {
        await db.pages.add(page);
      }

      setCapture('');
      await refreshSections();
      await refreshPages();
      setActiveSectionId(inbox.id);
      setActivePageId(page.id);
    } catch (error: unknown) {
      setOperationError(`Capture failed: ${errorMessage(error)}`);
    }
  }

  function askConfirm(options: { title: string; body: string; confirmLabel: string; destructive?: boolean; onConfirm: () => Promise<void> }) {
    setConfirmModal(options);
  }

  async function runConfirmAction() {
    if (!confirmModal) return;
    const action = confirmModal.onConfirm;
    setConfirmModal(null);
    try {
      await action();
      setOperationError(null);
    } catch (error: unknown) {
      setOperationError(errorMessage(error));
    }
  }

  async function refreshTrash() {
    if (isCloudMode && supabase) {
      const [{ data: trashBooks }, { data: trashSections }, { data: trashPages }] = await Promise.all([
        supabase.from('notebooks').select('*').not('trashed_at', 'is', null).order('trashed_at', { ascending: false }),
        supabase.from('sections').select('*').not('trashed_at', 'is', null).order('trashed_at', { ascending: false }),
        supabase.from('pages').select('*').not('trashed_at', 'is', null).order('trashed_at', { ascending: false })
      ]);
      setTrashedNotebooks((trashBooks ?? []).map(toNotebook));
      setTrashedSections((trashSections ?? []).map(toSection));
      setTrashedPages((trashPages ?? []).map(toPage));
      return;
    }
    const [allBooks, allSecs, allPgs] = await Promise.all([
      db.notebooks.orderBy('order').toArray(),
      db.sections.orderBy('order').toArray(),
      db.pages.orderBy('order').toArray()
    ]);
    setTrashedNotebooks(allBooks.filter((notebook) => notebook.trashedAt));
    setTrashedSections(allSecs.filter((section) => section.trashedAt));
    setTrashedPages(allPgs.filter((page) => page.trashedAt));
  }

  async function refreshWorkspaceAndTrash() {
    await Promise.all([refreshNotebooks(), refreshSections(), refreshPages(), refreshTrash()]);
  }

  async function renameNotebook(notebook: Notebook) {
    const name = prompt('Rename notebook', notebook.name)?.trim();
    if (!name || name === notebook.name) return;
    const updatedAt = new Date().toISOString();
    if (isCloudMode && supabase) {
      const { error } = await supabase.from('notebooks').update({ name, updated_at: updatedAt }).eq('id', notebook.id);
      if (error) throw error;
    } else {
      await db.notebooks.update(notebook.id, { name, updatedAt });
    }
    setNotebooks((prev) => prev.map((item) => item.id === notebook.id ? { ...item, name, updatedAt } : item));
  }

  async function renameSection(section: Section) {
    const name = prompt('Rename section', section.name)?.trim();
    if (!name || name === section.name) return;
    const updatedAt = new Date().toISOString();
    if (isCloudMode && supabase) {
      const { error } = await supabase.from('sections').update({ name, updated_at: updatedAt }).eq('id', section.id);
      if (error) throw error;
    } else {
      await db.sections.update(section.id, { name, updatedAt });
    }
    setSections((prev) => prev.map((item) => item.id === section.id ? { ...item, name, updatedAt } : item));
  }

  async function renamePage(page: PageRecord) {
    const title = prompt('Rename page', page.title)?.trim();
    if (!title || title === page.title) return;
    const updatedAt = new Date().toISOString();
    if (isCloudMode && supabase) {
      const { error } = await supabase.from('pages').update({ title, title_source: 'manual', updated_at: updatedAt }).eq('id', page.id);
      if (error) throw error;
    } else {
      await db.pages.update(page.id, { title, titleSource: 'manual', updatedAt });
    }
    setPages((prev) => prev.map((item) => item.id === page.id ? { ...item, title, titleSource: 'manual', updatedAt } : item));
  }

  async function updatePageTitle(page: PageRecord, titleValue: string) {
    const title = (titleValue.trim() || 'Untitled').slice(0, alphaLimits.pageTitleChars);
    if (title === page.title && page.titleSource === 'manual') return;
    const updatedAt = new Date().toISOString();
    setSaveState('saving');
    setPages((prev) => prev.map((item) => item.id === page.id ? { ...item, title, titleSource: 'manual', updatedAt } : item));
    try {
      if (isCloudMode && supabase) {
        const { error } = await supabase.from('pages').update({ title, title_source: 'manual', updated_at: updatedAt }).eq('id', page.id);
        if (error) throw error;
      } else {
        await db.pages.update(page.id, { title, titleSource: 'manual', updatedAt });
      }
      setSaveState('saved');
    } catch (error: unknown) {
      setSaveState('error');
      setOperationError(`Title save failed: ${errorMessage(error)}`);
    }
  }

  async function deletePage(page: PageRecord) {
    askConfirm({
      title: 'Move page to Trash?',
      body: `“${page.title}” will leave this section but can be restored from Trash.`,
      confirmLabel: 'Move to Trash',
      destructive: true,
      onConfirm: async () => {
        const trashedAt = new Date().toISOString();
        if (isCloudMode && supabase) {
          const { error } = await supabase.from('pages').update({ trashed_at: trashedAt, updated_at: trashedAt }).eq('id', page.id);
          if (error) throw error;
        } else {
          await db.pages.update(page.id, { trashedAt, updatedAt: trashedAt });
        }
        const remaining = pages.filter((p) => p.id !== page.id);
        setPages(remaining);
        setTrashedPages((prev) => [{ ...page, trashedAt, updatedAt: trashedAt }, ...prev]);
        if (activePageId === page.id) setActivePageId(remaining.find((p) => p.sectionId === page.sectionId)?.id);
      }
    });
  }

  async function deleteSection(section: Section) {
    const pageCount = pages.filter((p) => p.sectionId === section.id).length;
    askConfirm({
      title: 'Move section to Trash?',
      body: `“${section.name}” and ${pageCount} page${pageCount === 1 ? '' : 's'} will be moved to Trash and can be restored later.`,
      confirmLabel: 'Move to Trash',
      destructive: true,
      onConfirm: async () => {
        const trashedAt = new Date().toISOString();

        if (isCloudMode && supabase) {
          const { error: sectionError } = await supabase.from('sections').update({ trashed_at: trashedAt, updated_at: trashedAt }).eq('id', section.id);
          if (sectionError) throw sectionError;
          const { error: pageError } = await supabase.from('pages').update({ trashed_at: trashedAt, updated_at: trashedAt }).eq('section_id', section.id);
          if (pageError) throw pageError;
        } else {
          const childPages = await db.pages.where('sectionId').equals(section.id).toArray();
          await db.transaction('rw', db.sections, db.pages, async () => {
            await db.sections.update(section.id, { trashedAt, updatedAt: trashedAt });
            await db.pages.bulkPut(childPages.map((page) => ({ ...page, trashedAt, updatedAt: trashedAt })));
          });
        }

        await refreshWorkspaceAndTrash();
        const nextSection = sections.find((s) => s.notebookId === section.notebookId && s.id !== section.id);
        setActiveSectionId(nextSection?.id);
        setActivePageId(nextSection ? pages.find((p) => p.sectionId === nextSection.id)?.id : undefined);
      }
    });
  }


  async function deleteNotebook(notebook: Notebook) {
    const pageCount = pages.filter((p) => p.notebookId === notebook.id).length;
    askConfirm({
      title: 'Move notebook to Trash?',
      body: `“${notebook.name}” and ${pageCount} page${pageCount === 1 ? '' : 's'} will be moved to Trash and can be restored later.`,
      confirmLabel: 'Move to Trash',
      destructive: true,
      onConfirm: async () => {
        const trashedAt = new Date().toISOString();

        if (isCloudMode && supabase) {
          const { error: notebookError } = await supabase.from('notebooks').update({ trashed_at: trashedAt, updated_at: trashedAt }).eq('id', notebook.id);
          if (notebookError) throw notebookError;
          const { error: sectionError } = await supabase.from('sections').update({ trashed_at: trashedAt, updated_at: trashedAt }).eq('notebook_id', notebook.id);
          if (sectionError) throw sectionError;
          const { error: pageError } = await supabase.from('pages').update({ trashed_at: trashedAt, updated_at: trashedAt }).eq('notebook_id', notebook.id);
          if (pageError) throw pageError;
        } else {
          const childSections = await db.sections.where('notebookId').equals(notebook.id).toArray();
          const childPages = await db.pages.where('notebookId').equals(notebook.id).toArray();
          await db.transaction('rw', db.notebooks, db.sections, db.pages, async () => {
            await db.notebooks.update(notebook.id, { trashedAt, updatedAt: trashedAt });
            await db.sections.bulkPut(childSections.map((section) => ({ ...section, trashedAt, updatedAt: trashedAt })));
            await db.pages.bulkPut(childPages.map((page) => ({ ...page, trashedAt, updatedAt: trashedAt })));
          });
        }

        const nextBooks = notebooks.filter((n) => n.id !== notebook.id);
        await refreshWorkspaceAndTrash();
        const nextNotebook = nextBooks[0];
        setActiveNotebookId(nextNotebook?.id);
        const nextSection = nextNotebook ? sections.find((s) => s.notebookId === nextNotebook.id) : undefined;
        setActiveSectionId(nextSection?.id);
        setActivePageId(nextSection ? pages.find((p) => p.sectionId === nextSection.id)?.id : undefined);
      }
    });
  }


  async function restoreItem(kind: 'notebook' | 'section' | 'page', id: string) {
    const updatedAt = new Date().toISOString();
    if (isCloudMode && supabase) {
      if (kind === 'notebook') {
        await supabase.from('notebooks').update({ trashed_at: null, updated_at: updatedAt }).eq('id', id).throwOnError();
        await supabase.from('sections').update({ trashed_at: null, updated_at: updatedAt }).eq('notebook_id', id).throwOnError();
        await supabase.from('pages').update({ trashed_at: null, updated_at: updatedAt }).eq('notebook_id', id).throwOnError();
      } else if (kind === 'section') {
        await supabase.from('sections').update({ trashed_at: null, updated_at: updatedAt }).eq('id', id).throwOnError();
        await supabase.from('pages').update({ trashed_at: null, updated_at: updatedAt }).eq('section_id', id).throwOnError();
      } else {
        await supabase.from('pages').update({ trashed_at: null, updated_at: updatedAt }).eq('id', id).throwOnError();
      }
    } else {
      if (kind === 'notebook') {
        const childSections = await db.sections.where('notebookId').equals(id).toArray();
        const childPages = await db.pages.where('notebookId').equals(id).toArray();
        await db.transaction('rw', db.notebooks, db.sections, db.pages, async () => {
          await db.notebooks.update(id, { trashedAt: null, updatedAt });
          await db.sections.bulkPut(childSections.map((section) => ({ ...section, trashedAt: null, updatedAt })));
          await db.pages.bulkPut(childPages.map((page) => ({ ...page, trashedAt: null, updatedAt })));
        });
      } else if (kind === 'section') {
        const childPages = await db.pages.where('sectionId').equals(id).toArray();
        await db.transaction('rw', db.sections, db.pages, async () => {
          await db.sections.update(id, { trashedAt: null, updatedAt });
          await db.pages.bulkPut(childPages.map((page) => ({ ...page, trashedAt: null, updatedAt })));
        });
      } else {
        await db.pages.update(id, { trashedAt: null, updatedAt });
      }
    }
    await loadWorkspace(user);
  }

  async function permanentlyDeleteItem(kind: 'notebook' | 'section' | 'page', id: string, label: string) {
    askConfirm({
      title: 'Permanently delete?',
      body: `“${label}” will be permanently deleted. This cannot be undone.`,
      confirmLabel: 'Delete Forever',
      destructive: true,
      onConfirm: async () => {
        if (isCloudMode && supabase) {
          const table = kind === 'notebook' ? 'notebooks' : kind === 'section' ? 'sections' : 'pages';
          const { error } = await supabase.from(table).delete().eq('id', id);
          if (error) throw error;
        } else {
          if (kind === 'notebook') await db.notebooks.delete(id);
          if (kind === 'section') await db.sections.delete(id);
          if (kind === 'page') await db.pages.delete(id);
        }
        await refreshTrash();
      }
    });
  }

  async function clearTrash() {
    if (!trashCount) return;
    askConfirm({
      title: 'Clear Trash?',
      body: `${trashCount} trashed item${trashCount === 1 ? '' : 's'} will be permanently deleted. This cannot be undone.`,
      confirmLabel: 'Clear Trash',
      destructive: true,
      onConfirm: async () => {
        const notebookIds = trashedNotebooks.map((item) => item.id);
        const sectionIds = trashedSections.map((item) => item.id);
        const pageIds = trashedPages.map((item) => item.id);

        if (isCloudMode && supabase) {
          if (notebookIds.length) await supabase.from('pages').delete().in('notebook_id', notebookIds).throwOnError();
          if (sectionIds.length) await supabase.from('pages').delete().in('section_id', sectionIds).throwOnError();
          if (pageIds.length) await supabase.from('pages').delete().in('id', pageIds).throwOnError();
          if (notebookIds.length) await supabase.from('sections').delete().in('notebook_id', notebookIds).throwOnError();
          if (sectionIds.length) await supabase.from('sections').delete().in('id', sectionIds).throwOnError();
          if (notebookIds.length) await supabase.from('notebooks').delete().in('id', notebookIds).throwOnError();
        } else {
          await db.transaction('rw', db.notebooks, db.sections, db.pages, async () => {
            if (notebookIds.length) {
              const childPages = await db.pages.where('notebookId').anyOf(notebookIds).primaryKeys();
              const childSections = await db.sections.where('notebookId').anyOf(notebookIds).primaryKeys();
              await db.pages.bulkDelete(childPages as string[]);
              await db.sections.bulkDelete(childSections as string[]);
            }
            if (sectionIds.length) {
              const sectionPages = await db.pages.where('sectionId').anyOf(sectionIds).primaryKeys();
              await db.pages.bulkDelete(sectionPages as string[]);
              await db.sections.bulkDelete(sectionIds);
            }
            if (pageIds.length) await db.pages.bulkDelete(pageIds);
            if (notebookIds.length) await db.notebooks.bulkDelete(notebookIds);
          });
        }
        await loadWorkspace(user);
      }
    });
  }

  const trashCount = trashedNotebooks.length + trashedSections.length + trashedPages.length;


  if (!ready) return <main className="loading">Opening your notebook…</main>;
  if (loadError) return <main className="loading error-state"><h1>Couldn’t open the notebook</h1><p>{loadError}</p><p>If you just created Supabase tables, refresh once and confirm RLS policies are enabled.</p></main>;

  return (
    <main className="app" style={{ ['--accent' as string]: activeNotebook?.accentColor ?? colors[0] }}>
      <aside className="shelf">
        <div className="brand"><Sparkles size={18} /> Obscribe</div>
        <button className="new" onClick={openNotebookModal}><Plus size={16} /> Notebook</button>
        <button className={showTrash ? "trash-toggle active" : "trash-toggle"} onClick={() => setShowTrash((value) => !value)}><Trash2 size={15} /> Trash {trashCount ? `(${trashCount})` : ""}</button>
        <div className="books">
          {notebooks.map((book) => (
            <div key={book.id} className={book.id === activeNotebookId ? 'book-row active' : 'book-row'}>
              <button className="book" onClick={() => { setShowTrash(false); setActiveNotebookId(book.id); const first = sections.find((s) => s.notebookId === book.id); setActiveSectionId(first?.id); setActivePageId(pages.find((p) => p.notebookId === book.id)?.id); }}><span style={{ background: book.accentColor }} />{book.name}</button>
              <button className="icon-danger shelf-danger" title={`Rename ${book.name}`} onClick={() => renameNotebook(book)}><Pencil size={14} /></button>
              <button className="icon-danger shelf-danger" title={`Move ${book.name} to Trash`} onClick={() => deleteNotebook(book)}><Trash2 size={15} /></button>
            </div>
          ))}
        </div>
        <AuthPanel />
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">{isCloudMode ? 'Cloud Alpha' : 'Local Alpha'}</p>
            <h1>{activeNotebook?.name}</h1>
          </div>
          <label className="search"><Search size={16} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search notes…" /></label>
        </header>

        {query && <div className="results">{searchResults.length ? searchResults.map((result) => <button key={result.id} onClick={() => { const page = pages.find((p) => p.id === result.id); setActiveSectionId(page?.sectionId); setActivePageId(String(result.id)); setQuery(''); }}>{String(result.title)}</button>) : <p>No matches yet.</p>}</div>}

        <div className="sync-strip"><CheckCircle2 size={15} /> Page status <span className={`save-pill ${saveState}`}>{saveState === 'saving' ? 'Saving…' : saveState === 'error' ? 'Save failed' : saveState === 'saved' ? 'Saved' : 'Ready'}</span></div>

        <div className="capture"><Inbox size={17} /><input value={capture} maxLength={alphaLimits.quickCaptureChars} onChange={(e) => setCapture(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') quickCapture(); }} placeholder="Quick capture a thought into Inbox…" /><button onClick={quickCapture}>Capture</button></div>
        {operationError && <div className="operation-error">{operationError}</div>}

        {!notebooks.length && !showTrash ? (
          <section className="empty-workspace">
            <div className="empty-workspace-card">
              <div className="empty-icon"><BookOpen size={26} /></div>
              <p className="eyebrow">Fresh workspace</p>
              <h2>Create your first notebook</h2>
              <p>Start from a clean notebook, then add sections and pages as your ideas take shape.</p>
              <button className="new" onClick={openNotebookModal}><Plus size={16} /> New Notebook</button>
            </div>
          </section>
        ) : <>
        <nav className="tabs">{notebookSections.map((section) => <div key={section.id} className={section.id === activeSectionId ? 'tab-wrap active' : 'tab-wrap'}><button className="tab" onClick={() => { setActiveSectionId(section.id); setActivePageId(pages.find((p) => p.sectionId === section.id)?.id); }}>{section.name}</button><button className="icon-danger tab-danger" title={`Rename ${section.name}`} onClick={() => renameSection(section)}><Pencil size={13} /></button><button className="icon-danger tab-danger" title={`Move ${section.name} to Trash`} onClick={() => deleteSection(section)}><Trash2 size={14} /></button></div>)}</nav>

        {showTrash ? (
          <section className="trash-panel">
            <div className="trash-header"><div><h2>Trash</h2><p>Restore items or permanently delete them.</p></div><button className="ghost-button compact" disabled={!trashCount} onClick={clearTrash}><Trash2 size={14} /> Clear Trash</button></div>
            {trashCount === 0 && <div className="empty compact-empty"><h2>Trash is empty</h2><p>Deleted notebooks, sections, and pages will show up here.</p></div>}
            {!!trashedNotebooks.length && <div className="trash-group"><h3>Notebooks</h3>{trashedNotebooks.map((item) => <div key={item.id} className="trash-row"><span>{item.name}</span><div><button className="ghost-button compact" onClick={() => restoreItem('notebook', item.id)}><RotateCcw size={14} /> Restore</button><button className="icon-danger" onClick={() => permanentlyDeleteItem('notebook', item.id, item.name)}><XCircle size={15} /></button></div></div>)}</div>}
            {!!trashedSections.length && <div className="trash-group"><h3>Sections</h3>{trashedSections.map((item) => <div key={item.id} className="trash-row"><span>{item.name}</span><div><button className="ghost-button compact" onClick={() => restoreItem('section', item.id)}><RotateCcw size={14} /> Restore</button><button className="icon-danger" onClick={() => permanentlyDeleteItem('section', item.id, item.name)}><XCircle size={15} /></button></div></div>)}</div>}
            {!!trashedPages.length && <div className="trash-group"><h3>Pages</h3>{trashedPages.map((item) => <div key={item.id} className="trash-row"><span>{item.title}</span><div><button className="ghost-button compact" onClick={() => restoreItem('page', item.id)}><RotateCcw size={14} /> Restore</button><button className="icon-danger" onClick={() => permanentlyDeleteItem('page', item.id, item.title)}><XCircle size={15} /></button></div></div>)}</div>}
          </section>
        ) : (
        <div className="notebook-layout">
          <aside className="pages-panel">
            <button className="page-create" onClick={() => createPage()}><Plus size={15} /> New Page</button>
            {sectionPages.map((page) => <div key={page.id} className={page.id === activePageId ? 'page-row active' : 'page-row'}><button className="page-link" onClick={() => setActivePageId(page.id)}>{page.pinned ? '★ ' : ''}{page.title}<small>{page.tags.map((tag) => `#${tag}`).join(' ')}</small></button><button className="icon-danger" title={`Rename ${page.title}`} onClick={() => renamePage(page)}><Pencil size={14} /></button><button className="icon-danger" title={`Move ${page.title} to Trash`} onClick={() => deletePage(page)}><Trash2 size={15} /></button></div>)}
          </aside>

          <article className="paper">
            {activePage ? <>
              <div className="paper-title editable-title"><BookOpen size={18} /><input value={activePage.title} maxLength={alphaLimits.pageTitleChars} onChange={(event) => setPages((prev) => prev.map((page) => page.id === activePage.id ? { ...page, title: event.target.value, titleSource: 'manual' } : page))} onBlur={(event) => updatePageTitle(activePage, event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }} /></div>
              {activePageIsBlank && <div className="starter-inserts" aria-label="Page starters">
                <span>Start with</span>
                {starterPageOptions.map((option) => {
                  const Icon = option.icon;
                  return <button key={option.kind} onClick={() => applyStarterPage(activePage, option.kind)}><Icon size={15} /><strong>{option.label}</strong><small>{option.helper}</small></button>;
                })}
              </div>}
              <Editor key={activePage.id} content={activePage.content} onChange={(doc) => savePageContent(activePage, doc)} />
            </> : <div className="empty"><h2>No page selected</h2><p>Create a page to start writing in this section.</p><button onClick={() => createPage()}>Create page</button></div>}
          </article>
        </div>
        )}
        </>}
      </section>
      {confirmModal && (
        <div className="modal-backdrop" onMouseDown={() => setConfirmModal(null)}>
          <section className="confirm-modal" onMouseDown={(event) => event.stopPropagation()}>
            <div className="confirm-icon"><Trash2 size={22} /></div>
            <h2>{confirmModal.title}</h2>
            <p>{confirmModal.body}</p>
            <div className="modal-actions"><button className="ghost-button" onClick={() => setConfirmModal(null)}>Cancel</button><button className={confirmModal.destructive ? 'danger-button' : 'new'} onClick={runConfirmAction}>{confirmModal.confirmLabel}</button></div>
          </section>
        </div>
      )}
      {showNotebookModal && (
        <div className="modal-backdrop" onMouseDown={() => setShowNotebookModal(false)}>
          <section className="notebook-modal" onMouseDown={(event) => event.stopPropagation()}>
            <p className="eyebrow">New notebook</p>
            <h2>Create a notebook</h2>
            <label className="modal-field">Name<input value={newNotebookName} onChange={(event) => setNewNotebookName(event.target.value)} placeholder="Research, Projects, Ideas…" autoFocus /></label>
            <div className="modal-field"><span>Accent color</span><div className="color-row">{colors.map((color) => <button key={color} className={color === newNotebookColor ? 'color-dot active' : 'color-dot'} style={{ background: color }} onClick={() => setNewNotebookColor(color)} aria-label={`Use ${color}`} />)}</div></div>
            <label className="starter-toggle"><input type="checkbox" checked={includeStarterSections} onChange={(event) => setIncludeStarterSections(event.target.checked)} /> Add starter sections: Inbox, Journal, Projects, References</label>
            <div className="modal-actions"><button className="ghost-button" onClick={() => setShowNotebookModal(false)}>Cancel</button><button className="new" onClick={createNotebook}><Plus size={16} /> Create Notebook</button></div>
          </section>
        </div>
      )}
    </main>
  );
}
