"use client";

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
  return body || "No additional text";
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
  }, [activeNote?.id, activeNote?.content]);

  useEffect(() => {
    if (!activeNote || (activeNote.content || "") === content) return;

    const timer = window.setTimeout(() => {
      saveNote(content);
    }, 900);

    return () => window.clearTimeout(timer);
  }, [activeNote, content, saveNote]);

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
      setStatus("Note created");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create note");
    }
  }

  async function deleteActiveNote() {
    if (!activeNote) return;
    if (!window.confirm("Delete this note?")) return;

    try {
      await api<{ deleted: boolean }>(`/notes/${activeNote.id}`, { method: "DELETE" });
      const remaining = notes.filter((note) => note.id !== activeNote.id);
      setNotes(remaining);
      setActiveNote(remaining[0] ?? null);
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
        <section className="loginCard" aria-labelledby="auth-title">
          <div className="mark">O</div>
          <p className="kicker">Private notebook workspace</p>
          <h1 id="auth-title" className="loginTitle">
            Obscribe
          </h1>
          <p className="muted">
            Sign in to continue writing, organizing, and syncing notebook drafts.
          </p>

          <div className="tabs" role="tablist" aria-label="Authentication mode">
            <button
              className={mode === "login" ? "tabActive" : "tab"}
              onClick={() => setMode("login")}
              type="button"
            >
              Login
            </button>
            <button
              className={mode === "register" ? "tabActive" : "tab"}
              onClick={() => setMode("register")}
              type="button"
            >
              Register
            </button>
          </div>

          {error && <p className="error">{error}</p>}

          <form onSubmit={auth} className="form">
            {mode === "register" && (
              <input
                className="input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Name"
                autoComplete="name"
                required
              />
            )}
            <input
              className="input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              type="email"
              autoComplete="email"
              required
            />
            <input
              className="input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              required
            />
            <button className="primary">{mode === "login" ? "Login" : "Create account"}</button>
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
            <p className="subline">
              {workspace?.name ?? "Workspace"} / {user?.email ?? "Loading account"}
            </p>
          </div>
        </div>
        <div className="status">{displayStatus}</div>
        <button onClick={() => setShowSettings((value) => !value)} className="secondary" type="button">
          Settings
        </button>
        <button onClick={logout} className="secondary" type="button">
          Logout
        </button>
      </header>

      {error && <p className="error errorWide">{error}</p>}
      {showSettings && (
        <section className="settingsBar" aria-label="Workspace settings">
          <div>
            <p className="kicker">Admin</p>
            <h2 className="settingsTitle">Self-host checks</h2>
          </div>
          <button onClick={sendTestEmail} className="secondary" type="button">
            Send test email
          </button>
        </section>
      )}

      <section className="shell">
        <aside className="rail" aria-label="Notebooks">
          <div className="panelHeader">
            <div>
              <p className="kicker">Workspace</p>
              <h2 className="panelTitle">Notebooks</h2>
            </div>
          </div>

          <form onSubmit={createNotebook} className="createRow">
            <input
              className="input"
              value={notebookName}
              onChange={(e) => setNotebookName(e.target.value)}
              placeholder="Notebook name"
            />
            <button className="addButton" aria-label="Create notebook" disabled={!notebookName.trim()}>
              +
            </button>
          </form>
          <input
            className="searchInput"
            value={notebookQuery}
            onChange={(e) => setNotebookQuery(e.target.value)}
            placeholder="Search notebooks"
          />

          <div className="list">
            {filteredNotebooks.map((notebook) => (
              <button
                key={notebook.id}
                onClick={() => setActiveNotebook(notebook)}
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
              <h2 className="panelTitle">Notes</h2>
            </div>
            <button
              onClick={createNote}
              className="newNote"
              disabled={!activeNotebook}
              type="button"
            >
              New
            </button>
          </div>
          <input
            className="searchInput"
            value={noteQuery}
            onChange={(e) => setNoteQuery(e.target.value)}
            placeholder="Search notes"
            disabled={!notes.length}
          />

          <div className="list">
            {filteredNotes.map((note) => {
              return (
                <button
                  key={note.id}
                  onClick={() => setActiveNote(note)}
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
                  <p className="kicker">Editor</p>
                  <h2 className="editorTitle">
                    {noteParts.title.trim() || "Untitled"}
                  </h2>
                </div>
                <div className="editorActions">
                  <button onClick={deleteActiveNote} className="dangerButton" type="button">
                    Delete
                  </button>
                  <button onClick={() => saveNote(content)} className="secondary" disabled={!isDirty} type="button">
                    Save now
                  </button>
                </div>
              </div>
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
                placeholder="Write, paste, or draft here..."
              />
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
