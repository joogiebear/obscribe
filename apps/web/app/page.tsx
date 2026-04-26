"use client";

import {
  ArrowLeft,
  Activity,
  Archive,
  BookOpen,
  Bold,
  Briefcase,
  Check,
  CheckCircle2,
  ClipboardList,
  Clock3,
  Code2,
  Copy,
  Download,
  Edit3,
  ExternalLink,
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
  Minus,
  Moon,
  PenLine,
  Pin,
  Plus,
  Quote,
  RefreshCcw,
  Save,
  Search,
  Settings,
  ShieldCheck,
  Sun,
  Ticket,
  Trash2,
  Upload,
  UserCheck,
  UserX,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { FormEvent, KeyboardEvent as ReactKeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

type AuthMode = "login" | "register" | "forgot" | "reset";
type ThemeMode = "light" | "dark";
type User = { id: number; name: string; email: string; is_admin: boolean; email_verified?: boolean; disabled?: boolean };
type Workspace = { id: number; name: string };
type Notebook = { id: number; workspace_id: number; name: string; pinned_at?: string | null };
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
  | "content-planner"
  | "startup-os"
  | "product-management"
  | "sales-pipeline"
  | "hiring-pipeline"
  | "learning-notebook"
  | "personal-knowledge-base"
  | "support-desk"
  | "content-studio"
  | "agency-client-hub"
  | "dev-journal";
type NotebookTemplate = {
  key: NotebookTemplateKey;
  type: "notebook";
  name: string;
  summary: string;
  details: string;
  includes: string[];
  icon: LucideIcon;
};
type MailStatus = { sent: boolean; driver: string; message?: string };
type SearchNote = Note & { notebook_name: string; snippet?: string };
type SearchResults = { notebooks: Notebook[]; notes: SearchNote[] };
type MarkdownFormat = "heading" | "bold" | "italic" | "link" | "check" | "bullet" | "quote" | "code";
type AppStatus = {
  status: string;
  counts: { notebooks: number; notes: number };
  mail: { driver: string; configured: boolean; host?: string; from?: string };
};
type AppConfig = {
  registration_mode: "open" | "invite" | "closed";
  email_verification_required: boolean;
  plans: Array<{ key: string; name: string; price: string; notes: string }>;
};
type AdminUser = {
  id: number;
  name: string;
  email: string;
  email_verified_at?: string | null;
  disabled_at?: string | null;
  last_seen_at?: string | null;
  created_at?: string;
  workspace_count: number;
  is_admin: boolean;
};
type AdminInvite = {
  id: number;
  email?: string | null;
  max_uses: number;
  used_count: number;
  expires_at?: string | null;
  disabled_at?: string | null;
  created_at?: string;
};
type AdminHealth = {
  app: { url: string; domain: string; edition: string; version: string; environment: string };
  launch: { registration_mode: string; email_verification_required: boolean };
  ssl: { managed_by: string; expected: boolean };
  mail: { driver: string; configured: boolean; host?: string; from?: string };
  backup: { available: boolean; name?: string; size?: number; created_at?: string };
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
  | { type: "divider" }
  | { type: "paragraph"; text: string };
type NoteSectionTemplateKey =
  | "meeting-notes"
  | "daily-plan"
  | "decision-record"
  | "project-status"
  | "product-spec"
  | "customer-interview"
  | "weekly-review"
  | "research-source"
  | "bug-report"
  | "content-brief"
  | "client-call"
  | "retrospective";
type BaseBlockCommandId =
  | "heading"
  | "check"
  | "bullet"
  | "quote"
  | "code"
  | "divider";
type BlockCommandId = BaseBlockCommandId | `section:${NoteSectionTemplateKey}`;
type BlockCommand = {
  id: BlockCommandId;
  label: string;
  description: string;
  icon: LucideIcon;
  kind: "block" | "section";
  searchText?: string;
};
type NoteSectionTemplate = {
  key: NoteSectionTemplateKey;
  name: string;
  summary: string;
  icon: LucideIcon;
  aliases: string[];
  content: string;
};

const API =
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:8000/api";
const CURSOR_TOKEN = "{{cursor}}";

const NOTEBOOK_TEMPLATES: NotebookTemplate[] = [
  {
    key: "meeting-notes",
    type: "notebook",
    name: "Meeting Notes",
    summary: "Agenda, decisions, action items",
    details: "Creates notes for recurring meetings, 1:1s, and decisions.",
    includes: ["Meeting Notes", "1:1 Notes", "Decision Log"],
    icon: ClipboardList,
  },
  {
    key: "project-hub",
    type: "notebook",
    name: "Project Hub",
    summary: "Overview, tasks, milestones, risks",
    details: "Creates a project workspace with planning and tracking notes.",
    includes: ["Project Overview", "Tasks", "Milestones", "Risks and Decisions"],
    icon: Briefcase,
  },
  {
    key: "client-workspace",
    type: "notebook",
    name: "Client Workspace",
    summary: "Profile, calls, requirements",
    details: "Creates a workspace for client context, calls, and requirements.",
    includes: ["Client Profile", "Call Notes", "Requirements"],
    icon: Users,
  },
  {
    key: "research-notebook",
    type: "notebook",
    name: "Research Notebook",
    summary: "Sources, findings, summary",
    details: "Creates notes for sources, findings, and research synthesis.",
    includes: ["Research Brief", "Sources", "Findings"],
    icon: FileSearch,
  },
  {
    key: "content-planner",
    type: "notebook",
    name: "Content Planner",
    summary: "Ideas, drafts, publishing checklist",
    details: "Creates an editorial workspace for ideas, drafts, and publishing.",
    includes: ["Content Ideas", "Draft Template", "Publishing Checklist"],
    icon: PenLine,
  },
  {
    key: "startup-os",
    type: "notebook",
    name: "Startup Operating System",
    summary: "Priorities, roadmap, metrics, updates",
    details: "Creates a founder workspace for weekly focus, company context, roadmap decisions, metrics, and investor updates.",
    includes: ["Company Overview", "Weekly Priorities", "Product Roadmap", "Metrics", "Investor Updates"],
    icon: Briefcase,
  },
  {
    key: "product-management",
    type: "notebook",
    name: "Product Management",
    summary: "Briefs, feedback, specs, releases",
    details: "Creates a product workspace for shaping features, collecting feedback, planning releases, and tracking decisions.",
    includes: ["Product Brief", "User Feedback", "Feature Specs", "Release Plan", "Decision Log"],
    icon: FileText,
  },
  {
    key: "sales-pipeline",
    type: "notebook",
    name: "Sales Pipeline",
    summary: "Leads, calls, objections, follow-ups",
    details: "Creates a sales workspace for tracking opportunities from first lead through close and post-call follow-up.",
    includes: ["Leads", "Discovery Calls", "Objections", "Follow-ups", "Closed Won and Lost Notes"],
    icon: Users,
  },
  {
    key: "hiring-pipeline",
    type: "notebook",
    name: "Hiring Pipeline",
    summary: "Role brief, interviews, scorecards",
    details: "Creates a hiring workspace for defining roles, running structured interviews, and keeping candidate notes organized.",
    includes: ["Role Brief", "Candidate Notes", "Interview Questions", "Scorecard", "Offer Process"],
    icon: ClipboardList,
  },
  {
    key: "learning-notebook",
    type: "notebook",
    name: "Learning Notebook",
    summary: "Study plan, reading notes, concepts",
    details: "Creates a personal learning workspace for study plans, reading notes, practice, and synthesis.",
    includes: ["Study Plan", "Reading Notes", "Concepts", "Practice Log", "Summary"],
    icon: BookOpen,
  },
  {
    key: "personal-knowledge-base",
    type: "notebook",
    name: "Personal Knowledge Base",
    summary: "Inbox, people, ideas, references",
    details: "Creates a lightweight personal knowledge system for ideas, references, people, and weekly review.",
    includes: ["Inbox", "People", "Ideas", "References", "Weekly Review"],
    icon: BookOpen,
  },
  {
    key: "support-desk",
    type: "notebook",
    name: "Support Desk",
    summary: "Issues, reports, resolutions, FAQ",
    details: "Creates a support workspace for customer issues, bug reproduction, resolutions, and reusable answers.",
    includes: ["Open Issues", "Customer Reports", "Bug Reproduction", "Resolutions", "FAQ Drafts"],
    icon: CheckCircle2,
  },
  {
    key: "content-studio",
    type: "notebook",
    name: "Content Studio",
    summary: "Calendar, ideas, drafts, distribution",
    details: "Creates a content production workspace for planning, drafting, publishing, and performance notes.",
    includes: ["Content Calendar", "Ideas", "Drafts", "Distribution Checklist", "Performance Notes"],
    icon: PenLine,
  },
  {
    key: "agency-client-hub",
    type: "notebook",
    name: "Agency Client Hub",
    summary: "Brief, deliverables, approvals, billing",
    details: "Creates an agency workspace for client briefs, deliverables, meetings, approvals, and billing context.",
    includes: ["Client Brief", "Deliverables", "Meeting Notes", "Approvals", "Billing Notes"],
    icon: Briefcase,
  },
  {
    key: "dev-journal",
    type: "notebook",
    name: "Dev Journal",
    summary: "Architecture, bugs, commands, deploys",
    details: "Creates an engineering notebook for architecture notes, debugging, deploy records, and postmortems.",
    includes: ["Architecture Notes", "Bugs", "Commands", "Deploy Notes", "Postmortems"],
    icon: Code2,
  },
];

const NOTE_SECTION_TEMPLATES: NoteSectionTemplate[] = [
  {
    key: "meeting-notes",
    name: "Meeting Notes",
    summary: "Agenda, decisions, action items",
    icon: ClipboardList,
    aliases: ["standup", "sync", "1:1", "one on one"],
    content: [
      "## Meeting Notes",
      "Date: " + CURSOR_TOKEN,
      "Attendees: ",
      "",
      "### Agenda",
      "- ",
      "",
      "### Decisions",
      "- ",
      "",
      "### Action Items",
      "- [ ] ",
    ].join("\n"),
  },
  {
    key: "daily-plan",
    name: "Daily Plan",
    summary: "Priorities, notes, wins",
    icon: Clock3,
    aliases: ["today", "planning", "tasks", "focus"],
    content: [
      "## Daily Plan",
      "Date: " + CURSOR_TOKEN,
      "",
      "### Top Priorities",
      "- [ ] ",
      "- [ ] ",
      "- [ ] ",
      "",
      "### Notes",
      "",
      "### Wins",
      "- ",
    ].join("\n"),
  },
  {
    key: "decision-record",
    name: "Decision Record",
    summary: "Context, choice, next steps",
    icon: CheckCircle2,
    aliases: ["decision", "adr", "choice", "tradeoff"],
    content: [
      "## Decision",
      "Context: " + CURSOR_TOKEN,
      "",
      "### Decision",
      "",
      "### Options Considered",
      "- ",
      "",
      "### Next Steps",
      "- [ ] ",
    ].join("\n"),
  },
  {
    key: "project-status",
    name: "Project Status",
    summary: "Progress, blockers, next steps",
    icon: Briefcase,
    aliases: ["project update", "milestones", "stakeholder update"],
    content: [
      "## Project Status",
      "Status: " + CURSOR_TOKEN,
      "",
      "### Progress",
      "- ",
      "",
      "### Blockers",
      "- ",
      "",
      "### Next Steps",
      "- [ ] ",
    ].join("\n"),
  },
  {
    key: "product-spec",
    name: "Product Spec",
    summary: "Problem, scope, requirements",
    icon: FileText,
    aliases: ["prd", "feature", "requirements", "product brief"],
    content: [
      "## Product Spec",
      "Problem: " + CURSOR_TOKEN,
      "",
      "### Users",
      "- ",
      "",
      "### Requirements",
      "- ",
      "",
      "### Out of Scope",
      "- ",
      "",
      "### Open Questions",
      "- ",
    ].join("\n"),
  },
  {
    key: "customer-interview",
    name: "Customer Interview",
    summary: "Questions, insights, follow-up",
    icon: Users,
    aliases: ["user interview", "customer research", "discovery"],
    content: [
      "## Customer Interview",
      "Customer: " + CURSOR_TOKEN,
      "Date: ",
      "",
      "### Goals",
      "- ",
      "",
      "### Questions",
      "- ",
      "",
      "### Insights",
      "- ",
      "",
      "### Follow-up",
      "- [ ] ",
    ].join("\n"),
  },
  {
    key: "weekly-review",
    name: "Weekly Review",
    summary: "Wins, lessons, next week",
    icon: Clock3,
    aliases: ["review", "planning", "weekly planning"],
    content: [
      "## Weekly Review",
      "Week of: " + CURSOR_TOKEN,
      "",
      "### Wins",
      "- ",
      "",
      "### Lessons",
      "- ",
      "",
      "### Carry Forward",
      "- [ ] ",
      "",
      "### Next Week",
      "- [ ] ",
    ].join("\n"),
  },
  {
    key: "research-source",
    name: "Research Source",
    summary: "Source notes and takeaways",
    icon: FileSearch,
    aliases: ["source", "citation", "reading notes", "research"],
    content: [
      "## Research Source",
      "Source: " + CURSOR_TOKEN,
      "Link: ",
      "",
      "### Key Points",
      "- ",
      "",
      "### Evidence",
      "- ",
      "",
      "### Takeaways",
      "- ",
    ].join("\n"),
  },
  {
    key: "bug-report",
    name: "Bug Report",
    summary: "Steps, expected, actual",
    icon: Code2,
    aliases: ["issue", "defect", "qa", "debug"],
    content: [
      "## Bug Report",
      "Summary: " + CURSOR_TOKEN,
      "",
      "### Steps to Reproduce",
      "1. ",
      "",
      "### Expected",
      "",
      "### Actual",
      "",
      "### Notes",
      "- ",
    ].join("\n"),
  },
  {
    key: "content-brief",
    name: "Content Brief",
    summary: "Audience, angle, outline",
    icon: PenLine,
    aliases: ["article", "post", "newsletter", "draft"],
    content: [
      "## Content Brief",
      "Topic: " + CURSOR_TOKEN,
      "Audience: ",
      "",
      "### Angle",
      "",
      "### Outline",
      "- ",
      "",
      "### Distribution",
      "- [ ] ",
    ].join("\n"),
  },
  {
    key: "client-call",
    name: "Client Call",
    summary: "Context, asks, commitments",
    icon: Users,
    aliases: ["client", "sales call", "account"],
    content: [
      "## Client Call",
      "Client: " + CURSOR_TOKEN,
      "Date: ",
      "",
      "### Context",
      "- ",
      "",
      "### Requests",
      "- ",
      "",
      "### Commitments",
      "- [ ] ",
    ].join("\n"),
  },
  {
    key: "retrospective",
    name: "Retrospective",
    summary: "What worked, what did not, actions",
    icon: RefreshCcw,
    aliases: ["retro", "postmortem", "lessons learned"],
    content: [
      "## Retrospective",
      "Scope: " + CURSOR_TOKEN,
      "",
      "### What Worked",
      "- ",
      "",
      "### What Did Not",
      "- ",
      "",
      "### Actions",
      "- [ ] ",
    ].join("\n"),
  },
];

const BASIC_BLOCK_COMMANDS: BlockCommand[] = [
  {
    id: "heading",
    label: "Heading",
    description: "Section title",
    icon: Heading1,
    kind: "block",
  },
  {
    id: "check",
    label: "Checklist",
    description: "Track open items",
    icon: ListChecks,
    kind: "block",
  },
  {
    id: "bullet",
    label: "Bullet list",
    description: "Capture grouped points",
    icon: List,
    kind: "block",
  },
  {
    id: "quote",
    label: "Quote",
    description: "Pull out context",
    icon: Quote,
    kind: "block",
  },
  {
    id: "code",
    label: "Code block",
    description: "Commands or snippets",
    icon: Code2,
    kind: "block",
  },
  {
    id: "divider",
    label: "Divider",
    description: "Separate sections",
    icon: Minus,
    kind: "block",
  },
];

const SECTION_BLOCK_COMMANDS: BlockCommand[] = NOTE_SECTION_TEMPLATES.map((template) => ({
  id: `section:${template.key}`,
  label: template.name,
  description: template.summary,
  icon: template.icon,
  kind: "section",
  searchText: template.aliases.join(" "),
}));

const BLOCK_COMMANDS: BlockCommand[] = [...BASIC_BLOCK_COMMANDS, ...SECTION_BLOCK_COMMANDS];

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

function formatDateTime(value?: string | null) {
  if (!value) return "Not recorded";
  return new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatBytes(value?: number) {
  if (!value) return "0 B";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  if (value < 1024 * 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MB`;
  return `${(value / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

function noteSearchPreview(note: SearchNote) {
  return (note.snippet || notePreview(note)).replace(/\s+/g, " ").trim() || "Blank note";
}

function starterSectionContent(key: NoteSectionTemplateKey) {
  const template = NOTE_SECTION_TEMPLATES.find((item) => item.key === key);
  return template ? template.content.replace(CURSOR_TOKEN, "") : "";
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

    if (/^---+$/.test(trimmed)) {
      blocks.push({ type: "divider" });
      continue;
    }

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
  const [inviteCode, setInviteCode] = useState("");
  const [token, setToken] = useState("");
  const [user, setUser] = useState<User | null>(null);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [notebooks, setNotebooks] = useState<Notebook[]>([]);
  const [notebooksLoaded, setNotebooksLoaded] = useState(false);
  const [notebookName, setNotebookName] = useState("");
  const [templateQuery, setTemplateQuery] = useState("");
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
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
  const [appConfig, setAppConfig] = useState<AppConfig | null>(null);
  const [recentNotes, setRecentNotes] = useState<SearchNote[]>([]);
  const [adminUsers, setAdminUsers] = useState<AdminUser[]>([]);
  const [adminInvites, setAdminInvites] = useState<AdminInvite[]>([]);
  const [adminHealth, setAdminHealth] = useState<AdminHealth | null>(null);
  const [adminEvents, setAdminEvents] = useState<Array<{ event_name: string; total: string }>>([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteStatus, setInviteStatus] = useState("");
  const [adminStatus, setAdminStatus] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordStatus, setPasswordStatus] = useState("");
  const [resetEmail, setResetEmail] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [resetPassword, setResetPassword] = useState("");
  const [resetConfirmPassword, setResetConfirmPassword] = useState("");
  const [resetStatus, setResetStatus] = useState("");
  const [verificationPromptEmail, setVerificationPromptEmail] = useState("");
  const [exportStatus, setExportStatus] = useState("");
  const [importStatus, setImportStatus] = useState("");
  const [editorMode, setEditorMode] = useState<"write" | "preview">("write");
  const [blockMenuOpen, setBlockMenuOpen] = useState(false);
  const [slashMenu, setSlashMenu] = useState<{ start: number; end: number; query: string } | null>(null);
  const [activeBlockCommandIndex, setActiveBlockCommandIndex] = useState(0);
  const [appStatus, setAppStatus] = useState<AppStatus | null>(null);
  const [statusLoaded, setStatusLoaded] = useState(false);
  const [theme, setTheme] = useState<ThemeMode>("light");
  const [themeReady, setThemeReady] = useState(false);
  const globalSearchRef = useRef<HTMLInputElement | null>(null);
  const templateSearchRef = useRef<HTMLInputElement | null>(null);
  const titleInputRef = useRef<HTMLInputElement | null>(null);
  const editorRef = useRef<HTMLTextAreaElement | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const targetNoteIdRef = useRef<number | null>(null);
  const activeNoteIdRef = useRef<number | null>(null);
  const contentRef = useRef("");

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
      if (!activeNote) return false;
      const noteId = activeNote.id;

      try {
        setStatus("Saving...");
        const note = await api<Note>(`/notes/${noteId}`, {
          method: "PUT",
          body: JSON.stringify({ content: value }),
        });
        if (activeNoteIdRef.current === note.id) {
          setActiveNote(note);
        }
        setNotes((current) => current.map((n) => (n.id === note.id ? note : n)));
        setStatus("Saved");
        setLastSavedAt(new Date());
        return true;
      } catch (err) {
        setStatus("Save failed");
        setError(err instanceof Error ? err.message : "Unable to save note");
        return false;
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

  const loadAppConfig = useCallback(async () => {
    const data = await api<AppConfig>("/config");
    setAppConfig(data);
  }, [api]);

  const loadRecentNotes = useCallback(async () => {
    if (!token) return;
    try {
      const data = await api<{ notes: SearchNote[] }>("/notes/recent");
      setRecentNotes(data.notes);
    } catch {
      setRecentNotes([]);
    }
  }, [api, token]);

  const loadAdminData = useCallback(async () => {
    if (!user?.is_admin) return;
    try {
      const [usersData, invitesData, healthData, eventsData] = await Promise.all([
        api<{ users: AdminUser[] }>("/admin/users"),
        api<{ invites: AdminInvite[] }>("/admin/invites"),
        api<AdminHealth>("/admin/health"),
        api<{ events: Array<{ event_name: string; total: string }> }>("/admin/analytics"),
      ]);
      setAdminUsers(usersData.users);
      setAdminInvites(invitesData.invites);
      setAdminHealth(healthData);
      setAdminEvents(eventsData.events);
      setAdminStatus("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load admin data");
    }
  }, [api, user?.is_admin]);

  useEffect(() => {
    const saved = localStorage.getItem("obscribe_token");
    if (saved) setToken(saved);

    const savedTheme = localStorage.getItem("obscribe_theme") === "dark" ? "dark" : "light";
    setTheme(savedTheme);
    document.documentElement.dataset.theme = savedTheme;
    setThemeReady(true);

    const params = new URLSearchParams(window.location.search);
    const urlResetToken = params.get("reset_token");
    if (urlResetToken) {
      setResetToken(urlResetToken);
      setMode("reset");
      window.history.replaceState({}, "", window.location.pathname);
    }

    const urlVerifyToken = params.get("verify_token");
    if (urlVerifyToken) {
      api<{ verified: boolean }>("/email/verify", {
        method: "POST",
        body: JSON.stringify({ token: urlVerifyToken }),
      })
        .then(() => {
          setResetStatus("Email verified. You can sign in now.");
          setMode("login");
        })
        .catch((err) => setError(err instanceof Error ? err.message : "Unable to verify email"))
        .finally(() => window.history.replaceState({}, "", window.location.pathname));
    }
  }, []);

  useEffect(() => {
    if (!themeReady) return;
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("obscribe_theme", theme);
  }, [theme, themeReady]);

  useEffect(() => {
    loadAppConfig().catch(() => undefined);
  }, [loadAppConfig]);

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
    if (token && activeView === "settings" && user?.is_admin) {
      loadAppStatus();
      loadAdminData();
    }
  }, [activeView, loadAdminData, loadAppStatus, token, user?.is_admin]);

  useEffect(() => {
    activeNoteIdRef.current = activeNote?.id ?? null;
  }, [activeNote?.id]);

  useEffect(() => {
    contentRef.current = content;
  }, [content]);

  useEffect(() => {
    if (!activeNotebook) {
      setNotes([]);
      setActiveNote(null);
      return;
    }

    loadNotes(activeNotebook.id).catch((err) => {
      setError(err instanceof Error ? err.message : "Unable to load notes");
    });
    loadRecentNotes();
  }, [activeNotebook, loadNotes, loadRecentNotes]);

  useEffect(() => {
    setContent(activeNote?.content || "");
    setLastSavedAt(null);
    setPendingDelete(false);
    setBlockMenuOpen(false);
    setSlashMenu(null);
  }, [activeNote?.id, activeNote?.content]);

  useEffect(() => {
    if (!activeNote || (activeNote.content || "") === content) return;

    const timer = window.setTimeout(() => {
      saveNote(content);
    }, 900);

    return () => window.clearTimeout(timer);
  }, [activeNote, content, saveNote]);

  useEffect(() => {
    const isDirtyNow = Boolean(activeNote && (activeNote.content || "") !== content);
    if (!isDirtyNow) return;

    function handleBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = "";
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "hidden") {
        void saveNote(contentRef.current);
      }
    }

    window.addEventListener("beforeunload", handleBeforeUnload);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [activeNote, content, saveNote]);

  useEffect(() => {
    if (!templateDialogOpen) return;
    setSelectedTemplateId((current) => current || NOTEBOOK_TEMPLATES[0]?.key || "");
    window.setTimeout(() => templateSearchRef.current?.focus(), 0);
  }, [templateDialogOpen]);

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
        setTemplateDialogOpen(false);
        setBlockMenuOpen(false);
        setSlashMenu(null);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeNote, activeNotebook, content, createNote, saveNote]);

  function switchAuthMode(nextMode: AuthMode) {
    setMode(nextMode);
    setError("");
    setVerificationPromptEmail("");
  }

  function openTemplateDialog() {
    setTemplateDialogOpen(true);
    setSelectedTemplateId((current) => current || NOTEBOOK_TEMPLATES[0]?.key || "");
  }

  function closeTemplateDialog() {
    setTemplateDialogOpen(false);
    setTemplateQuery("");
  }

  function toggleTheme() {
    setTheme((current) => (current === "dark" ? "light" : "dark"));
  }

  async function flushActiveNote() {
    if (!activeNote || (activeNote.content || "") === content) return true;
    return saveNote(content);
  }

  async function auth(e: FormEvent) {
    e.preventDefault();
    setVerificationPromptEmail("");

    try {
      const body = mode === "register" ? { name, email, password, invite_code: inviteCode } : { email, password };
      const data = await api<{
        token?: string;
        user?: User;
        workspace: Workspace | null;
        mail?: MailStatus;
        needs_verification?: boolean;
      }>(
        `/${mode}`,
        { method: "POST", body: JSON.stringify(body) },
      );

      if (data.needs_verification || !data.token || !data.user) {
        setStatus("Check your email to verify your account.");
        setResetStatus("Check your email to verify your account, then sign in.");
        setMode("login");
        setPassword("");
        return;
      }

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
      const message = err instanceof Error ? err.message : "Authentication failed";
      if (mode === "login" && message.toLowerCase().includes("verify")) {
        const emailValue = email.trim();
        setResetEmail(emailValue);
        setVerificationPromptEmail(emailValue);
        setResetStatus("That account still needs email verification.");
        setError("");
        return;
      }
      setError(message);
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

  async function resendVerificationEmail() {
    const emailValue = (verificationPromptEmail || resetEmail || email).trim();
    if (!emailValue) {
      setError("Enter your account email first.");
      return;
    }

    try {
      await api<{ sent: boolean }>("/email/resend", {
        method: "POST",
        body: JSON.stringify({ email: emailValue }),
      });
      setResetStatus("If that account still needs verification, a new link has been sent.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to resend verification email");
    }
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

  async function createNotebookRecord(value: string, templateKey: NotebookTemplateKey | "" = "") {
    const template = NOTEBOOK_TEMPLATES.find((item) => item.key === templateKey);
    const name = value.trim() || template?.name || "";
    if (!name) return null;

    return api<Notebook>("/notebooks", {
      method: "POST",
      body: JSON.stringify({
        name,
        ...(templateKey ? { template_key: templateKey } : {}),
      }),
    });
  }

  async function createNotebookNamed(value: string, templateKey: NotebookTemplateKey | "" = "") {
    try {
      if (!(await flushActiveNote())) return;
      const notebook = await createNotebookRecord(value, templateKey);
      if (!notebook) return;
      setNotebookName("");
      setSelectedTemplateId("");
      setTemplateDialogOpen(false);
      setTemplateQuery("");
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

  async function createNote(initialContent = "", targetNotebook = activeNotebook) {
    if (!targetNotebook) return;

    try {
      if (!(await flushActiveNote())) return;
      const switchingNotebooks = activeNotebook?.id !== targetNotebook.id;
      const note = await api<Note>(`/notebooks/${targetNotebook.id}/notes`, {
        method: "POST",
        body: JSON.stringify({ content: initialContent }),
      });
      if (switchingNotebooks) targetNoteIdRef.current = note.id;
      setActiveNotebook(targetNotebook);
      setNotes((current) => (switchingNotebooks ? [note] : [note, ...current]));
      setActiveNote(note);
      setMobilePane("editor");
      setStatus(initialContent ? `Template added to ${targetNotebook.name}` : "Note created");
      await loadRecentNotes();
      window.setTimeout(() => (initialContent ? editorRef.current?.focus() : titleInputRef.current?.focus()), 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create note");
    }
  }

  async function useTemplate(template: NotebookTemplate) {
    await createNotebookNamed(template.name, template.key);
  }

  async function selectNotebook(notebook: Notebook) {
    if (activeNotebook?.id === notebook.id) {
      setMobilePane("notes");
      return;
    }

    if (!(await flushActiveNote())) return;
    setActiveNotebook(notebook);
    setMobilePane("notes");
  }

  async function selectNote(note: Note) {
    if (activeNote?.id === note.id) {
      setMobilePane("editor");
      return;
    }

    if (!(await flushActiveNote())) return;
    setActiveNote(note);
    setMobilePane("editor");
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

  async function duplicateActiveNote() {
    if (!activeNote) return;

    try {
      if (!(await flushActiveNote())) return;
      const note = await api<Note>(`/notes/${activeNote.id}/duplicate`, { method: "POST" });
      setNotes((current) => [note, ...current]);
      setActiveNote(note);
      setContent(note.content || "");
      setMobilePane("editor");
      setStatus("Note duplicated");
      await loadRecentNotes();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to duplicate note");
    }
  }

  async function deleteNotebook(id: number) {
    try {
      if (activeNotebook?.id !== id && !(await flushActiveNote())) return;
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

  async function toggleNotebookPin(notebook: Notebook) {
    try {
      const updated = await api<Notebook>(`/notebooks/${notebook.id}/pin`, {
        method: "POST",
        body: JSON.stringify({ pinned: !notebook.pinned_at }),
      });
      setNotebooks((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      setActiveNotebook((current) => (current?.id === updated.id ? updated : current));
      await loadNotebooks();
      setStatus(updated.pinned_at ? "Notebook pinned" : "Notebook unpinned");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update notebook pin");
    }
  }

  async function createInvite(e: FormEvent) {
    e.preventDefault();
    try {
      const data = await api<{ invite: AdminInvite; code: string }>("/admin/invites", {
        method: "POST",
        body: JSON.stringify({ email: inviteEmail.trim() || undefined }),
      });
      setInviteEmail("");
      setInviteStatus(`Invite code created: ${data.code}`);
      await loadAdminData();
    } catch (err) {
      setInviteStatus("");
      setError(err instanceof Error ? err.message : "Unable to create invite");
    }
  }

  async function toggleAdminUser(userRecord: AdminUser) {
    try {
      await api<{ user: User }>(`/admin/users/${userRecord.id}/disable`, {
        method: "POST",
        body: JSON.stringify({ disabled: !userRecord.disabled_at }),
      });
      setAdminStatus(userRecord.disabled_at ? "User re-enabled." : "User disabled and signed out.");
      await loadAdminData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update user");
    }
  }

  async function resendUserVerification(userRecord: AdminUser) {
    try {
      await api<{ sent: boolean }>(`/admin/users/${userRecord.id}/verification`, { method: "POST" });
      setAdminStatus(`Verification email sent to ${userRecord.email}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to resend verification");
    }
  }

  async function sendUserPasswordReset(userRecord: AdminUser) {
    try {
      await api<{ sent: boolean }>(`/admin/users/${userRecord.id}/password-reset`, { method: "POST" });
      setAdminStatus(`Password reset email sent to ${userRecord.email}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to send password reset");
    }
  }

  async function disableInvite(invite: AdminInvite) {
    try {
      await api<{ disabled: boolean }>(`/admin/invites/${invite.id}`, { method: "DELETE" });
      setInviteStatus("Invite disabled.");
      await loadAdminData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to disable invite");
    }
  }

  async function downloadLatestBackup() {
    try {
      const res = await fetch(`${API}/admin/backups/latest`, {
        headers,
      });

      if (!res.ok) {
        const text = await res.text();
        let message = `HTTP ${res.status}`;
        try {
          const data = JSON.parse(text);
          if (data?.message) message = String(data.message);
        } catch {
          if (text) message = text;
        }
        throw new Error(message);
      }

      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") || "";
      const match = /filename="([^"]+)"/.exec(disposition);
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const filename = match?.[1] || `obscribe-backup-${timestamp}.tar.gz`;
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setAdminStatus("Latest backup downloaded.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to download backup");
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
      if (!(await flushActiveNote())) return;
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
      if (!(await flushActiveNote())) return;
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
      if (user?.is_admin) await loadAppStatus();
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
      if (!(await flushActiveNote())) return;
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

      if (activeNote?.id === note.id) {
        return;
      }

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

  async function openSearchNotebook(notebook: Notebook) {
    if (!(await flushActiveNote())) return;
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
    return NOTEBOOK_TEMPLATES.filter((template) => {
      if (!query) return true;
      return `${template.name} ${template.summary} ${template.details} ${template.includes.join(" ")}`.toLowerCase().includes(query);
    });
  }, [templateQuery]);
  const blockCommandQuery = slashMenu?.query.trim().toLowerCase() ?? "";
  const visibleBlockCommands = useMemo(() => {
    return BLOCK_COMMANDS.filter((command) => {
      if (!blockCommandQuery) return true;
      return `${command.label} ${command.description} ${command.searchText ?? ""} ${command.kind}`.toLowerCase().includes(blockCommandQuery);
    });
  }, [blockCommandQuery]);
  const commandMenuOpen = blockMenuOpen || Boolean(slashMenu);
  useEffect(() => {
    setActiveBlockCommandIndex(0);
  }, [blockCommandQuery, blockMenuOpen]);
  const selectedTemplate =
    filteredTemplates.find((template) => template.key === selectedTemplateId) ?? filteredTemplates[0] ?? null;
  const SelectedTemplateIcon = selectedTemplate?.icon;
  const isAdmin = Boolean(user?.is_admin);
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

  function closeBlockMenus() {
    setBlockMenuOpen(false);
    setSlashMenu(null);
  }

  function syncSlashMenu(value: string, cursor: number) {
    const lineStart = value.lastIndexOf("\n", Math.max(0, cursor - 1)) + 1;
    const beforeCursor = value.slice(lineStart, cursor);
    const match = /^\/([\w\s-]*)$/.exec(beforeCursor);

    if (match) {
      setSlashMenu({ start: lineStart, end: cursor, query: match[1] });
      setBlockMenuOpen(false);
      return;
    }

    setSlashMenu(null);
  }

  function handleEditorChange(value: string, cursor: number) {
    updateNoteBody(value);
    syncSlashMenu(value, cursor);
  }

  function replaceEditorRange(
    start: number,
    end: number,
    replacement: string,
    selectionStart: number,
    selectionEnd = selectionStart,
  ) {
    const body = noteParts.body;
    const nextBody = `${body.slice(0, start)}${replacement}${body.slice(end)}`;

    closeBlockMenus();
    setEditorMode("write");
    updateNoteBody(nextBody);
    window.setTimeout(() => {
      editorRef.current?.focus();
      editorRef.current?.setSelectionRange(start + selectionStart, start + selectionEnd);
    }, 0);
  }

  function insertEditorText(replacement: string, selectionStart: number, selectionEnd = selectionStart) {
    const textarea = editorRef.current;
    const body = noteParts.body;
    const start = textarea?.selectionStart ?? body.length;
    const end = textarea?.selectionEnd ?? body.length;
    replaceEditorRange(start, end, replacement, selectionStart, selectionEnd);
  }

  function noteSectionContent(commandId: BlockCommandId) {
    if (!commandId.startsWith("section:")) return null;

    const templateKey = commandId.replace("section:", "") as NoteSectionTemplateKey;
    const template = NOTE_SECTION_TEMPLATES.find((item) => item.key === templateKey);
    if (!template) return null;

    const tokenIndex = template.content.indexOf(CURSOR_TOKEN);
    const text = template.content.replace(CURSOR_TOKEN, "");
    const cursor = tokenIndex >= 0 ? tokenIndex : text.length;
    return { text, start: cursor, end: cursor };
  }

  function blockCommandContent(commandId: BlockCommandId, selected: string) {
    const sectionContent = noteSectionContent(commandId);
    if (sectionContent) return sectionContent;

    if (commandId === "heading") {
      const text = selected || "Heading";
      return { text: `## ${text}`, start: 3, end: 3 + text.length };
    }

    if (commandId === "check") {
      const text = selected || "Task";
      return { text: `- [ ] ${text}`, start: 6, end: 6 + text.length };
    }

    if (commandId === "bullet") {
      const text = selected || "List item";
      return { text: `- ${text}`, start: 2, end: 2 + text.length };
    }

    if (commandId === "quote") {
      const text = selected || "Quote";
      return { text: `> ${text}`, start: 2, end: 2 + text.length };
    }

    if (commandId === "code") {
      const text = selected || "code";
      return { text: `\`\`\`\n${text}\n\`\`\``, start: 4, end: 4 + text.length };
    }

    if (commandId === "divider") {
      return { text: "---", start: 3, end: 3 };
    }

    const text = selected || "Text";
    return { text, start: 0, end: text.length };
  }

  function insertBlockCommand(commandId: BlockCommandId) {
    const textarea = editorRef.current;
    const body = noteParts.body;
    const cursorStart = textarea?.selectionStart ?? body.length;
    const cursorEnd = textarea?.selectionEnd ?? body.length;
    const rangeStart = slashMenu?.start ?? cursorStart;
    const rangeEnd = slashMenu?.end ?? cursorEnd;
    const selected = slashMenu ? "" : body.slice(cursorStart, cursorEnd);
    const command = blockCommandContent(commandId, selected);
    const linePrefix = rangeStart > 0 && body[rangeStart - 1] !== "\n" ? "\n" : "";
    const lineSuffix = rangeEnd < body.length && body[rangeEnd] !== "\n" ? "\n" : "";

    replaceEditorRange(
      rangeStart,
      rangeEnd,
      `${linePrefix}${command.text}${lineSuffix}`,
      linePrefix.length + command.start,
      linePrefix.length + command.end,
    );
  }

  function handleEditorKeyDown(event: ReactKeyboardEvent<HTMLTextAreaElement>) {
    const commandMenuOpen = blockMenuOpen || Boolean(slashMenu);
    if (!commandMenuOpen) return;

    if (event.key === "Escape") {
      event.preventDefault();
      closeBlockMenus();
      return;
    }

    if (!visibleBlockCommands.length) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveBlockCommandIndex((current) => (current + 1) % visibleBlockCommands.length);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveBlockCommandIndex((current) => (current - 1 + visibleBlockCommands.length) % visibleBlockCommands.length);
      return;
    }

    if (event.key === "Enter" || event.key === "Tab") {
      event.preventDefault();
      insertBlockCommand(visibleBlockCommands[activeBlockCommandIndex]?.id ?? visibleBlockCommands[0].id);
    }
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
    const registrationMode = appConfig?.registration_mode ?? "open";
    const registrationClosed = registrationMode === "closed";
    const registrationInviteOnly = registrationMode === "invite";

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
                onClick={() => !registrationClosed && switchAuthMode("register")}
                type="button"
                disabled={registrationClosed}
              >
                Create account
              </button>
            </div>
          )}

          {error && <p className="error">{error}</p>}
          {resetStatus && <p className="successText authStatus">{resetStatus}</p>}
          {mode === "login" && verificationPromptEmail && (
            <div className="verificationPrompt" role="status">
              <span>
                Need another link for <strong>{verificationPromptEmail}</strong>?
              </span>
              <button className="secondary" onClick={resendVerificationEmail} type="button">
                <Mail size={15} strokeWidth={2} />
                Resend verification
              </button>
            </div>
          )}
          {mode === "register" && registrationInviteOnly && (
            <p className="authNotice">
              New hosted accounts are invite-only right now. Enter your invite code to continue.
            </p>
          )}
          {mode === "register" && registrationClosed && (
            <p className="authNotice">
              Public registration is currently closed. Existing users can still sign in.
            </p>
          )}
          {mode === "register" && appConfig?.email_verification_required && (
            <p className="authNotice">
              After signup, Obscribe will send a verification link before the account can sign in.
            </p>
          )}

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
              {mode === "register" && registrationInviteOnly && (
                <label className="fieldGroup">
                  <span className="fieldLabel">Invite code</span>
                  <input
                    className="input"
                    value={inviteCode}
                    onChange={(e) => setInviteCode(e.target.value)}
                    placeholder="Invite code"
                    autoComplete="one-time-code"
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
              <button className="primary" disabled={mode === "register" && registrationClosed}>
                {mode === "login" ? "Sign in" : "Create account"}
              </button>
              {mode === "login" && appConfig?.email_verification_required && !verificationPromptEmail && (
                <button className="linkButton" onClick={resendVerificationEmail} type="button">
                  Resend verification email
                </button>
              )}
            </form>
          )}
          <div className="authLinks" aria-label="Legal and support links">
            <a href="/privacy">Privacy</a>
            <a href="/terms">Terms</a>
            <a href="/support">Support</a>
            <a href="/contact">Contact</a>
          </div>
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
                  <span className="searchResultText">
                    <strong>{notebook.name}</strong>
                    <small>{notebook.pinned_at ? "Pinned notebook" : "Notebook"}</small>
                  </span>
                  <small>{notebook.pinned_at ? "Pinned" : "Open"}</small>
                </button>
              ))}
              {searchResults?.notes.map((note) => (
                <button key={`note-${note.id}`} onClick={() => openSearchNote(note)} type="button">
                  <FileText size={15} strokeWidth={2} />
                  <span className="searchResultText">
                    <strong>{noteTitle(note)}</strong>
                    <small>{noteSearchPreview(note)}</small>
                  </span>
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
          onClick={toggleTheme}
          className="iconButton themeButton"
          type="button"
          aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          title={theme === "dark" ? "Light mode" : "Dark mode"}
        >
          {theme === "dark" ? <Sun size={17} strokeWidth={2} /> : <Moon size={17} strokeWidth={2} />}
        </button>
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

            {isAdmin && (
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
            )}

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

            {isAdmin && (
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
                {adminHealth && (
                  <div className="healthGrid">
                    <span>
                      <strong>Domain</strong>
                      {adminHealth.app.domain}
                    </span>
                    <span>
                      <strong>SSL</strong>
                      {adminHealth.ssl.expected ? "HTTPS expected" : "Local HTTP"}
                    </span>
                    <span>
                      <strong>Version</strong>
                      {adminHealth.app.version}
                    </span>
                    <span>
                      <strong>Last backup</strong>
                      {adminHealth.backup.available
                        ? `${formatDateTime(adminHealth.backup.created_at)} · ${formatBytes(adminHealth.backup.size)}`
                        : "No backup found"}
                    </span>
                  </div>
                )}
                <div className="settingsActions">
                  <button
                    onClick={downloadLatestBackup}
                    className="secondary"
                    type="button"
                    disabled={!adminHealth?.backup.available}
                  >
                    <Archive size={16} strokeWidth={2} />
                    Download latest backup
                  </button>
                </div>
              </section>
            )}

            {isAdmin && (
              <section className="settingsPanel" aria-labelledby="launch-title">
                <div className="settingsPanelHeader">
                  <ShieldCheck size={18} strokeWidth={2} />
                  <div>
                    <p className="kicker">Launch controls</p>
                    <h3 id="launch-title">Access and plans</h3>
                  </div>
                </div>
                <div className="launchStatGrid">
                  <span>
                    <strong>{adminHealth?.launch.registration_mode ?? appConfig?.registration_mode ?? "open"}</strong>
                    Registration mode
                  </span>
                  <span>
                    <strong>{adminHealth?.launch.email_verification_required ? "Required" : "Optional"}</strong>
                    Email verification
                  </span>
                </div>
                <div className="planList">
                  {(appConfig?.plans ?? []).map((plan) => (
                    <div key={plan.key} className="planRow">
                      <span>
                        <strong>{plan.name}</strong>
                        <small>{plan.notes}</small>
                      </span>
                      <em>{plan.price}</em>
                    </div>
                  ))}
                </div>
                <div className="supportLinks">
                  <a href="/privacy" target="_blank" rel="noreferrer">
                    <ExternalLink size={14} strokeWidth={2} />
                    Privacy
                  </a>
                  <a href="/terms" target="_blank" rel="noreferrer">
                    <ExternalLink size={14} strokeWidth={2} />
                    Terms
                  </a>
                  <a href="/support" target="_blank" rel="noreferrer">
                    <ExternalLink size={14} strokeWidth={2} />
                    Support
                  </a>
                </div>
              </section>
            )}

            {isAdmin && (
              <section className="settingsPanel" aria-labelledby="invite-title">
                <div className="settingsPanelHeader">
                  <Ticket size={18} strokeWidth={2} />
                  <div>
                    <p className="kicker">Hosted access</p>
                    <h3 id="invite-title">Invite codes</h3>
                  </div>
                </div>
                <form className="settingsForm" onSubmit={createInvite}>
                  <label className="fieldGroup">
                    <span className="fieldLabel">Restrict to email (optional)</span>
                    <input
                      className="input"
                      value={inviteEmail}
                      onChange={(event) => setInviteEmail(event.target.value)}
                      placeholder="new-user@example.com"
                      type="email"
                    />
                  </label>
                  <button className="secondary" type="submit">
                    <Ticket size={16} strokeWidth={2} />
                    Create invite
                  </button>
                </form>
                {inviteStatus && <p className="successText">{inviteStatus}</p>}
                <div className="adminList">
                  {adminInvites.map((invite) => (
                    <div key={invite.id} className={invite.disabled_at ? "adminListRowMuted" : "adminListRow"}>
                      <span>
                        <strong>{invite.email || "Any email"}</strong>
                        <small>
                          {invite.used_count}/{invite.max_uses} used · expires {formatDateTime(invite.expires_at)}
                        </small>
                      </span>
                      <button
                        className="rowIconButton rowIconButtonDanger"
                        onClick={() => disableInvite(invite)}
                        type="button"
                        disabled={Boolean(invite.disabled_at)}
                        aria-label="Disable invite"
                        title="Disable invite"
                      >
                        <Trash2 size={14} strokeWidth={2} />
                      </button>
                    </div>
                  ))}
                  {!adminInvites.length && <p className="emptySmall">No invites have been created yet.</p>}
                </div>
              </section>
            )}

            {isAdmin && (
              <section className="settingsPanel settingsPanelWide" aria-labelledby="users-title">
                <div className="settingsPanelHeader">
                  <Users size={18} strokeWidth={2} />
                  <div>
                    <p className="kicker">Admin</p>
                    <h3 id="users-title">User management</h3>
                  </div>
                </div>
                {adminStatus && <p className="successText">{adminStatus}</p>}
                <div className="adminUserList">
                  {adminUsers.map((adminUser) => {
                    const verified = Boolean(adminUser.email_verified_at || adminUser.is_admin);
                    const disabled = Boolean(adminUser.disabled_at);
                    return (
                      <div key={adminUser.id} className={disabled ? "adminUserRowMuted" : "adminUserRow"}>
                        <div>
                          <strong>{adminUser.name}</strong>
                          <small>{adminUser.email}</small>
                        </div>
                        <span className={verified ? "statusBadgeReady" : "statusBadgeMuted"}>
                          {verified ? "Verified" : "Unverified"}
                        </span>
                        <span className={disabled ? "statusBadgeDanger" : "statusBadgeReady"}>
                          {disabled ? "Disabled" : "Active"}
                        </span>
                        <small>{adminUser.workspace_count} workspace</small>
                        <div className="adminUserActions">
                          <button
                            className="rowIconButton"
                            onClick={() => resendUserVerification(adminUser)}
                            type="button"
                            disabled={verified || disabled}
                            aria-label={`Resend verification to ${adminUser.email}`}
                            title="Resend verification"
                          >
                            <Mail size={14} strokeWidth={2} />
                          </button>
                          <button
                            className="rowIconButton"
                            onClick={() => sendUserPasswordReset(adminUser)}
                            type="button"
                            disabled={disabled}
                            aria-label={`Send password reset to ${adminUser.email}`}
                            title="Send password reset"
                          >
                            <KeyRound size={14} strokeWidth={2} />
                          </button>
                          <button
                            className={disabled ? "rowIconButton" : "rowIconButton rowIconButtonDanger"}
                            onClick={() => toggleAdminUser(adminUser)}
                            type="button"
                            disabled={adminUser.id === user?.id}
                            aria-label={disabled ? `Enable ${adminUser.email}` : `Disable ${adminUser.email}`}
                            title={disabled ? "Enable user" : "Disable user"}
                          >
                            {disabled ? <UserCheck size={14} strokeWidth={2} /> : <UserX size={14} strokeWidth={2} />}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {isAdmin && (
              <section className="settingsPanel" aria-labelledby="analytics-title">
                <div className="settingsPanelHeader">
                  <Activity size={18} strokeWidth={2} />
                  <div>
                    <p className="kicker">Activation</p>
                    <h3 id="analytics-title">Last 30 days</h3>
                  </div>
                </div>
                <div className="eventList">
                  {adminEvents.map((event) => (
                    <span key={event.event_name}>
                      <strong>{event.total}</strong>
                      {event.event_name.replaceAll("_", " ")}
                    </span>
                  ))}
                  {!adminEvents.length && <p className="emptySmall">No activation events recorded yet.</p>}
                </div>
              </section>
            )}
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
                  title="Create notebook"
                  disabled={!notebookName.trim()}
                >
                  <Plus size={19} strokeWidth={2.4} />
                </button>
              </form>
              <button className="templateLauncher" onClick={openTemplateDialog} type="button">
                <ClipboardList size={17} strokeWidth={2.3} />
                <span>
                  Templates
                  <small>Start with a notebook system</small>
                </span>
              </button>
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
                        onClick={() => selectNotebook(notebook)}
                        className="notebookSelect"
                        type="button"
                      >
                        <span>{notebook.name}</span>
                      </button>
                    )}
                    {renamingNotebookId !== notebook.id && (
                      <button
                        onClick={() => toggleNotebookPin(notebook)}
                        className={notebook.pinned_at ? "rowIconButton rowIconButtonActive" : "rowIconButton"}
                        type="button"
                        aria-label={notebook.pinned_at ? `Unpin ${notebook.name}` : `Pin ${notebook.name}`}
                        title={notebook.pinned_at ? "Unpin notebook" : "Pin notebook"}
                      >
                        <Pin size={14} strokeWidth={2} />
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
                        className="rowIconButton rowIconButtonDanger"
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
                  <div className="emptyStack">
                    <button className="emptyAction" onClick={openTemplateDialog} type="button">
                      Browse templates
                    </button>
                    <button className="emptyAction" onClick={() => createNotebookNamed("Personal")} type="button">
                      Create a blank notebook
                    </button>
                  </div>
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
                  title="New note (Ctrl N)"
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

              {recentNotes.length > 0 && (
                <div className="recentBlock" aria-label="Recently edited notes">
                  <div className="railSectionHeader">
                    <Clock3 size={14} strokeWidth={2.2} />
                    <span>Recent</span>
                  </div>
                  <div className="recentList">
                    {recentNotes.slice(0, 4).map((note) => (
                      <button key={`recent-${note.id}`} onClick={() => openSearchNote(note)} type="button">
                        <span>{noteTitle(note)}</span>
                        <small>{note.notebook_name} · {compactDate(note.updated_at)}</small>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="list">
                {filteredNotes.map((note) => {
                  return (
                    <button
                      key={note.id}
                      onClick={() => selectNote(note)}
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
                  <div className="emptyStack">
                    <button className="emptyAction" onClick={() => createNote()} disabled={!activeNotebook} type="button">
                      Create your first note
                    </button>
                    <button
                      className="emptyAction"
                      onClick={() => createNote(`Meeting Notes\n${starterSectionContent("meeting-notes")}`)}
                      disabled={!activeNotebook}
                      type="button"
                    >
                      Start meeting notes
                    </button>
                  </div>
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
                      <button onClick={duplicateActiveNote} className="secondary" type="button" title="Duplicate note">
                        <Copy size={15} strokeWidth={2} />
                        Duplicate
                      </button>
                      <button onClick={() => setPendingDelete(true)} className="dangerButton" type="button">
                        <Trash2 size={15} strokeWidth={2} />
                        Delete
                      </button>
                      <button onClick={() => saveNote(content)} className="secondary" disabled={!isDirty} type="button" title="Save now (Ctrl S)">
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
                    <button
                      className={blockMenuOpen ? "toolbarActive" : ""}
                      onClick={() => {
                        setEditorMode("write");
                        setSlashMenu(null);
                        setBlockMenuOpen((current) => !current);
                        window.setTimeout(() => editorRef.current?.focus(), 0);
                      }}
                      type="button"
                      aria-label="Insert block or section"
                      title="Insert block or section"
                    >
                      <Plus size={16} strokeWidth={2.3} />
                    </button>
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
                  {commandMenuOpen && (
                    <div className="blockCommandMenu" role="listbox" aria-label="Insert blocks">
                      {visibleBlockCommands.map((command, index) => {
                        const CommandIcon = command.icon;
                        const isActive = index === activeBlockCommandIndex;
                        return (
                          <button
                            key={command.id}
                            className={isActive ? "blockCommandActive" : "blockCommand"}
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => insertBlockCommand(command.id)}
                            role="option"
                            aria-selected={isActive}
                            type="button"
                          >
                            <CommandIcon size={16} strokeWidth={2.3} />
                            <span>
                              <strong>{command.label}</strong>
                              <small>{command.description}</small>
                            </span>
                          </button>
                        );
                      })}
                      {!visibleBlockCommands.length && <p className="emptySmall">No blocks match.</p>}
                    </div>
                  )}
                  {editorMode === "write" ? (
                    <textarea
                      ref={editorRef}
                      className="editor"
                      value={noteParts.body}
                      onChange={(e) => handleEditorChange(e.target.value, e.target.selectionStart)}
                      onKeyDown={handleEditorKeyDown}
                      onSelect={(e) => syncSlashMenu(e.currentTarget.value, e.currentTarget.selectionStart)}
                      placeholder="Start writing..."
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
                          if (block.type === "divider") return <hr key={index} />;
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
          {templateDialogOpen && (
            <div className="templateOverlay" onMouseDown={closeTemplateDialog} role="presentation">
              <section
                className="templateDialog"
                aria-labelledby="templateDialogTitle"
                aria-modal="true"
                onMouseDown={(event) => event.stopPropagation()}
                role="dialog"
              >
                <div className="templateDialogHeader">
                  <div>
                    <p className="kicker">Templates</p>
                    <h2 id="templateDialogTitle">Start with a notebook system</h2>
                    <p>Each template creates a notebook with starter notes already inside.</p>
                  </div>
                  <button className="iconButton" onClick={closeTemplateDialog} aria-label="Close templates" type="button">
                    <X size={17} strokeWidth={2.4} />
                  </button>
                </div>

                <label className="templateDialogSearch">
                  <Search size={16} strokeWidth={2} />
                  <input
                    ref={templateSearchRef}
                    value={templateQuery}
                    onChange={(e) => setTemplateQuery(e.target.value)}
                    placeholder="Search notebook templates"
                  />
                  {templateQuery && (
                    <button onClick={() => setTemplateQuery("")} type="button">
                      Clear
                    </button>
                  )}
                </label>

                <div className="templateDialogBody">
                  <div className="templateChoiceList" aria-label="Notebook templates">
                    {filteredTemplates.map((template) => {
                      const TemplateIcon = template.icon;
                      const isSelected = selectedTemplate?.key === template.key;
                      return (
                        <button
                          key={template.key}
                          className={isSelected ? "templateChoiceActive" : "templateChoice"}
                          onClick={() => setSelectedTemplateId(template.key)}
                          onDoubleClick={() => useTemplate(template)}
                          type="button"
                        >
                          <TemplateIcon size={17} strokeWidth={2.3} />
                          <span>
                            <strong>{template.name}</strong>
                            <small>{template.summary}</small>
                          </span>
                          <em>{template.includes.length} notes</em>
                        </button>
                      );
                    })}
                    {!filteredTemplates.length && <p className="emptySmall">No templates match that search.</p>}
                  </div>

                  {selectedTemplate && (
                    <div className="templateDetail">
                      <div className="templateDetailIcon">
                        {SelectedTemplateIcon && <SelectedTemplateIcon size={24} strokeWidth={2.2} />}
                      </div>
                      <p className="kicker">Notebook system</p>
                      <h3>{selectedTemplate.name}</h3>
                      <p>{selectedTemplate.details}</p>
                      <div className="templateIncludes">
                        <span>Starter notes</span>
                        <ul>
                          {selectedTemplate.includes.map((item) => (
                            <li key={item}>
                              <Check size={14} strokeWidth={2.4} />
                              {item}
                            </li>
                          ))}
                        </ul>
                      </div>
                      <button className="primary templateUseButton" onClick={() => useTemplate(selectedTemplate)} type="button">
                        Use template
                      </button>
                    </div>
                  )}
                </div>
              </section>
            </div>
          )}
        </>
      )}
    </main>
  );
}
