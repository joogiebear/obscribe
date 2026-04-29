'use client';

import { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import MiniSearch from 'minisearch';
import { BookOpen, Cloud, HardDrive, Inbox, Plus, Search, Sparkles, Trash2 } from 'lucide-react';
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

type CloudNotebook = {
  id: string;
  name: string;
  accent_color: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

type CloudSection = {
  id: string;
  notebook_id: string;
  name: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
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
};

function newId() {
  return crypto.randomUUID();
}

function toNotebook(row: CloudNotebook): Notebook {
  return { id: row.id, name: row.name, accentColor: row.accent_color, order: row.sort_order, createdAt: row.created_at, updatedAt: row.updated_at };
}

function toSection(row: CloudSection): Section {
  return { id: row.id, notebookId: row.notebook_id, name: row.name, order: row.sort_order, createdAt: row.created_at, updatedAt: row.updated_at };
}

function toPage(row: CloudPage): PageRecord {
  return { id: row.id, notebookId: row.notebook_id, sectionId: row.section_id, title: row.title, titleSource: row.title_source, pinned: row.pinned, order: row.sort_order, content: row.content, plainText: row.plain_text, tags: row.tags ?? [], createdAt: row.created_at, updatedAt: row.updated_at };
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

  async function loadWorkspace(currentUser: User | null) {
    if (currentUser && supabase) {
      await loadCloudWorkspace(currentUser.id);
    } else {
      await loadLocalWorkspace();
    }
  }

  async function loadLocalWorkspace() {
    let books = await db.notebooks.orderBy('order').toArray();
    if (!books.length) {
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
      books = [notebook];
    }
    const secs = await db.sections.orderBy('order').toArray();
    const pgs = await db.pages.orderBy('order').toArray();
    setWorkspace(books, secs, pgs);
  }

  async function loadCloudWorkspace(userId: string) {
    if (!supabase) return;
    const { data: notebookRows, error: notebookError } = await supabase.from('notebooks').select('*').order('sort_order');
    if (notebookError) throw notebookError;

    if (!notebookRows?.length) {
      await createCloudStarterWorkspace(userId);
    }

    const [{ data: cloudNotebooks, error: nError }, { data: cloudSections, error: sError }, { data: cloudPages, error: pError }] = await Promise.all([
      supabase.from('notebooks').select('*').order('sort_order'),
      supabase.from('sections').select('*').order('sort_order'),
      supabase.from('pages').select('*').order('sort_order')
    ]);
    if (nError) throw nError;
    if (sError) throw sError;
    if (pError) throw pError;

    setWorkspace((cloudNotebooks ?? []).map(toNotebook), (cloudSections ?? []).map(toSection), (cloudPages ?? []).map(toPage));
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

  const searchResults = useMemo(() => {
    if (!query.trim()) return [];
    const mini = new MiniSearch({ fields: ['title', 'plainText', 'tags'], storeFields: ['title', 'sectionId'] });
    mini.addAll(pages.map((p) => ({ ...p, tags: p.tags.join(' ') })));
    return mini.search(query, { prefix: true, fuzzy: 0.2 }).slice(0, 8);
  }, [pages, query]);

  const refreshPages = async () => {
    if (isCloudMode && supabase) {
      const { data, error } = await supabase.from('pages').select('*').order('sort_order');
      if (error) throw error;
      setPages((data ?? []).map(toPage));
    } else {
      setPages(await db.pages.orderBy('order').toArray());
    }
  };

  const refreshNotebooks = async () => {
    if (isCloudMode && supabase) {
      const { data, error } = await supabase.from('notebooks').select('*').order('sort_order');
      if (error) throw error;
      setNotebooks((data ?? []).map(toNotebook));
    } else {
      setNotebooks(await db.notebooks.orderBy('order').toArray());
    }
  };

  const refreshSections = async () => {
    if (isCloudMode && supabase) {
      const { data, error } = await supabase.from('sections').select('*').order('sort_order');
      if (error) throw error;
      setSections((data ?? []).map(toSection));
    } else {
      setSections(await db.sections.orderBy('order').toArray());
    }
  };

  async function createNotebook() {
    const name = prompt('Notebook name?', 'New Notebook')?.trim();
    if (!name) return;
    const now = new Date().toISOString();
    const notebook: Notebook = { id: newId(), name, accentColor: colors[notebooks.length % colors.length], order: notebooks.length, createdAt: now, updatedAt: now };
    const secs: Section[] = starterSections.map((section, order) => ({ id: newId(), notebookId: notebook.id, name: section, order, createdAt: now, updatedAt: now }));

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

    await refreshNotebooks();
    await refreshSections();
    setActiveNotebookId(notebook.id);
    setActiveSectionId(secs[0].id);
    setActivePageId(undefined);
  }

  async function createPage(sectionId = activeSectionId) {
    if (!activeNotebookId || !sectionId) return;
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
    const plainText = textFromDoc(content);
    const derived = page.titleSource === 'manual' ? { title: page.title, source: page.titleSource } : titleFromText(plainText);
    const updated: PageRecord = { ...page, content, plainText, title: derived.title, titleSource: derived.source, tags: tagsFromText(plainText), updatedAt: new Date().toISOString() };

    setPages((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));

    if (isCloudMode && supabase) {
      const { error } = await supabase.from('pages').update({ title: updated.title, title_source: updated.titleSource, content: updated.content, plain_text: updated.plainText, tags: updated.tags, updated_at: updated.updatedAt }).eq('id', updated.id);
      if (error) throw error;
    } else {
      await db.pages.put(updated);
    }
  }

  async function quickCapture() {
    if (!capture.trim() || !activeNotebookId) return;
    const inbox = sections.find((s) => s.notebookId === activeNotebookId && s.name.toLowerCase() === 'inbox');
    if (!inbox) return;
    const now = new Date().toISOString();
    const text = capture.trim();
    const page: PageRecord = { id: newId(), notebookId: activeNotebookId, sectionId: inbox.id, title: text.slice(0, 80), titleSource: 'auto', pinned: false, order: pages.filter((p) => p.sectionId === inbox.id).length, content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] }, plainText: text, tags: tagsFromText(text), createdAt: now, updatedAt: now };

    if (isCloudMode && supabase && user) {
      const { error } = await supabase.from('pages').insert({ id: page.id, user_id: user.id, notebook_id: page.notebookId, section_id: page.sectionId, title: page.title, title_source: page.titleSource, pinned: page.pinned, sort_order: page.order, content: page.content, plain_text: page.plainText, tags: page.tags, created_at: now, updated_at: now });
      if (error) throw error;
    } else {
      await db.pages.add(page);
    }

    setCapture('');
    await refreshPages();
    setActiveSectionId(inbox.id);
    setActivePageId(page.id);
  }

  async function deletePage(page: PageRecord) {
    if (!confirm(`Delete page “${page.title}”? This alpha delete cannot be undone yet.`)) return;
    if (isCloudMode && supabase) {
      const { error } = await supabase.from('pages').delete().eq('id', page.id);
      if (error) throw error;
    } else {
      await db.pages.delete(page.id);
    }
    const remaining = pages.filter((p) => p.id !== page.id);
    setPages(remaining);
    if (activePageId === page.id) setActivePageId(remaining.find((p) => p.sectionId === page.sectionId)?.id);
  }

  async function deleteSection(section: Section) {
    const pageCount = pages.filter((p) => p.sectionId === section.id).length;
    if (!confirm(`Delete section “${section.name}” and ${pageCount} page${pageCount === 1 ? '' : 's'}? This alpha delete cannot be undone yet.`)) return;

    if (isCloudMode && supabase) {
      const { error } = await supabase.from('sections').delete().eq('id', section.id);
      if (error) throw error;
    } else {
      await db.transaction('rw', db.sections, db.pages, async () => {
        await db.sections.delete(section.id);
        await db.pages.where('sectionId').equals(section.id).delete();
      });
    }

    await refreshSections();
    await refreshPages();
    const nextSection = sections.find((s) => s.notebookId === section.notebookId && s.id !== section.id);
    setActiveSectionId(nextSection?.id);
    setActivePageId(nextSection ? pages.find((p) => p.sectionId === nextSection.id)?.id : undefined);
  }

  async function deleteNotebook(notebook: Notebook) {
    const pageCount = pages.filter((p) => p.notebookId === notebook.id).length;
    if (!confirm(`Delete notebook “${notebook.name}” and ${pageCount} page${pageCount === 1 ? '' : 's'}? This alpha delete cannot be undone yet.`)) return;

    if (isCloudMode && supabase) {
      const { error } = await supabase.from('notebooks').delete().eq('id', notebook.id);
      if (error) throw error;
    } else {
      await db.transaction('rw', db.notebooks, db.sections, db.pages, async () => {
        await db.notebooks.delete(notebook.id);
        await db.sections.where('notebookId').equals(notebook.id).delete();
        await db.pages.where('notebookId').equals(notebook.id).delete();
      });
    }

    const nextBooks = notebooks.filter((n) => n.id !== notebook.id);
    await refreshNotebooks();
    await refreshSections();
    await refreshPages();
    const nextNotebook = nextBooks[0];
    setActiveNotebookId(nextNotebook?.id);
    const nextSection = nextNotebook ? sections.find((s) => s.notebookId === nextNotebook.id) : undefined;
    setActiveSectionId(nextSection?.id);
    setActivePageId(nextSection ? pages.find((p) => p.sectionId === nextSection.id)?.id : undefined);
  }

  if (!ready) return <main className="loading">Opening your notebook…</main>;
  if (loadError) return <main className="loading error-state"><h1>Couldn’t open the notebook</h1><p>{loadError}</p><p>If you just created Supabase tables, refresh once and confirm RLS policies are enabled.</p></main>;

  return (
    <main className="app" style={{ ['--accent' as string]: activeNotebook?.accentColor ?? colors[0] }}>
      <aside className="shelf">
        <div className="brand"><Sparkles size={18} /> Obscribe</div>
        <button className="new" onClick={createNotebook}><Plus size={16} /> Notebook</button>
        <div className="books">
          {notebooks.map((book) => (
            <div key={book.id} className={book.id === activeNotebookId ? 'book-row active' : 'book-row'}>
              <button className="book" onClick={() => { setActiveNotebookId(book.id); const first = sections.find((s) => s.notebookId === book.id); setActiveSectionId(first?.id); setActivePageId(pages.find((p) => p.notebookId === book.id)?.id); }}><span style={{ background: book.accentColor }} />{book.name}</button>
              <button className="icon-danger shelf-danger" title={`Delete ${book.name}`} onClick={() => deleteNotebook(book)}><Trash2 size={15} /></button>
            </div>
          ))}
        </div>
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

        <AuthPanel />

        <div className="sync-strip">{isCloudMode ? <><Cloud size={15} /> Signed in: saving this workspace to Supabase.</> : <><HardDrive size={15} /> Signed out: saving locally in this browser.</>}</div>

        <div className="capture"><Inbox size={17} /><input value={capture} onChange={(e) => setCapture(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') quickCapture(); }} placeholder="Quick capture a thought into Inbox…" /><button onClick={quickCapture}>Capture</button></div>

        <nav className="tabs">{notebookSections.map((section) => <div key={section.id} className={section.id === activeSectionId ? 'tab-wrap active' : 'tab-wrap'}><button className="tab" onClick={() => { setActiveSectionId(section.id); setActivePageId(pages.find((p) => p.sectionId === section.id)?.id); }}>{section.name}</button><button className="icon-danger tab-danger" title={`Delete ${section.name}`} onClick={() => deleteSection(section)}><Trash2 size={14} /></button></div>)}</nav>

        <div className="notebook-layout">
          <aside className="pages-panel">
            <button className="page-create" onClick={() => createPage()}><Plus size={15} /> New Page</button>
            {sectionPages.map((page) => <div key={page.id} className={page.id === activePageId ? 'page-row active' : 'page-row'}><button className="page-link" onClick={() => setActivePageId(page.id)}>{page.pinned ? '★ ' : ''}{page.title}<small>{page.tags.map((tag) => `#${tag}`).join(' ')}</small></button><button className="icon-danger" title={`Delete ${page.title}`} onClick={() => deletePage(page)}><Trash2 size={15} /></button></div>)}
          </aside>

          <article className="paper">
            {activePage ? <>
              <div className="paper-title"><BookOpen size={18} /><span>{activePage.title}</span></div>
              <Editor key={activePage.id} content={activePage.content} onChange={(doc) => savePageContent(activePage, doc)} />
            </> : <div className="empty"><h2>No page selected</h2><p>Create a page to start writing in this section.</p><button onClick={() => createPage()}>Create page</button></div>}
          </article>
        </div>
      </section>
    </main>
  );
}
