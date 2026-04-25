"use client";

import { FormEvent, useEffect, useState } from "react";

type User = { id: number; name: string; email: string };
type Workspace = { id: number; name: string };
type Notebook = { id: number; workspace_id: number; name: string };
type Note = { id: number; notebook_id: number; content: string | null; updated_at?: string };

const API = process.env.NEXT_PUBLIC_API_BASE_URL || "http://187.124.80.32:8000/api";

export default function Home() {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("Victor");
  const [email, setEmail] = useState("victor@test.com");
  const [password, setPassword] = useState("password123");
  const [token, setToken] = useState("");
  const [user, setUser] = useState<User | null>(null);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [notebooks, setNotebooks] = useState<Notebook[]>([]);
  const [notebookName, setNotebookName] = useState("New Notebook");
  const [activeNotebook, setActiveNotebook] = useState<Notebook | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [activeNote, setActiveNote] = useState<Note | null>(null);
  const [content, setContent] = useState("");
  const [status, setStatus] = useState("Ready");
  const [error, setError] = useState("");

  const headers = token ? { Accept: "application/json", "Content-Type": "application/json", Authorization: `Bearer ${token}` } : { Accept: "application/json", "Content-Type": "application/json" };

  useEffect(() => { const saved = localStorage.getItem("obscribe_token"); if (saved) setToken(saved); }, []);
  useEffect(() => { if (token) { loadMe(); loadNotebooks(); } }, [token]);
  useEffect(() => { if (activeNotebook) loadNotes(activeNotebook.id); }, [activeNotebook?.id]);
  useEffect(() => { setContent(activeNote?.content || ""); }, [activeNote?.id]);
  useEffect(() => {
    if (!activeNote) return;
    const timer = setTimeout(() => { if ((activeNote.content || "") !== content) saveNote(content); }, 1000);
    return () => clearTimeout(timer);
  }, [content, activeNote?.id]);

  async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
    setError("");
    const res = await fetch(API + path, { ...options, headers: { ...headers, ...(options.headers || {}) } });
    const text = await res.text();
    let data: any = {};
    try { data = text ? JSON.parse(text) : {}; } catch { throw new Error("Server returned HTML instead of JSON. Check Laravel logs."); }
    if (!res.ok) throw new Error(data.message || `HTTP ${res.status}`);
    return data;
  }

  async function auth(e: FormEvent) {
    e.preventDefault();
    try {
      const body = mode === "register" ? { name, email, password } : { email, password };
      const data = await api<{ token: string; user: User; workspace: Workspace | null }>(`/${mode}`, { method: "POST", body: JSON.stringify(body) });
      localStorage.setItem("obscribe_token", data.token);
      setToken(data.token); setUser(data.user); setWorkspace(data.workspace); setStatus("Logged in");
    } catch (err) { setError(err instanceof Error ? err.message : "Auth failed"); }
  }

  async function loadMe() { const data = await api<{ user: User; workspace: Workspace | null }>("/me"); setUser(data.user); setWorkspace(data.workspace); }
  async function loadNotebooks() { const data = await api<{ notebooks: Notebook[] }>("/notebooks"); setNotebooks(data.notebooks); if (!activeNotebook && data.notebooks[0]) setActiveNotebook(data.notebooks[0]); }
  async function createNotebook(e: FormEvent) { e.preventDefault(); const nb = await api<Notebook>("/notebooks", { method: "POST", body: JSON.stringify({ name: notebookName }) }); setNotebookName(""); setActiveNotebook(nb); await loadNotebooks(); }
  async function loadNotes(id: number) { const data = await api<{ notes: Note[] }>(`/notebooks/${id}/notes`); setNotes(data.notes); setActiveNote(data.notes[0] || null); }
  async function createNote() { if (!activeNotebook) return; const note = await api<Note>(`/notebooks/${activeNotebook.id}/notes`, { method: "POST" }); setNotes([note, ...notes]); setActiveNote(note); setStatus("Note created"); }
  async function saveNote(value: string) { if (!activeNote) return; setStatus("Saving..."); const note = await api<Note>(`/notes/${activeNote.id}`, { method: "PUT", body: JSON.stringify({ content: value }) }); setActiveNote(note); setNotes(notes.map((n) => n.id === note.id ? note : n)); setStatus("Saved"); }
  function logout() { localStorage.removeItem("obscribe_token"); location.reload(); }

  if (!token) return <main style={s.page}><section style={s.card}><h1>Obscribe</h1><p>Secure notebook platform</p><div style={s.tabs}><button onClick={() => setMode("login")}>Login</button><button onClick={() => setMode("register")}>Register</button></div>{error && <p style={s.error}>{error}</p>}<form onSubmit={auth} style={s.form}>{mode === "register" && <input style={s.input} value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" />}<input style={s.input} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" /><input style={s.input} type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" /><button style={s.primary}>{mode}</button></form></section></main>;

  return <main style={s.page}><header style={s.header}><div><h1>Obscribe</h1><p>{workspace?.name} · {user?.email} · {status}</p></div><button onClick={logout} style={s.secondary}>Logout</button></header>{error && <p style={s.error}>{error}</p>}<section style={s.shell}><aside style={s.panel}><h2>Notebooks</h2><form onSubmit={createNotebook} style={s.row}><input style={s.input} value={notebookName} onChange={(e) => setNotebookName(e.target.value)} placeholder="Notebook name" /><button style={s.primary}>Add</button></form>{notebooks.map((nb) => <button key={nb.id} onClick={() => setActiveNotebook(nb)} style={activeNotebook?.id === nb.id ? s.activeItem : s.item}>{nb.name}</button>)}</aside><aside style={s.panel}><h2>Notes</h2><button onClick={createNote} style={s.primary} disabled={!activeNotebook}>New note</button>{notes.map((note) => <button key={note.id} onClick={() => setActiveNote(note)} style={activeNote?.id === note.id ? s.activeItem : s.item}>{(note.content || "Untitled note").slice(0, 50)}</button>)}</aside><section style={s.editorPanel}>{activeNote ? <><h2>Editor</h2><textarea style={s.editor} value={content} onChange={(e) => setContent(e.target.value)} placeholder="Start writing..." /><button onClick={() => saveNote(content)} style={s.secondary}>Save now</button></> : <div style={s.empty}><h2>Select or create a note</h2><p>Your note editor will appear here.</p></div>}</section></section></main>;
}

