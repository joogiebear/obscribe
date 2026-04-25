"use client";

import {
  ArrowLeft,
  BookOpen,
  Bold,
  Briefcase,
  Check,
  CheckCircle2,
  ClipboardList,
  Clock3,
  Code2,
  Download,
  Edit3,
  FileSearch,
  FileText,
  Heading1,
  Italic,
  KeyRound,
  Link2,
  List,
  ListChecks,
  LogOut,
  Mail,
  PenLine,
  Plus,
  Quote,
  RefreshCcw,
  Save,
  Search,
  Settings,
  ShieldCheck,
  Trash2,
  Upload,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

type AuthMode = "login" | "register" | "forgot" | "reset";
type User = { id: number; name: string; email: string };
type Workspace = { id: number; name: string };
type Notebook = { id: number; workspace_id: number; name: string };
type Note = {
  id: number;
  notebook_id: number;
  content: string | null;
  updated_at?: string;
};
type NotebookTemplateKey =
  | "meeting-notes"
  | "project-hub"
  | "client-workspace"
  | "research-notebook"
  | "content-planner";
type NoteTemplateKey =
  | "meeting-note"
  | "daily-plan"
  | "decision-record"
  | "task-list"
  | "project-update"
  | "client-call";
type NotebookTemplate = {
  key: NotebookTemplateKey;
  type: "notebook";
  name: string;
  summary: string;
  details: string;
  icon: LucideIcon;
};
type NoteTemplate = {
  key: NoteTemplateKey;
  type: "note";
  name: string;
  summary: string;
  details: string;
  content: string;
  icon: LucideIcon;
};
type TemplateFilter = "all" | "notebook" | "note";
type TemplateItem = NotebookTemplate | NoteTemplate;
type MailStatus = { sent: boolean; driver: string; message?: string };
type SearchNote = Note & { notebook_name: string };
type SearchResults = { notebooks: Notebook[]; notes: SearchNote[] };
type MarkdownFormat = "heading" | "bold" | "italic" | "link" | "check" | "bullet" | "quote" | "code";
type AppStatus = {
  status: string;
  counts: { notebooks: number; notes: number };
  mail: { driver: string; configured: boolean };
};
type WorkspaceExport = {
  version: number;
  exported_at: string;
  user: Pick<User, "name" | "email">;
  workspace: Pick<Workspace, "name">;
  notebooks: Array<{
    name: string;
    notes: Array<{ content: string | null; created_at?: string; updated_at?: string }>;
  }>;
};
type MarkdownBlock =
  | { type: "heading"; text: string; level: 1 | 2 | 3 }
  | { type: "check"; text: string; checked: boolean }
  | { type: "bullet"; text: string }
  | { type: "quote"; text: string }
  | { type: "code"; text: string }
  | { type: "paragraph"; text: string };

const API =
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:8000/api";

const NOTEBOOK_TEMPLATES: NotebookTemplate[] = [
  {
    key: "meeting-notes",
    type: "notebook",
    name: "Meeting Notes",
    summary: "Agenda, decisions, action items",
    details: "Creates notes for recurring meetings, 1:1s, and decisions.",
    icon: ClipboardList,
  },
  {
    key: "project-hub",
    type: "notebook",
    name: "Project Hub",
    summary: "Overview, tasks, milestones, risks",
    details: "Creates a project workspace with planning and tracking notes.",
    icon: Briefcase,
  },
  {
    key: "client-workspace",
    type: "notebook",
    name: "Client Workspace",
    summary: "Profile, calls, requirements",
    details: "Creates a workspace for client context, calls, and requirements.",
    icon: Users,
  },
  {
    key: "research-notebook",
    type: "notebook",
    name: "Research Notebook",
    summary: "Sources, findings, summary",
    details: "Creates notes for sources, findings, and research synthesis.",
    icon: FileSearch,
  },
  {
    key: "content-planner",
    type: "notebook",
    name: "Content Planner",
    summary: "Ideas, drafts, publishing checklist",
    details: "Creates an editorial workspace for ideas, drafts, and publishing.",
    icon: PenLine,
  },
];

const NOTE_TEMPLATES: NoteTemplate[] = [
  {
    key: "meeting-note",
    type: "note",
    name: "Meeting Note",
    summary: "Agenda, decisions, next steps",
    details: "Adds a single meeting note to the current notebook.",
    icon: ClipboardList,
    content:
      "Meeting Note\n\n## Date\n\n## Attendees\n- \n\n## Agenda\n- \n\n## Decisions\n- \n\n## Action Items\n- [ ] Owner - task - due date\n\n## Follow-ups\n- ",
  },
  {
    key: "daily-plan",
    type: "note",
    name: "Daily Plan",
    summary: "Focus, schedule, shutdown",
    details: "Adds a lightweight day plan to the current notebook.",
    icon: CheckCircle2,
    content:
      "Daily Plan\n\n## Top Focus\n\n## Schedule\n- \n\n## Tasks\n- [ ] \n- [ ] \n- [ ] \n\n## Shutdown Notes\n",
  },
  {
    key: "decision-record",
    type: "note",
    name: "Decision Record",
    summary: "Context, choice, tradeoffs",
    details: "Adds a decision log entry to the current notebook.",
    icon: FileText,
    content:
      "Decision Record\n\n## Decision\n\n## Context\n\n## Options Considered\n- \n\n## Tradeoffs\n\n## Owner\n\n## Date\n",
  },
  {
    key: "task-list",
    type: "note",
    name: "Task List",
    summary: "Grouped checklist",
    details: "Adds a simple checklist note to the current notebook.",
    icon: ListChecks,
    content:
      "Task List\n\n## Now\n- [ ] \n\n## Next\n- [ ] \n\n## Waiting\n- [ ] \n\n## Done\n- [x] ",
  },
  {
    key: "project-update",
    type: "note",
    name: "Project Update",
    summary: "Progress, blockers, asks",
    details: "Adds a status update note to the current notebook.",
    icon: Briefcase,
    content:
      "Project Update\n\n## Status\n\n## Progress Since Last Update\n- \n\n## Blockers\n- \n\n## Decisions Needed\n- \n\n## Next Steps\n- [ ] ",
  },
  {
    key: "client-call",
    type: "note",
    name: "Client Call",
    summary: "Goals, notes, commitments",
    details: "Adds a client call note to the current notebook.",
    icon: Users,
    content:
      "Client Call\n\n## Client\n\n## Goal\n\n## Notes\n- \n\n## Requirements\n- \n\n## Commitments\n- [ ] \n\n## Follow-up Email\n",
  },
];

const TEMPLATE_LIBRARY: TemplateItem[] = [...NOTEBOOK_TEMPLATES, ...NOTE_TEMPLATES];

function templateId(template: TemplateItem) {
  return `${template.type}:${template.key}`;
}

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

function markdownBlocks(value: string): MarkdownBlock[] {
  const lines = value.split("\n");
  const blocks: MarkdownBlock[] = [];
  const codeLines: string[] = [];
  let inCode = false;

  for (const line of lines) {
    if (line.trim().startsWith("```")) {
      if (inCode) {
        blocks.push({ type: "code", text: codeLines.join("\n") || " " });
        codeLines.length = 0;
      }
      inCode = !inCode;
      continue;
    }

    if (inCode) {
      codeLines.push(line);
      continue;
    }

    const trimmed = line.trim();
    if (!trimmed) continue;

    const heading = /^(#{1,3})\s+(.+)$/.exec(trimmed);
    if (heading) {
      blocks.push({
        type: "heading",
        level: heading[1].length as 1 | 2 | 3,
        text: heading[2],
      });
      continue;
    }

    const check = /^-\s+\[( |x|X)\]\s+(.+)$/.exec(trimmed);
    if (check) {
      blocks.push({ type: "check", checked: check[1].toLowerCase() === "x", text: check[2] });
      continue;
    }

    const bullet = /^-\s+(.+)$/.exec(trimmed);
    if (bullet) {
      blocks.push({ type: "bullet", text: bullet[1] });
      continue;
    }

    const quote = /^>\s?(.+)$/.exec(trimmed);
    if (quote) {
      blocks.push({ type: "quote", text: quote[1] });
      continue;
    }

    blocks.push({ type: "paragraph", text: line });
  }

  if (inCode) blocks.push({ type: "code", text: codeLines.join("\n") || " " });
  return blocks;
}

export default function Home() {
  const [mode, setMode] = useState<AuthMode>("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [token, setToken] = useState("");
  const [user, setUser] = useState<User | null>(null);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [notebooks, setNotebooks] = useState<Notebook[]>([]);
  const [notebooksLoaded, setNotebooksLoaded] = useState(false);
  const [notebookName, setNotebookName] = useState("");
  const [templateQuery, setTemplateQuery] = useState("");
  const [templateFilter, setTemplateFilter] = useState<TemplateFilter>("all");
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [activeNotebook, setActiveNotebook] = useState<Notebook | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [activeNote, setActiveNote] = useState<Note | null>(null);
  const [content, setContent] = useState("");
  const [status, setStatus] = useState("Ready");
  const [error, setError] = useState("");
  const [notebookQuery, setNotebookQuery] = useState("");
  const [noteQuery, setNoteQuery] = useState("");
  const [activeView, setActiveView] = useState<"workspace" | "settings">("workspace");
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [mobilePane, setMobilePane] = useState<"notebooks" | "notes" | "editor">("editor");
  const [pendingDelete, setPendingDelete] = useState(false);
  const [pendingNotebookDelete, setPendingNotebookDelete] = useState<number | null>(null);
  const [renamingNotebookId, setRenamingNotebookId] = useState<number | null>(null);
  const [renameNotebookValue, setRenameNotebookValue] = useState("");
  const [globalQuery, setGlobalQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResults | null>(null);
  const [searching, setSearching] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordStatus, setPasswordStatus] = useState("");
  const [resetEmail, setResetEmail] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [resetPassword, setResetPassword] = useState("");
  const [resetConfirmPassword, setResetConfirmPassword] = useState("");
  const [resetStatus, setResetStatus] = useState("");
  const [exportStatus, setExportStatus] = useState("");
  const [importStatus, setImportStatus] = useState("");
  const [editorMode, setEditorMode] = useState<"write" | "preview">("write");
  const [appStatus, setAppStatus] = useState<AppStatus | null>(null);
  const [statusLoaded, setStatusLoaded] = useState(false);
  const globalSearchRef = useRef<HTMLInputElement | null>(null);
  const titleInputRef = useRef<HTMLInputElement | null>(null);
  const editorRef = useRef<HTMLTextAreaElement | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const targetNoteIdRef = useRef<number | null>(null);

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
    setNotebooksLoaded(false);
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
    setNotebooksLoaded(false);
    const data = await api<{ notebooks: Notebook[] }>("/notebooks");
    setNotebooks(data.notebooks);
    setActiveNotebook((current) => current ?? data.notebooks[0] ?? null);
    setNotebooksLoaded(true);
    return data.notebooks;
  }, [api]);

  const loadNotes = useCallback(
    async (id: number) => {
      const data = await api<{ notes: Note[] }>(`/notebooks/${id}/notes`);
      const targetNoteId = targetNoteIdRef.current;
      setNotes(data.notes);
      setActiveNote(
        targetNoteId ? data.notes.find((note) => note.id === targetNoteId) ?? data.notes[0] ?? null : data.notes[0] ?? null,
      );
      targetNoteIdRef.current = null;
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

  const loadAppStatus = useCallback(async () => {
    try {
      const data = await api<AppStatus>("/status");
      setAppStatus(data);
      setStatusLoaded(true);
    } catch (err) {
      setStatusLoaded(true);
      setError(err instanceof Error ? err.message : "Unable to load server status");
    }
  }, [api]);

  useEffect(() => {
    const saved = localStorage.getItem("obscribe_token");
    if (saved) setToken(saved);

    const params = new URLSearchParams(window.location.search);
    const urlResetToken = params.get("reset_token");
    if (urlResetToken) {
      setResetToken(urlResetToken);
      setMode("reset");
      window.history.replaceState({}, "", window.location.pathname);
    }
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
    if (token && activeView === "settings") {
      loadAppStatus();
    }
  }, [activeView, loadAppStatus, token]);

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

      if (command && key === "k") {
        event.preventDefault();
        setActiveView("workspace");
        window.setTimeout(() => globalSearchRef.current?.focus(), 0);
      }

      if (event.key === "Escape") {
        setActiveView("workspace");
        setPendingDelete(false);
        setPendingNotebookDelete(null);
        setRenamingNotebookId(null);
        setGlobalQuery("");
        setSearchResults(null);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeNote, activeNotebook, content, createNote, saveNote]);

  function switchAuthMode(nextMode: AuthMode) {
    setMode(nextMode);
    setError("");
  }

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

  async function sendPasswordReset(emailValue: string) {
    setResetStatus("");

    try {
      await api<{ sent: boolean }>("/password/forgot", {
        method: "POST",
        body: JSON.stringify({ email: emailValue }),
      });
      setResetStatus("If that account exists, a reset link has been sent.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to request password reset");
    }
  }

  async function requestPasswordReset(e: FormEvent) {
    e.preventDefault();
    await sendPasswordReset(resetEmail || email);
  }

  async function resetAccountPassword(e: FormEvent) {
    e.preventDefault();
    setResetStatus("");

    if (resetPassword !== resetConfirmPassword) {
      setError("New password and confirmation do not match.");
      return;
    }

    try {
      await api<{ reset: boolean }>("/password/reset", {
        method: "POST",
        body: JSON.stringify({
          token: resetToken,
          new_password: resetPassword,
        }),
      });
      setResetToken("");
      setResetPassword("");
      setResetConfirmPassword("");
      setMode("login");
      setError("");
      setResetStatus("Password reset. You can sign in now.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to reset password");
    }
  }

  async function createNotebookNamed(value: string, templateKey: NotebookTemplateKey | "" = "") {
    const template = NOTEBOOK_TEMPLATES.find((item) => item.key === templateKey);
    const name = value.trim() || template?.name || "";
    if (!name) return;

    try {
      const notebook = await api<Notebook>("/notebooks", {
        method: "POST",
        body: JSON.stringify({
          name,
          ...(templateKey ? { template_key: templateKey } : {}),
        }),
      });
      setNotebookName("");
      setSelectedTemplateId("");
      setActiveNotebook(notebook);
      setMobilePane("notes");
      await loadNotebooks();
      setStatus(templateKey ? "Notebook template created" : "Notebook created");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create notebook");
      setNotebooksLoaded(true);
    }
  }

  async function createNotebook(e: FormEvent) {
    e.preventDefault();
    await createNotebookNamed(notebookName);
  }

  async function createNote(initialContent = "") {
    if (!activeNotebook) return;

    try {
      const note = await api<Note>(`/notebooks/${activeNotebook.id}/notes`, {
        method: "POST",
        body: JSON.stringify({ content: initialContent }),
      });
      setNotes((current) => [note, ...current]);
      setActiveNote(note);
      setMobilePane("editor");
      setStatus(initialContent ? "Note template created" : "Note created");
      window.setTimeout(() => (initialContent ? editorRef.current?.focus() : titleInputRef.current?.focus()), 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create note");
    }
  }

  async function useTemplate(template: TemplateItem) {
    if (template.type === "notebook") {
      await createNotebookNamed(template.name, template.key);
      return;
    }

    if (!activeNotebook) {
      setError("Choose a notebook before using a note template.");
      setMobilePane("notebooks");
      return;
    }

    await createNote(template.content);
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

  async function deleteNotebook(id: number) {
    try {
      await api<{ deleted: boolean }>(`/notebooks/${id}`, { method: "DELETE" });
      const remaining = notebooks.filter((notebook) => notebook.id !== id);
      setNotebooks(remaining);
      setPendingNotebookDelete(null);

      if (activeNotebook?.id === id) {
        setActiveNotebook(remaining[0] ?? null);
        setNotes([]);
        setActiveNote(null);
        setMobilePane(remaining.length ? "notes" : "notebooks");
      }

      setStatus("Notebook deleted");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to delete notebook");
    }
  }

  function startNotebookRename(notebook: Notebook) {
    setPendingNotebookDelete(null);
    setRenamingNotebookId(notebook.id);
    setRenameNotebookValue(notebook.name);
  }

  async function renameNotebook(id: number) {
    const name = renameNotebookValue.trim();
    if (!name) return;

    try {
      const notebook = await api<Notebook>(`/notebooks/${id}`, {
        method: "PUT",
        body: JSON.stringify({ name }),
      });
      setNotebooks((current) =>
        current.map((item) => (item.id === notebook.id ? notebook : item)),
      );
      setActiveNotebook((current) => (current?.id === notebook.id ? notebook : current));
      setRenamingNotebookId(null);
      setRenameNotebookValue("");
      setStatus("Notebook renamed");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to rename notebook");
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

  async function changePassword(e: FormEvent) {
    e.preventDefault();
    setPasswordStatus("");

    if (newPassword !== confirmPassword) {
      setError("New password and confirmation do not match.");
      return;
    }

    try {
      await api<{ updated: boolean }>("/me/password", {
        method: "POST",
        body: JSON.stringify({
          current_password: currentPassword,
          new_password: newPassword,
        }),
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPasswordStatus("Password updated.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update password");
    }
  }

  async function exportWorkspace() {
    try {
      setExportStatus("Preparing export...");
      const data = await api<WorkspaceExport>("/workspace/export");
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `obscribe-export-${timestamp}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setExportStatus("Workspace export downloaded.");
    } catch (err) {
      setExportStatus("");
      setError(err instanceof Error ? err.message : "Unable to export workspace");
    }
  }

  async function importWorkspace(file: File | null) {
    if (!file) return;

    try {
      setImportStatus("Importing workspace...");
      const raw = await file.text();
      const payload = JSON.parse(raw) as WorkspaceExport;
      const data = await api<{ imported: { notebooks: number; notes: number } }>("/workspace/import", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      const refreshedNotebooks = await loadNotebooks();
      setActiveNotebook(refreshedNotebooks[0] ?? null);
      setActiveNote(null);
      setContent("");
      await loadAppStatus();
      setImportStatus(
        `Imported ${data.imported.notebooks} ${data.imported.notebooks === 1 ? "notebook" : "notebooks"} and ${data.imported.notes} ${data.imported.notes === 1 ? "note" : "notes"}.`,
      );
    } catch (err) {
      setImportStatus("");
      setError(err instanceof Error ? err.message : "Unable to import workspace");
    } finally {
      if (importInputRef.current) importInputRef.current.value = "";
    }
  }

  async function openSearchNote(note: SearchNote) {
    try {
      const notebook =
        notebooks.find((item) => item.id === note.notebook_id) ??
        {
          id: note.notebook_id,
          workspace_id: workspace?.id ?? 0,
          name: note.notebook_name,
        };
      setActiveView("workspace");
      setMobilePane("editor");
      setGlobalQuery("");
      setSearchResults(null);

      if (activeNotebook?.id === note.notebook_id) {
        setActiveNote(notes.find((item) => item.id === note.id) ?? note);
        return;
      }

      targetNoteIdRef.current = note.id;
      setActiveNotebook(notebook);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to open search result");
    }
  }

  function openSearchNotebook(notebook: Notebook) {
    setActiveView("workspace");
    setActiveNotebook(notebook);
    setMobilePane("notes");
    setGlobalQuery("");
    setSearchResults(null);
  }

  useEffect(() => {
    const query = globalQuery.trim();
    if (!token || query.length < 2) {
      setSearchResults(null);
      setSearching(false);
      return;
    }

    let cancelled = false;
    setSearching(true);
    const timer = window.setTimeout(() => {
      api<SearchResults>(`/search?q=${encodeURIComponent(query)}`)
        .then((results) => {
          if (!cancelled) setSearchResults(results);
        })
        .catch((err) => {
          if (!cancelled) setError(err instanceof Error ? err.message : "Search failed");
        })
        .finally(() => {
          if (!cancelled) setSearching(false);
        });
    }, 220);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [api, globalQuery, token]);

  const filteredNotebooks = notebooks.filter((notebook) =>
    notebook.name.toLowerCase().includes(notebookQuery.trim().toLowerCase()),
  );
  const filteredNotes = notes.filter((note) => {
    const query = noteQuery.trim().toLowerCase();
    if (!query) return true;
    return `${noteTitle(note)} ${notePreview(note)}`.toLowerCase().includes(query);
  });
  const noteParts = splitNoteContent(content);
  const previewBlocks = useMemo(() => markdownBlocks(noteParts.body), [noteParts.body]);
  const filteredTemplates = useMemo(() => {
    const query = templateQuery.trim().toLowerCase();
    return TEMPLATE_LIBRARY.filter((template) => {
      const matchesFilter = templateFilter === "all" || template.type === templateFilter;
      const matchesQuery =
        !query ||
        `${template.name} ${template.summary} ${template.details}`.toLowerCase().includes(query);
      return matchesFilter && matchesQuery;
    });
  }, [templateFilter, templateQuery]);
  const selectedTemplate = TEMPLATE_LIBRARY.find((template) => templateId(template) === selectedTemplateId);
  const isDirty = activeNote ? (activeNote.content || "") !== content : false;
  const bodyWordCount = noteParts.body.trim() ? noteParts.body.trim().split(/\s+/).length : 0;
  const noteCountLabel = `${notes.length} ${notes.length === 1 ? "note" : "notes"}`;
  const notebookCountLabel = notebooksLoaded
    ? `${notebooks.length} ${notebooks.length === 1 ? "notebook" : "notebooks"}`
    : "Loading";
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

  function insertEditorText(replacement: string, selectionStart: number, selectionEnd = selectionStart) {
    const textarea = editorRef.current;
    const body = noteParts.body;
    const start = textarea?.selectionStart ?? body.length;
    const end = textarea?.selectionEnd ?? body.length;
    const nextBody = `${body.slice(0, start)}${replacement}${body.slice(end)}`;

    updateNoteBody(nextBody);
    window.setTimeout(() => {
      editorRef.current?.focus();
      editorRef.current?.setSelectionRange(start + selectionStart, start + selectionEnd);
    }, 0);
  }

  function insertMarkdown(format: MarkdownFormat) {
    setEditorMode("write");
    const textarea = editorRef.current;
    const body = noteParts.body;
    const start = textarea?.selectionStart ?? body.length;
    const end = textarea?.selectionEnd ?? body.length;
    const selected = body.slice(start, end);
    const linePrefix = start > 0 && body[start - 1] !== "\n" ? "\n" : "";
    const lineSuffix = end < body.length && body[end] !== "\n" ? "\n" : "";

    if (format === "heading") {
      const text = selected || "Heading";
      insertEditorText(`${linePrefix}## ${text}${lineSuffix}`, linePrefix.length + 3, linePrefix.length + 3 + text.length);
      return;
    }

    if (format === "bold") {
      const text = selected || "bold text";
      insertEditorText(`**${text}**`, 2, 2 + text.length);
      return;
    }

    if (format === "italic") {
      const text = selected || "italic text";
      insertEditorText(`_${text}_`, 1, 1 + text.length);
      return;
    }

    if (format === "link") {
      const text = selected || "link text";
      insertEditorText(`[${text}](https://)`, 1, 1 + text.length);
      return;
    }

    if (format === "check") {
      const text = selected || "Task";
      insertEditorText(`${linePrefix}- [ ] ${text}${lineSuffix}`, linePrefix.length + 6, linePrefix.length + 6 + text.length);
      return;
    }

    if (format === "bullet") {
      const text = selected || "List item";
      insertEditorText(`${linePrefix}- ${text}${lineSuffix}`, linePrefix.length + 2, linePrefix.length + 2 + text.length);
      return;
    }

    if (format === "quote") {
      const text = selected || "Quote";
      insertEditorText(`${linePrefix}> ${text}${lineSuffix}`, linePrefix.length + 2, linePrefix.length + 2 + text.length);
      return;
    }

    const text = selected || "code";
    if (text.includes("\n")) {
      insertEditorText(`\`\`\`\n${text}\n\`\`\``, 4, 4 + text.length);
      return;
    }

    insertEditorText(`\`${text}\``, 1, 1 + text.length);
  }

  if (!token) {
    const showAuthTabs = mode === "login" || mode === "register";

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
            {mode === "login"
              ? "Welcome back"
              : mode === "register"
                ? "Create your account"
                : mode === "forgot"
                  ? "Reset access"
                  : "Set a new password"}
          </h2>
          <p className="muted">
            {mode === "forgot" || mode === "reset"
              ? "Recover access to your private workspace without contacting an operator."
              : "Continue to your notes, notebooks, and self-hosted workspace checks."}
          </p>

          {showAuthTabs && (
            <div className="tabs" role="tablist" aria-label="Authentication mode">
              <button
                className={mode === "login" ? "tabActive" : "tab"}
                onClick={() => switchAuthMode("login")}
                type="button"
              >
                Sign in
              </button>
              <button
                className={mode === "register" ? "tabActive" : "tab"}
                onClick={() => switchAuthMode("register")}
                type="button"
              >
                Create account
              </button>
            </div>
          )}

          {error && <p className="error">{error}</p>}
          {resetStatus && <p className="successText authStatus">{resetStatus}</p>}

          {mode === "forgot" ? (
            <form onSubmit={requestPasswordReset} className="form">
              <label className="fieldGroup">
                <span className="fieldLabel">Account email</span>
                <input
                  className="input"
                  value={resetEmail}
                  onChange={(e) => setResetEmail(e.target.value)}
                  placeholder="you@example.com"
                  type="email"
                  autoComplete="email"
                  required
                />
              </label>
              <button className="primary">Send reset link</button>
              <button className="linkButton" onClick={() => switchAuthMode("login")} type="button">
                Back to sign in
              </button>
            </form>
          ) : mode === "reset" ? (
            <form onSubmit={resetAccountPassword} className="form">
              <label className="fieldGroup">
                <span className="fieldLabel">Reset token</span>
                <input
                  className="input"
                  value={resetToken}
                  onChange={(e) => setResetToken(e.target.value)}
                  placeholder="Paste reset token"
                  autoComplete="one-time-code"
                  required
                />
              </label>
              <label className="fieldGroup">
                <span className="fieldLabel">New password</span>
                <input
                  className="input"
                  type="password"
                  value={resetPassword}
                  onChange={(e) => setResetPassword(e.target.value)}
                  placeholder="New password"
                  autoComplete="new-password"
                  required
                />
              </label>
              <label className="fieldGroup">
                <span className="fieldLabel">Confirm new password</span>
                <input
                  className="input"
                  type="password"
                  value={resetConfirmPassword}
                  onChange={(e) => setResetConfirmPassword(e.target.value)}
                  placeholder="Confirm password"
                  autoComplete="new-password"
                  required
                />
              </label>
              <button className="primary">Reset password</button>
              <button className="linkButton" onClick={() => switchAuthMode("login")} type="button">
                Back to sign in
              </button>
            </form>
          ) : (
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
                <span className="fieldLabelRow">
                  <span className="fieldLabel">Password</span>
                  {mode === "login" && (
                    <button
                      className="linkButton fieldLink"
                      onClick={() => {
                        setResetEmail(email);
                        switchAuthMode("forgot");
                      }}
                      type="button"
                    >
                      Forgot password?
                    </button>
                  )}
                </span>
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
          )}
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
        <div className="globalSearch">
          <Search size={15} strokeWidth={2} />
          <input
            ref={globalSearchRef}
            value={globalQuery}
            onChange={(e) => setGlobalQuery(e.target.value)}
            placeholder="Search everything"
            aria-label="Search everything"
          />
          <span>Ctrl K</span>
          {globalQuery.trim().length >= 2 && (
            <div className="globalSearchResults">
              <div className="searchResultHeader">
                <span>{searching ? "Searching..." : "Results"}</span>
              </div>
              {searchResults?.notebooks.map((notebook) => (
                <button key={`notebook-${notebook.id}`} onClick={() => openSearchNotebook(notebook)} type="button">
                  <BookOpen size={15} strokeWidth={2} />
                  <span>{notebook.name}</span>
                  <small>Notebook</small>
                </button>
              ))}
              {searchResults?.notes.map((note) => (
                <button key={`note-${note.id}`} onClick={() => openSearchNote(note)} type="button">
                  <FileText size={15} strokeWidth={2} />
                  <span>{noteTitle(note)}</span>
                  <small>{note.notebook_name}</small>
                </button>
              ))}
              {!searching &&
                searchResults &&
                !searchResults.notebooks.length &&
                !searchResults.notes.length && <p className="emptySearch">No matches found.</p>}
            </div>
          )}
        </div>
        <button
          onClick={() => setActiveView("settings")}
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

      {activeView === "settings" ? (
        <section className="settingsPage" aria-label="Settings">
          <div className="settingsHero">
            <button className="secondary" onClick={() => setActiveView("workspace")} type="button">
              <ArrowLeft size={16} strokeWidth={2} />
              Workspace
            </button>
            <div>
              <p className="kicker">Settings</p>
              <h2>Workspace trust and account</h2>
              <p>{user?.email ?? "Loading account"}</p>
            </div>
          </div>

          <div className="settingsGrid">
            <section className="settingsPanel" aria-labelledby="password-title">
              <div className="settingsPanelHeader">
                <KeyRound size={18} strokeWidth={2} />
                <div>
                  <p className="kicker">Account</p>
                  <h3 id="password-title">Password</h3>
                </div>
              </div>
              <form className="settingsForm" onSubmit={changePassword}>
                <label className="fieldGroup">
                  <span className="fieldLabel">Current password</span>
                  <input
                    className="input"
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    autoComplete="current-password"
                    required
                  />
                </label>
                <label className="fieldGroup">
                  <span className="fieldLabel">New password</span>
                  <input
                    className="input"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    autoComplete="new-password"
                    required
                  />
                </label>
                <label className="fieldGroup">
                  <span className="fieldLabel">Confirm new password</span>
                  <input
                    className="input"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    autoComplete="new-password"
                    required
                  />
                </label>
                <button className="primary" type="submit">
                  Update password
                </button>
                {passwordStatus && <p className="successText">{passwordStatus}</p>}
              </form>
            </section>

            <section className="settingsPanel" aria-labelledby="install-title">
              <div className="settingsPanelHeader">
                <Mail size={18} strokeWidth={2} />
                <div>
                  <p className="kicker">Self-hosting</p>
                  <h3 id="install-title">Email delivery</h3>
                </div>
              </div>
              <p className="settingsCopy">
                Send a test email to confirm registration, password recovery, and notification mail are configured.
              </p>
              <button onClick={sendTestEmail} className="secondary" type="button">
                <Mail size={16} strokeWidth={2} />
                Send test email
              </button>
            </section>

            <section className="settingsPanel" aria-labelledby="data-title">
              <div className="settingsPanelHeader">
                <Download size={18} strokeWidth={2} />
                <div>
                  <p className="kicker">Ownership</p>
                  <h3 id="data-title">Workspace data</h3>
                </div>
              </div>
              <p className="settingsCopy">
                Export your notebooks as a portable JSON file or import an Obscribe export into this workspace.
              </p>
              <div className="settingsActions">
                <button onClick={exportWorkspace} className="secondary" type="button">
                  <Download size={16} strokeWidth={2} />
                  Export JSON
                </button>
                <button onClick={() => importInputRef.current?.click()} className="secondary" type="button">
                  <Upload size={16} strokeWidth={2} />
                  Import JSON
                </button>
                <input
                  ref={importInputRef}
                  className="hiddenFile"
                  type="file"
                  accept="application/json,.json"
                  onChange={(event) => importWorkspace(event.target.files?.[0] ?? null)}
                />
              </div>
              {(exportStatus || importStatus) && (
                <p className="successText">{importStatus || exportStatus}</p>
              )}
            </section>

            <section className="settingsPanel" aria-labelledby="operator-title">
              <div className="settingsPanelHeader">
                <RefreshCcw size={18} strokeWidth={2} />
                <div>
                  <p className="kicker">Operations</p>
                  <h3 id="operator-title">Self-host checks</h3>
                </div>
              </div>
              <p className="settingsCopy">
                These checks help confirm your self-hosted workspace is recoverable and portable.
              </p>
              <div className="opsList">
                <span className={statusLoaded ? "opsReady" : "opsMuted"}>
                  <CheckCircle2 size={15} strokeWidth={2.2} />
                  {statusLoaded ? "API connected" : "Checking API"}
                </span>
                <span className={appStatus?.mail.configured ? "opsReady" : "opsMuted"}>
                  <CheckCircle2 size={15} strokeWidth={2.2} />
                  {appStatus?.mail.configured ? "SMTP configured" : "SMTP status pending"}
                </span>
                <span className="opsReady">
                  <CheckCircle2 size={15} strokeWidth={2.2} />
                  Export and import available
                </span>
                <span className="opsMuted">
                  <FileText size={15} strokeWidth={2.2} />
                  {appStatus
                    ? `${appStatus.counts.notebooks} ${appStatus.counts.notebooks === 1 ? "notebook" : "notebooks"} / ${appStatus.counts.notes} ${appStatus.counts.notes === 1 ? "note" : "notes"}`
                    : "Workspace counts loading"}
                </span>
              </div>
            </section>
          </div>
        </section>
      ) : (
        <>
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
                <span className="countPill" aria-busy={!notebooksLoaded}>{notebookCountLabel}</span>
              </div>

              <form onSubmit={createNotebook} className="createRow">
                <input
                  className="input"
                  value={notebookName}
                  onChange={(e) => setNotebookName(e.target.value)}
                  placeholder="Notebook name"
                />
                <button
                  className="addButton"
                  aria-label="Create notebook"
                  disabled={!notebookName.trim()}
                >
                  <Plus size={19} strokeWidth={2.4} />
                </button>
              </form>
              <div className="templateLibrary" aria-label="Template library">
                <div className="templateLibraryHeader">
                  <div>
                    <span>Templates</span>
                    <small>Notebook systems and starter notes</small>
                  </div>
                  {templateQuery && (
                    <button onClick={() => setTemplateQuery("")} type="button">
                      Clear
                    </button>
                  )}
                </div>
                <label className="templateSearch">
                  <Search size={14} strokeWidth={2} />
                  <input
                    value={templateQuery}
                    onChange={(e) => setTemplateQuery(e.target.value)}
                    placeholder="Search templates"
                  />
                </label>
                <div className="templateFilters" role="tablist" aria-label="Template type">
                  {(["all", "notebook", "note"] as TemplateFilter[]).map((filter) => (
                    <button
                      key={filter}
                      className={templateFilter === filter ? "templateFilterActive" : ""}
                      onClick={() => setTemplateFilter(filter)}
                      type="button"
                    >
                      {filter === "all" ? "All" : filter === "notebook" ? "Notebooks" : "Notes"}
                    </button>
                  ))}
                </div>
                <div className="templateResults">
                  {filteredTemplates.map((template) => {
                    const TemplateIcon = template.icon;
                    const id = templateId(template);
                    const isSelected = selectedTemplateId === id;
                    const disabled = template.type === "note" && !activeNotebook;
                    return (
                      <div
                        key={id}
                        className={isSelected ? "templateResultActive" : "templateResult"}
                        onClick={() => setSelectedTemplateId(id)}
                        onDoubleClick={() => useTemplate(template)}
                        title={template.type === "note" ? "Use in the current notebook" : "Create this notebook system"}
                      >
                        <TemplateIcon size={15} strokeWidth={2.2} />
                        <div className="templateResultCopy">
                          <span>{template.name}</span>
                          <small>{template.summary}</small>
                        </div>
                        <em>{template.type === "notebook" ? "Notebook" : "Note"}</em>
                        <button
                          onClick={(event) => {
                            event.stopPropagation();
                            useTemplate(template);
                          }}
                          disabled={disabled}
                          type="button"
                        >
                          {disabled ? "Select notebook" : "Use"}
                        </button>
                      </div>
                    );
                  })}
                  {!filteredTemplates.length && <p className="emptySmall">No templates match that search.</p>}
                </div>
                {selectedTemplate && (
                  <div className="templatePreview">
                    <span>{selectedTemplate.type === "notebook" ? "Builds a notebook" : "Adds a note"}</span>
                    <p>{selectedTemplate.details}</p>
                    <button
                      onClick={() => useTemplate(selectedTemplate)}
                      disabled={selectedTemplate.type === "note" && !activeNotebook}
                      type="button"
                    >
                      {selectedTemplate.type === "note" && !activeNotebook ? "Select notebook first" : "Use template"}
                    </button>
                  </div>
                )}
              </div>
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
                  <div
                    key={notebook.id}
                    className={activeNotebook?.id === notebook.id ? "notebookRowActive" : "notebookRow"}
                  >
                    {renamingNotebookId === notebook.id ? (
                      <form
                        className="renameNotebookForm"
                        onSubmit={(e) => {
                          e.preventDefault();
                          renameNotebook(notebook.id);
                        }}
                      >
                        <input
                          value={renameNotebookValue}
                          onChange={(e) => setRenameNotebookValue(e.target.value)}
                          autoFocus
                          aria-label={`Rename ${notebook.name}`}
                        />
                        <button type="submit" aria-label="Save notebook name">
                          <Check size={14} strokeWidth={2.4} />
                        </button>
                        <button
                          onClick={() => setRenamingNotebookId(null)}
                          type="button"
                          aria-label="Cancel rename"
                        >
                          <X size={14} strokeWidth={2.4} />
                        </button>
                      </form>
                    ) : (
                      <button
                        onClick={() => {
                          setActiveNotebook(notebook);
                          setMobilePane("notes");
                        }}
                        className="notebookSelect"
                        type="button"
                      >
                        <span>{notebook.name}</span>
                      </button>
                    )}
                    {renamingNotebookId !== notebook.id && (
                      <button
                        onClick={() => startNotebookRename(notebook)}
                        className="rowIconButton"
                        type="button"
                        aria-label={`Rename ${notebook.name}`}
                        title={`Rename ${notebook.name}`}
                      >
                        <Edit3 size={14} strokeWidth={2} />
                      </button>
                    )}
                    {renamingNotebookId !== notebook.id && (
                      <button
                        onClick={() => setPendingNotebookDelete(notebook.id)}
                        className="rowIconButton"
                        type="button"
                        aria-label={`Delete ${notebook.name}`}
                        title={`Delete ${notebook.name}`}
                      >
                        <Trash2 size={14} strokeWidth={2} />
                      </button>
                    )}
                    {pendingNotebookDelete === notebook.id && (
                      <div className="inlineConfirm" role="alert">
                        <p>
                          Delete <span>{notebook.name}</span>?
                        </p>
                        <small>This also removes its notes.</small>
                        <div className="inlineConfirmActions">
                          <button className="secondary" onClick={() => setPendingNotebookDelete(null)} type="button">
                            Cancel
                          </button>
                          <button className="dangerButton" onClick={() => deleteNotebook(notebook.id)} type="button">
                            Delete
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
                {!notebooks.length && (
                  <button className="emptyAction" onClick={() => createNotebookNamed("Personal")} type="button">
                    Create a blank notebook
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
                  onClick={() => createNote()}
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
                  <button className="emptyAction" onClick={() => createNote()} disabled={!activeNotebook} type="button">
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
                    ref={titleInputRef}
                    className="titleInput"
                    value={noteParts.title}
                    onChange={(e) => updateNoteTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        editorRef.current?.focus();
                      }
                    }}
                    placeholder="Untitled"
                  />
                  <div className="editorToolbar" aria-label="Formatting toolbar">
                    <div className="editorModeToggle" role="tablist" aria-label="Editor mode">
                      <button
                        className={editorMode === "write" ? "editorModeActive" : ""}
                        onClick={() => setEditorMode("write")}
                        type="button"
                      >
                        Write
                      </button>
                      <button
                        className={editorMode === "preview" ? "editorModeActive" : ""}
                        onClick={() => setEditorMode("preview")}
                        type="button"
                      >
                        Preview
                      </button>
                    </div>
                    <button onClick={() => insertMarkdown("heading")} type="button" aria-label="Heading" title="Heading">
                      <Heading1 size={16} strokeWidth={2.3} />
                    </button>
                    <button onClick={() => insertMarkdown("bold")} type="button" aria-label="Bold" title="Bold">
                      <Bold size={16} strokeWidth={2.3} />
                    </button>
                    <button onClick={() => insertMarkdown("italic")} type="button" aria-label="Italic" title="Italic">
                      <Italic size={16} strokeWidth={2.3} />
                    </button>
                    <button onClick={() => insertMarkdown("link")} type="button" aria-label="Link" title="Link">
                      <Link2 size={16} strokeWidth={2.3} />
                    </button>
                    <button onClick={() => insertMarkdown("check")} type="button" aria-label="Checklist" title="Checklist">
                      <ListChecks size={16} strokeWidth={2.3} />
                    </button>
                    <button onClick={() => insertMarkdown("bullet")} type="button" aria-label="Bulleted list" title="Bulleted list">
                      <List size={16} strokeWidth={2.3} />
                    </button>
                    <button onClick={() => insertMarkdown("quote")} type="button" aria-label="Quote" title="Quote">
                      <Quote size={16} strokeWidth={2.3} />
                    </button>
                    <button onClick={() => insertMarkdown("code")} type="button" aria-label="Code" title="Code">
                      <Code2 size={16} strokeWidth={2.3} />
                    </button>
                  </div>
                  {editorMode === "write" ? (
                    <textarea
                      ref={editorRef}
                      className="editor"
                      value={noteParts.body}
                      onChange={(e) => updateNoteBody(e.target.value)}
                      placeholder="Start writing in Markdown..."
                    />
                  ) : (
                    <div className="markdownPreview" aria-label="Markdown preview">
                      {previewBlocks.length ? (
                        previewBlocks.map((block, index) => {
                          if (block.type === "heading") {
                            const HeadingTag = `h${Math.min(block.level + 1, 4)}` as "h2" | "h3" | "h4";
                            return <HeadingTag key={index}>{block.text}</HeadingTag>;
                          }

                          if (block.type === "check") {
                            return (
                              <p key={index} className="previewCheck">
                                <span className={block.checked ? "previewCheckDone" : ""} aria-hidden="true" />
                                {block.text}
                              </p>
                            );
                          }

                          if (block.type === "bullet") return <p key={index} className="previewBullet">{block.text}</p>;
                          if (block.type === "quote") return <blockquote key={index}>{block.text}</blockquote>;
                          if (block.type === "code") return <pre key={index}>{block.text}</pre>;
                          return <p key={index}>{block.text}</p>;
                        })
                      ) : (
                        <p className="previewEmpty">Nothing to preview yet.</p>
                      )}
                    </div>
                  )}
                  <footer className="editorFooter" aria-label="Note details">
                    <span>{bodyWordCount} {bodyWordCount === 1 ? "word" : "words"}</span>
                    <span>{noteParts.body.length} characters</span>
                    <span>{displayStatus}</span>
                  </footer>
                </>
              ) : (
                <div className="emptyState">
                  <div className="emptyPrompt">
                    <p className="kicker">{activeNotebook?.name ?? "Notebook"}</p>
                    <h2>Start a note</h2>
                    <p>Capture a thought, meeting, project plan, or working draft.</p>
                    <button className="primary emptyStateButton" onClick={() => createNote()} disabled={!activeNotebook} type="button">
                      <Plus size={16} strokeWidth={2.4} />
                      New note
                    </button>
                  </div>
                  <div className="emptyPreview" aria-hidden="true">
                    <span />
                    <span />
                    <span />
                    <span />
                  </div>
                </div>
              )}
            </section>
          </section>
        </>
      )}
    </main>
  );
}
