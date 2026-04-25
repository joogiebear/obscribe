"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type User = {
  id: number;
  name: string;
  email: string;
};

type Workspace = {
  id: number;
  name: string;
  owner_id?: number;
};

type Notebook = {
  id: number;
  workspace_id: number;
  name: string;
  created_at?: string;
  updated_at?: string;
};

type AuthResponse = {
  token: string;
  user: User;
  workspace: Workspace | null;
};

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://187.124.80.32:8000/api";

export default function Home() {
  const [mode, setMode] = useState<"login" | "register">("register");
  const [name, setName] = useState("Victor");
  const [email, setEmail] = useState("victor@test.com");
  const [password, setPassword] = useState("password123");
  const [token, setToken] = useState("");
  const [user, setUser] = useState<User | null>(null);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [notebooks, setNotebooks] = useState<Notebook[]>([]);
  const [notebookName, setNotebookName] = useState("My Secure Notebook");
  const [status, setStatus] = useState("Ready");
  const [error, setError] = useState("");

  const isAuthed = Boolean(token);

  const authHeaders = useMemo(
    () => ({
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    }),
    [token]
  );

  useEffect(() => {
    const savedToken = window.localStorage.getItem("obscribe_token");

    if (savedToken) {
      setToken(savedToken);
    }
  }, []);

  useEffect(() => {
    if (token) {
      fetchMe(token);
      fetchNotebooks(token);
    }
  }, [token]);

  async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
    setError("");

    const response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
    });

    const text = await response.text();
    let data: unknown = null;

    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      throw new Error(
        `Server returned non-JSON response. HTTP ${response.status}. Check Laravel logs.`
      );
    }

    if (!response.ok) {
      const message =
        typeof data === "object" && data && "message" in data
          ? String((data as { message: string }).message)
          : `Request failed with HTTP ${response.status}`;
      throw new Error(message);
    }

    return data as T;
  }

  async function handleAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus(mode === "register" ? "Registering..." : "Logging in...");

    try {
      const payload =
        mode === "register" ? { name, email, password } : { email, password };

      const data = await request<AuthResponse>(`/${mode}`, {
        method: "POST",
        body: JSON.stringify(payload),
      });

      window.localStorage.setItem("obscribe_token", data.token);
      setToken(data.token);
      setUser(data.user);
      setWorkspace(data.workspace);
      setStatus("Authenticated");
    } catch (err) {
      setStatus("Auth failed");
      setError(err instanceof Error ? err.message : "Unknown auth error");
    }
  }

  async function fetchMe(activeToken = token) {
    if (!activeToken) return;

    try {
      const data = await request<{ user: User; workspace: Workspace | null }>(
        "/me",
        {
          headers: {
            Authorization: `Bearer ${activeToken}`,
          },
        }
      );

      setUser(data.user);
      setWorkspace(data.workspace);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load user");
    }
  }

  async function fetchNotebooks(activeToken = token) {
    if (!activeToken) return;

    try {
      const data = await request<{ notebooks: Notebook[] }>("/notebooks", {
        headers: {
          Authorization: `Bearer ${activeToken}`,
        },
      });

      setNotebooks(data.notebooks);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load notebooks");
    }
  }

  async function createNotebook(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("Creating notebook...");

    try {
      await request<Notebook>("/notebooks", {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({ name: notebookName }),
      });

      setNotebookName("");
      await fetchNotebooks();
      setStatus("Notebook created");
    } catch (err) {
      setStatus("Create failed");
      setError(err instanceof Error ? err.message : "Could not create notebook");
    }
  }

  function logout() {
    window.localStorage.removeItem("obscribe_token");
    setToken("");
    setUser(null);
    setWorkspace(null);
    setNotebooks([]);
    setStatus("Logged out");
  }

  return (
    <main style={styles.page}>
      <section style={styles.hero}>
        <div>
          <p style={styles.eyebrow}>Obscribe</p>
          <h1 style={styles.title}>Secure notebook platform</h1>
          <p style={styles.subtitle}>
            Self-hosted first, SaaS-ready later. This dev build tests Laravel auth,
            workspace scoping, and notebook creation from the browser.
          </p>
        </div>
        <div style={styles.statusBox}>
          <strong>Status</strong>
          <span>{status}</span>
        </div>
      </section>

      {error ? <div style={styles.error}>{error}</div> : null}

      {!isAuthed ? (
        <section style={styles.card}>
          <div style={styles.tabs}>
            <button
              onClick={() => setMode("register")}
              style={mode === "register" ? styles.activeTab : styles.tab}
            >
              Register
            </button>
            <button
              onClick={() => setMode("login")}
              style={mode === "login" ? styles.activeTab : styles.tab}
            >
              Login
            </button>
          </div>

          <form onSubmit={handleAuth} style={styles.form}>
            {mode === "register" ? (
              <label style={styles.label}>
                Name
                <input
                  style={styles.input}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  required
                />
              </label>
            ) : null}

            <label style={styles.label}>
              Email
              <input
                style={styles.input}
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </label>

            <label style={styles.label}>
              Password
              <input
                style={styles.input}
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                minLength={8}
              />
            </label>

            <button style={styles.primaryButton} type="submit">
              {mode === "register" ? "Create account" : "Log in"}
            </button>
          </form>
        </section>
      ) : (
        <section style={styles.grid}>
          <div style={styles.card}>
            <div style={styles.cardHeader}>
              <div>
                <p style={styles.eyebrow}>Dashboard</p>
                <h2 style={styles.cardTitle}>Account</h2>
              </div>
              <button style={styles.secondaryButton} onClick={logout}>
                Log out
              </button>
            </div>

            <div style={styles.detailList}>
              <div>
                <strong>User</strong>
                <span>{user ? `${user.name} (${user.email})` : "Loading..."}</span>
              </div>
              <div>
                <strong>Workspace</strong>
                <span>{workspace ? workspace.name : "No workspace found"}</span>
              </div>
              <div>
                <strong>Token</strong>
                <span style={styles.token}>{token.slice(0, 32)}...</span>
              </div>
            </div>
          </div>

          <div style={styles.card}>
            <div style={styles.cardHeader}>
              <div>
                <p style={styles.eyebrow}>Notebooks</p>
                <h2 style={styles.cardTitle}>Create notebook</h2>
              </div>
              <button style={styles.secondaryButton} onClick={() => fetchNotebooks()}>
                Refresh
              </button>
            </div>

            <form onSubmit={createNotebook} style={styles.inlineForm}>
              <input
                style={styles.input}
                placeholder="Notebook name"
                value={notebookName}
                onChange={(event) => setNotebookName(event.target.value)}
                required
              />
              <button style={styles.primaryButton} type="submit">
                Create
              </button>
            </form>

            <div style={styles.notebookList}>
              {notebooks.length === 0 ? (
                <p style={styles.empty}>No notebooks yet.</p>
              ) : (
                notebooks.map((notebook) => (
                  <article key={notebook.id} style={styles.notebookItem}>
                    <strong>{notebook.name}</strong>
                    <span>Workspace #{notebook.workspace_id}</span>
                  </article>
                ))
              )}
            </div>
          </div>
        </section>
      )}
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    background: "#f6f3ee",
    color: "#171717",
    padding: 32,
    fontFamily:
      'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },
  hero: {
    maxWidth: 1120,
    margin: "0 auto 24px",
    display: "flex",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 24,
  },
  eyebrow: {
    margin: 0,
    textTransform: "uppercase",
    letterSpacing: 1.5,
    fontSize: 12,
    fontWeight: 700,
    color: "#6b6258",
  },
  title: {
    margin: "8px 0",
    fontSize: 48,
    lineHeight: 1,
  },
  subtitle: {
    margin: 0,
    maxWidth: 680,
    color: "#5f5a54",
    fontSize: 17,
    lineHeight: 1.6,
  },
  statusBox: {
    background: "#ffffff",
    border: "1px solid #e4ddd3",
    borderRadius: 16,
    padding: 16,
    minWidth: 180,
    display: "grid",
    gap: 6,
    boxShadow: "0 10px 30px rgba(0,0,0,0.06)",
  },
  error: {
    maxWidth: 1120,
    margin: "0 auto 24px",
    background: "#fff1f1",
    color: "#9f1239",
    border: "1px solid #fecdd3",
    borderRadius: 14,
    padding: 16,
  },
  grid: {
    maxWidth: 1120,
    margin: "0 auto",
    display: "grid",
    gridTemplateColumns: "1fr 1.2fr",
    gap: 24,
  },
  card: {
    maxWidth: 720,
    margin: "0 auto",
    width: "100%",
    background: "#ffffff",
    border: "1px solid #e4ddd3",
    borderRadius: 20,
    padding: 24,
    boxShadow: "0 10px 30px rgba(0,0,0,0.06)",
  },
  cardHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 16,
    marginBottom: 20,
  },
  cardTitle: {
    margin: "4px 0 0",
    fontSize: 24,
  },
  tabs: {
    display: "flex",
    gap: 8,
    background: "#f4efe7",
    borderRadius: 14,
    padding: 6,
    marginBottom: 20,
  },
  tab: {
    flex: 1,
    border: 0,
    borderRadius: 10,
    background: "transparent",
    padding: "12px 16px",
    cursor: "pointer",
    fontWeight: 700,
  },
  activeTab: {
    flex: 1,
    border: 0,
    borderRadius: 10,
    background: "#171717",
    color: "#ffffff",
    padding: "12px 16px",
    cursor: "pointer",
    fontWeight: 700,
  },
  form: {
    display: "grid",
    gap: 16,
  },
  inlineForm: {
    display: "grid",
    gridTemplateColumns: "1fr auto",
    gap: 12,
    marginBottom: 20,
  },
  label: {
    display: "grid",
    gap: 8,
    fontWeight: 700,
  },
  input: {
    width: "100%",
    boxSizing: "border-box",
    border: "1px solid #d6cec2",
    borderRadius: 12,
    padding: "13px 14px",
    fontSize: 16,
    outline: "none",
  },
  primaryButton: {
    border: 0,
    borderRadius: 12,
    background: "#171717",
    color: "#ffffff",
    padding: "13px 18px",
    fontSize: 16,
    fontWeight: 800,
    cursor: "pointer",
  },
  secondaryButton: {
    border: "1px solid #d6cec2",
    borderRadius: 12,
    background: "#ffffff",
    padding: "10px 14px",
    fontWeight: 800,
    cursor: "pointer",
  },
  detailList: {
    display: "grid",
    gap: 14,
  },
  token: {
    display: "block",
    maxWidth: 320,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    color: "#5f5a54",
  },
  notebookList: {
    display: "grid",
    gap: 12,
  },
  notebookItem: {
    border: "1px solid #ece5db",
    borderRadius: 14,
    padding: 16,
    display: "grid",
    gap: 6,
    background: "#fbfaf7",
  },
  empty: {
    color: "#6b6258",
  },
};