const s: Record<string, React.CSSProperties> = { page:{minHeight:"100vh",padding:28,background:"#f6f3ee",fontFamily:"system-ui",color:"#171717"}, header:{maxWidth:1300,margin:"0 auto 20px",display:"flex",justifyContent:"space-between",alignItems:"center"}, card:{maxWidth:520,margin:"80px auto",background:"white",border:"1px solid #e4ddd3",borderRadius:20,padding:24}, tabs:{display:"flex",gap:10,margin:"18px 0"}, form:{display:"grid",gap:12}, input:{border:"1px solid #d6cec2",borderRadius:12,padding:12,fontSize:15}, primary:{border:0,borderRadius:12,padding:"12px 14px",background:"#171717",color:"white",fontWeight:800,cursor:"pointer"}, secondary:{border:"1px solid #d6cec2",borderRadius:12,padding:"10px 14px",background:"white",fontWeight:800,cursor:"pointer"}, error:{maxWidth:1300,margin:"0 auto 16px",background:"#fff1f1",color:"#9f1239",border:"1px solid #fecdd3",borderRadius:12,padding:12}, shell:{maxWidth:1300,margin:"0 auto",display:"grid",gridTemplateColumns:"260px 260px 1fr",gap:16,height:"74vh"}, panel:{background:"white",border:"1px solid #e4ddd3",borderRadius:18,padding:16,overflow:"auto",display:"grid",alignContent:"start",gap:10}, row:{display:"grid",gridTemplateColumns:"1fr auto",gap:8}, item:{textAlign:"left",border:"1px solid #eee",borderRadius:12,padding:12,background:"#fbfaf7",cursor:"pointer"}, activeItem:{textAlign:"left",border:"1px solid #171717",borderRadius:12,padding:12,background:"#171717",color:"white",cursor:"pointer"}, editorPanel:{background:"white",border:"1px solid #e4ddd3",borderRadius:18,padding:18,display:"flex",flexDirection:"column",gap:12}, editor:{flex:1,width:"100%",resize:"none",boxSizing:"border-box",border:"1px solid #e4ddd3",borderRadius:14,padding:18,fontSize:17,lineHeight:1.7}, empty:{margin:"auto",textAlign:"center",color:"#6b6258"} };
