"use client";

import {
  BookOpen,
  CheckCircle2,
  Clock3,
  FileText,
  LogOut,
  Mail,
  Plus,
  Save,
  Search,
  Settings,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

type User = { id: number; name: string; email: string };
type Workspace = { id: number; name: string };
type Notebook = { id: number; workspace_id: number; name: string };
type Note = {
  id: number;
  notebook_id: number;
  content: string | null;
  updated_at?: string;
};
type MailStatus = { sent: boolean; driver: string; message?: string };

const API =
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:8000/api";

function splitNoteContent(value: string) {
  const [firstLine = "", ...rest] = value.split("\n");
  return {
    title: firstLine,
    body: rest.join("\n"),
  };
}

function noteTitle(note: Note) {
  const title = splitNoteContent(note.content || "").title.trim();
  return title || "Untitled";
}

function notePreview(note: Note) {
  const body = splitNoteContent(note.content || "").body.trim();
  return body || "Blank note";
}

function compactDate(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) return "Today";

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";

  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function Home() {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [token, setToken] = useState("");
  const [user, setUser] = useState<User | null>(null);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [notebooks, setNotebooks] = useState<Notebook[]>([]);
  const [notebookName, setNotebookName] = useState("");
  const [activeNotebook, setActiveNotebook] = useState<Notebook | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [activeNote, setActiveNote] = useState<Note | null>(null);
  const [content, setContent] = useState("");
  const [status, setStatus] = useState("Ready");
  const [error, setError] = useState("");
  const [notebookQuery, setNotebookQuery] = useState("");
  const [noteQuery, setNoteQuery] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [mobilePane, setMobilePane] = useState<"notebooks" | "notes" | "editor">("editor");
  const [pendingDelete, setPendingDelete] = useState(false);

  const headers = useMemo(
    () => ({
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    }),
    [token],
  );

  const api = useCallback(
    async <T,>(path: string, options: RequestInit = {}): Promise<T> => {
      setError("");
      const res = await fetch(API + path, {
        ...options,
        headers: { ...headers, ...(options.headers || {}) },
      });
      const text = await res.text();
      let data: unknown = {};

      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        throw new Error("Server returned a non-JSON response. Check the API logs.");
      }

      if (!res.ok) {
        const message =
          typeof data === "object" && data && "message" in data
            ? String(data.message)
            : `HTTP ${res.status}`;
        throw new Error(message);
      }

      return data as T;
    },
    [headers],
  );

  const logout = useCallback(() => {
    localStorage.removeItem("obscribe_token");
    setToken("");
    setUser(null);
    setWorkspace(null);
    setNotebooks([]);
    setActiveNotebook(null);
    setNotes([]);
    setActiveNote(null);
    setContent("");
  }, []);

  const loadMe = useCallback(async () => {
    const data = await api<{ user: User; workspace: Workspace | null }>("/me");
    setUser(data.user);
    setWorkspace(data.workspace);
  }, [api]);

  const loadNotebooks = useCallback(async () => {
    const data = await api<{ notebooks: Notebook[] }>("/notebooks");
    setNotebooks(data.notebooks);
    setActiveNotebook((current) => current ?? data.notebooks[0] ?? null);
  }, [api]);

  const loadNotes = useCallback(
    async (id: number) => {
      const data = await api<{ notes: Note[] }>(`/notebooks/${id}/notes`);
      setNotes(data.notes);
      setActiveNote(data.notes[0] ?? null);
    },
    [api],
  );

  const saveNote = useCallback(
    async (value: string) => {
      if (!activeNote) return;

      try {
        setStatus("Saving...");
        const note = await api<Note>(`/notes/${activeNote.id}`, {
          method: "PUT",
          body: JSON.stringify({ content: value }),
        });
        setActiveNote(note);
        setNotes((current) => current.map((n) => (n.id === note.id ? note : n)));
        setStatus("Saved");
        setLastSavedAt(new Date());
      } catch (err) {
        setStatus("Save failed");
        setError(err instanceof Error ? err.message : "Unable to save note");
      }
    },
    [activeNote, api],
  );

  useEffect(() => {
    const saved = localStorage.getItem("obscribe_token");
    if (saved) setToken(saved);
  }, []);

  useEffect(() => {
    if (!token) return;

    async function loadSession() {
      try {
        await Promise.all([loadMe(), loadNotebooks()]);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unable to load session");
        logout();
      }
    }

    loadSession();
  }, [loadMe, loadNotebooks, logout, token]);

  useEffect(() => {
    if (!activeNotebook) {
      setNotes([]);
      setActiveNote(null);
      return;
    }

    loadNotes(activeNotebook.id).catch((err) => {
      setError(err instanceof Error ? err.message : "Unable to load notes");
    });
  }, [activeNotebook, loadNotes]);

  useEffect(() => {
    setContent(activeNote?.content || "");
    setLastSavedAt(null);
    setPendingDelete(false);
  }, [activeNote?.id, activeNote?.content]);

  useEffect(() => {
    if (!activeNote || (activeNote.content || "") === content) return;

    const timer = window.setTimeout(() => {
      saveNote(content);
    }, 900);

    return () => window.clearTimeout(timer);
  }, [activeNote, content, saveNote]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const key = event.key.toLowerCase();
      const command = event.metaKey || event.ctrlKey;

      if (command && key === "s") {
        event.preventDefault();
        if (activeNote) saveNote(content);
      }

      if (command && key === "n") {
        event.preventDefault();
        if (activeNotebook) createNote();
      }

      if (event.key === "Escape") {
        setShowSettings(false);
        setPendingDelete(false);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeNote, activeNotebook, content, createNote, saveNote]);

  async function auth(e: FormEvent) {
    e.preventDefault();

    try {
      const body = mode === "register" ? { name, email, password } : { email, password };
      const data = await api<{
        token: string;
        user: User;
        workspace: Workspace | null;
        mail?: MailStatus;
      }>(
        `/${mode}`,
        { method: "POST", body: JSON.stringify(body) },
      );

      localStorage.setItem("obscribe_token", data.token);
      setToken(data.token);
      setUser(data.user);
      setWorkspace(data.workspace);
      if (mode === "register" && data.mail) {
        setStatus(data.mail.sent ? "Account created; email sent" : "Account created; email not sent");
        if (!data.mail.sent && data.mail.message) setError(data.mail.message);
      } else {
        setStatus("Logged in");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed");
    }
  }

  async function createNotebookNamed(value: string) {
    const name = value.trim();
    if (!name) return;

    try {
      const notebook = await api<Notebook>("/notebooks", {
        method: "POST",
        body: JSON.stringify({ name }),
      });
      setNotebookName("");
      setActiveNotebook(notebook);
      setMobilePane("notes");
      await loadNotebooks();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create notebook");
    }
  }

  async function createNotebook(e: FormEvent) {
    e.preventDefault();
    await createNotebookNamed(notebookName);
  }

  async function createNote() {
    if (!activeNotebook) return;

    try {
      const note = await api<Note>(`/notebooks/${activeNotebook.id}/notes`, {
        method: "POST",
      });
      setNotes((current) => [note, ...current]);
      setActiveNote(note);
      setMobilePane("editor");
      setStatus("Note created");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create note");
    }
  }

  async function deleteActiveNote() {
    if (!activeNote) return;

    try {
      await api<{ deleted: boolean }>(`/notes/${activeNote.id}`, { method: "DELETE" });
      const remaining = notes.filter((note) => note.id !== activeNote.id);
      setNotes(remaining);
      setActiveNote(remaining[0] ?? null);
      setPendingDelete(false);
      setStatus("Note deleted");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to delete note");
    }
  }

  async function sendTestEmail() {
    try {
      setStatus("Sending test email...");
      const data = await api<{ mail: MailStatus }>("/mail/test", { method: "POST" });
      setStatus(data.mail.sent ? "Test email sent" : "Test email failed");
      if (!data.mail.sent && data.mail.message) setError(data.mail.message);
    } catch (err) {
      setStatus("Test email failed");
      setError(err instanceof Error ? err.message : "Unable to send test email");
    }
  }

  const filteredNotebooks = notebooks.filter((notebook) =>
    notebook.name.toLowerCase().includes(notebookQuery.trim().toLowerCase()),
  );
  const filteredNotes = notes.filter((note) => {
    const query = noteQuery.trim().toLowerCase();
    if (!query) return true;
    return `${noteTitle(note)} ${notePreview(note)}`.toLowerCase().includes(query);
  });
  const noteParts = splitNoteContent(content);
  const isDirty = activeNote ? (activeNote.content || "") !== content : false;
  const bodyWordCount = noteParts.body.trim() ? noteParts.body.trim().split(/\s+/).length : 0;
  const noteCountLabel = `${notes.length} ${notes.length === 1 ? "note" : "notes"}`;
  const notebookCountLabel = `${notebooks.length} ${notebooks.length === 1 ? "notebook" : "notebooks"}`;
  const displayStatus =
    status === "Saved" && lastSavedAt
      ? `Saved ${lastSavedAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`
      : isDirty && status !== "Saving..."
        ? "Unsaved changes"
        : status;

  function updateNoteTitle(value: string) {
    setContent(noteParts.body ? `${value}\n${noteParts.body}` : value);
  }

  function updateNoteBody(value: string) {
    setContent(noteParts.title ? `${noteParts.title}\n${value}` : `\n${value}`);
  }

  if (!token) {
    return (
      <main className="loginPage">
        <section className="loginStory" aria-label="Obscribe overview">
          <div className="heroMark">O</div>
          <p className="kicker lightKicker">Self-hosted notes</p>
          <h1 className="heroWord">Obscribe</h1>
          <p className="heroCopy">
            A private writing workspace for notebooks, drafts, and project memory.
          </p>
          <div className="trustList">
            <span>
              <ShieldCheck size={16} strokeWidth={2} />
              Your server
            </span>
            <span>
              <Clock3 size={16} strokeWidth={2} />
              Autosave
            </span>
            <span>
              <CheckCircle2 size={16} strokeWidth={2} />
              SMTP ready
            </span>
          </div>
        </section>
        <section className="loginCard" aria-labelledby="auth-title">
          <div className="mark">O</div>
          <p className="kicker">Private notebook workspace</p>
          <h2 id="auth-title" className="loginTitle">
            {mode === "login" ? "Welcome back" : "Create your account"}
          </h2>
          <p className="muted">
            Continue to your notes, notebooks, and self-hosted workspace checks.
          </p>

          <div className="tabs" role="tablist" aria-label="Authentication mode">
            <button
              className={mode === "login" ? "tabActive" : "tab"}
              onClick={() => setMode("login")}
              type="button"
            >
              Sign in
            </button>
            <button
              className={mode === "register" ? "tabActive" : "tab"}
              onClick={() => setMode("register")}
              type="button"
            >
              Create account
            </button>
          </div>

          {error && <p className="error">{error}</p>}

          <form onSubmit={auth} className="form">
            {mode === "register" && (
              <label className="fieldGroup">
                <span className="fieldLabel">Name</span>
                <input
                  className="input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Jane Doe"
                  autoComplete="name"
                  required
                />
              </label>
            )}
            <label className="fieldGroup">
              <span className="fieldLabel">Email</span>
              <input
                className="input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                type="email"
                autoComplete="email"
                required
              />
            </label>
            <label className="fieldGroup">
              <span className="fieldLabel">Password</span>
              <input
                className="input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                required
              />
            </label>
            <button className="primary">{mode === "login" ? "Sign in" : "Create account"}</button>
          </form>
        </section>
      </main>
    );
  }

  return (
    <main className="page">
      <header className="topbar">
        <div className="logoWrap">
          <div className="logo">O</div>
          <div>
            <h1 className="appTitle">Obscribe</h1>
            <p className="subline">{workspace?.name ?? "Workspace"}</p>
          </div>
        </div>
        <button
          onClick={() => setShowSettings((value) => !value)}
          className="iconButton"
          type="button"
          aria-label="Settings"
          title="Settings"
        >
          <Settings size={17} strokeWidth={2} />
        </button>
        <button onClick={logout} className="iconButton" type="button" aria-label="Logout" title="Logout">
          <LogOut size={17} strokeWidth={2} />
        </button>
      </header>

      {error && <p className="error errorWide">{error}</p>}
      {showSettings && (
        <section className="settingsBar" aria-label="Workspace settings">
          <div>
            <p className="kicker">Admin</p>
            <h2 className="settingsTitle">Self-host checks</h2>
            <p className="settingsMeta">{user?.email ?? "Loading account"}</p>
          </div>
          <button onClick={sendTestEmail} className="secondary" type="button">
            <Mail size={16} strokeWidth={2} />
            Send test email
          </button>
        </section>
      )}

      <nav className="mobileSwitcher" aria-label="Workspace panels">
        <button
          className={mobilePane === "notebooks" ? "mobilePaneActive" : "mobilePaneButton"}
          onClick={() => setMobilePane("notebooks")}
          type="button"
        >
          <BookOpen size={15} strokeWidth={2.2} />
          Notebooks
        </button>
        <button
          className={mobilePane === "notes" ? "mobilePaneActive" : "mobilePaneButton"}
          onClick={() => setMobilePane("notes")}
          type="button"
        >
          <FileText size={15} strokeWidth={2.2} />
          Notes
        </button>
        <button
          className={mobilePane === "editor" ? "mobilePaneActive" : "mobilePaneButton"}
          onClick={() => setMobilePane("editor")}
          type="button"
        >
          <Save size={15} strokeWidth={2.2} />
          Editor
        </button>
      </nav>

      <section className={`shell pane-${mobilePane}`}>
        <aside className="rail" aria-label="Notebooks">
          <div className="panelHeader">
            <div>
              <p className="kicker">Workspace</p>
              <h2 className="panelTitle">Notebooks</h2>
            </div>
            <span className="countPill">{notebookCountLabel}</span>
          </div>

          <form onSubmit={createNotebook} className="createRow">
            <input
              className="input"
              value={notebookName}
              onChange={(e) => setNotebookName(e.target.value)}
              placeholder="Notebook name"
            />
            <button className="addButton" aria-label="Create notebook" disabled={!notebookName.trim()}>
              <Plus size={19} strokeWidth={2.4} />
            </button>
          </form>
          <label className="searchWrap">
            <Search size={15} strokeWidth={2} />
            <input
              className="searchInput"
              value={notebookQuery}
              onChange={(e) => setNotebookQuery(e.target.value)}
              placeholder="Search notebooks"
            />
          </label>

          <div className="list">
            {filteredNotebooks.map((notebook) => (
              <button
                key={notebook.id}
                onClick={() => {
                  setActiveNotebook(notebook);
                  setMobilePane("notes");
                }}
                className={activeNotebook?.id === notebook.id ? "activeItem" : "item"}
                type="button"
              >
                <span>{notebook.name}</span>
              </button>
            ))}
            {!notebooks.length && (
              <button className="emptyAction" onClick={() => createNotebookNamed("Personal")} type="button">
                Create your first notebook
              </button>
            )}
            {!!notebooks.length && !filteredNotebooks.length && (
              <p className="emptySmall">No notebooks match that search.</p>
            )}
          </div>
        </aside>

        <aside className="notesRail" aria-label="Notes">
          <div className="panelHeader">
            <div>
              <p className="kicker">Current notebook</p>
              <h2 className="panelTitle">{activeNotebook?.name ?? "Notes"}</h2>
              <p className="railMeta">{noteCountLabel}</p>
            </div>
            <button
              onClick={createNote}
              className="newNote"
              disabled={!activeNotebook}
              type="button"
            >
              <Plus size={16} strokeWidth={2.4} />
              New
            </button>
          </div>
          <label className="searchWrap lightSearch">
            <Search size={15} strokeWidth={2} />
            <input
              className="searchInput"
              value={noteQuery}
              onChange={(e) => setNoteQuery(e.target.value)}
              placeholder="Search notes"
              disabled={!notes.length}
            />
          </label>

          <div className="list">
            {filteredNotes.map((note) => {
              return (
                <button
                  key={note.id}
                  onClick={() => {
                    setActiveNote(note);
                    setMobilePane("editor");
                  }}
                  className={activeNote?.id === note.id ? "noteActive" : "noteItem"}
                  type="button"
                >
                  <span>{noteTitle(note).slice(0, 70)}</span>
                  <small>{notePreview(note).slice(0, 90)}</small>
                  {note.updated_at && <small>{compactDate(note.updated_at)}</small>}
                </button>
              );
            })}
            {!notes.length && (
              <button className="emptyAction" onClick={createNote} disabled={!activeNotebook} type="button">
                Create your first note
              </button>
            )}
            {!!notes.length && !filteredNotes.length && <p className="emptySmall">No notes match that search.</p>}
          </div>
        </aside>

        <section className="editorPanel" aria-label="Editor">
          {activeNote ? (
            <>
              <div className="editorTop">
                <div>
                  <p className="kicker">{activeNotebook?.name ?? "Editor"}</p>
                  <h2 className="editorTitle">
                    {noteParts.title.trim() || "Untitled"}
                  </h2>
                  <p className="editorMeta">
                    <Clock3 size={14} strokeWidth={2} />
                    {displayStatus}
                  </p>
                </div>
                <div className="editorActions">
                  <button onClick={() => setPendingDelete(true)} className="dangerButton" type="button">
                    <Trash2 size={15} strokeWidth={2} />
                    Delete
                  </button>
                  <button onClick={() => saveNote(content)} className="secondary" disabled={!isDirty} type="button">
                    <Save size={15} strokeWidth={2} />
                    Save now
                  </button>
                </div>
              </div>
              {pendingDelete && (
                <div className="deleteConfirm" role="alert">
                  <span>Delete this note permanently?</span>
                  <button className="secondary" onClick={() => setPendingDelete(false)} type="button">
                    Cancel
                  </button>
                  <button className="dangerButton" onClick={deleteActiveNote} type="button">
                    Delete
                  </button>
                </div>
              )}
              <input
                className="titleInput"
                value={noteParts.title}
                onChange={(e) => updateNoteTitle(e.target.value)}
                placeholder="Untitled"
              />
              <textarea
                className="editor"
                value={noteParts.body}
                onChange={(e) => updateNoteBody(e.target.value)}
                placeholder="Start writing..."
              />
              <footer className="editorFooter" aria-label="Note details">
                <span>{bodyWordCount} {bodyWordCount === 1 ? "word" : "words"}</span>
                <span>{noteParts.body.length} characters</span>
                <span>{displayStatus}</span>
              </footer>
            </>
          ) : (
            <div className="emptyState">
              <div className="bigIcon">O</div>
              <h2>Select or create a note</h2>
              <p>Your editor will appear here.</p>
              <button className="primary emptyStateButton" onClick={createNote} disabled={!activeNotebook} type="button">
                New note
              </button>
            </div>
          )}
        </section>
      </section>
    </main>
  );
}
