export type SessionMode = "future" | "current" | "past";

export type Outputs = {
  actionItems: string;
  summary: string;
  email: string;
};

export type Session = {
  id: string;
  title: string;
  folderId: string | null;
  mode: SessionMode;
  objective: string;
  rawNotes: string;
  outputs: Outputs;
  createdAt: number;
  updatedAt: number;
};

export type Folder = {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
};

const SESSIONS_KEY = "recapkit.sessions";
const FOLDERS_KEY = "recapkit.folders";

/* -------------------- utils -------------------- */

function generateId() {
  return Math.random().toString(36).slice(2, 10);
}

/* -------------------- sessions -------------------- */

export function loadSessions(): Session[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(SESSIONS_KEY);
    return raw ? (JSON.parse(raw) as Session[]) : [];
  } catch {
    return [];
  }
}

export function saveSessions(sessions: Session[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
}

export function createSession(): Session {
  const now = Date.now();
  return {
    id: generateId(),
    title: "Untitled Meeting",
    folderId: null,
    mode: "past",
    objective: "",
    rawNotes: "",
    outputs: { actionItems: "", summary: "", email: "" },
    createdAt: now,
    updatedAt: now,
  };
}

export function updateSession(
  sessions: Session[],
  updated: Session
): Session[] {
  return sessions.map((s) =>
    s.id === updated.id ? { ...updated, updatedAt: Date.now() } : s
  );
}

/* -------------------- folders -------------------- */

export function loadFolders(): Folder[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(FOLDERS_KEY);
    return raw ? (JSON.parse(raw) as Folder[]) : [];
  } catch {
    return [];
  }
}

export function saveFolders(folders: Folder[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(FOLDERS_KEY, JSON.stringify(folders));
}

export function createFolder(name: string): Folder {
  const now = Date.now();
  return {
    id: generateId(),
    name,
    createdAt: now,
    updatedAt: now,
  };
}

/* -------------------- sorting helpers -------------------- */

export type SortMode = "updated" | "alpha";

export function sortSessions(
  sessions: Session[],
  sortMode: SortMode
): Session[] {
  const copy = [...sessions];

  if (sortMode === "alpha") {
    return copy.sort((a, b) => a.title.localeCompare(b.title));
  }

  // default: most recently updated first
  return copy.sort((a, b) => b.updatedAt - a.updatedAt);
}
