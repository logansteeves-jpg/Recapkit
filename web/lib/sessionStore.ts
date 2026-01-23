export type SessionMode = "future" | "current" | "past";

export type Outputs = {
  actionItems: string;
  summary: string;
  email: string;
};

export type CheckpointReason = "clear" | "generate" | "end" | "manual";

export type SessionCheckpoint = {
  rawNotes: string;
  objective: string;
  outputs: Outputs;
  timestamp: number;
  reason: CheckpointReason;
};

export type Session = {
  id: string;
  title: string;
  folderId: string | null;
  mode: SessionMode;
  objective: string;
  rawNotes: string;

  // Notes added after the meeting (used in Past mode)
  postMeetingNotes?: string;

  // Derived artifacts only
  outputs: Outputs;

  // Local session history checkpoints (Clear / Generate / End / etc.)
  checkpoints?: SessionCheckpoint[];

  // For Undo/Redo support (Redo stack is separate from checkpoints)
  redoStack?: SessionCheckpoint[];

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

function defaultOutputs(): Outputs {
  return { actionItems: "", summary: "", email: "" };
}

function normalizeOutputs(o: any): Outputs {
  return {
    actionItems: o?.actionItems ?? "",
    summary: o?.summary ?? "",
    email: o?.email ?? "",
  };
}

/**
 * Back-compat: normalize legacy checkpoints (including legacy "pause") into the new shape.
 * - If old data contains reason:"pause", we remap it to "manual" so the app never breaks.
 */
function normalizeCheckpoint(cp: any): SessionCheckpoint {
  const reasonRaw = String(cp?.reason ?? "manual");

  const reason: CheckpointReason =
  reasonRaw === "clear" ||
  reasonRaw === "generate" ||
  reasonRaw === "end" ||
  reasonRaw === "manual"
    ? (reasonRaw as CheckpointReason)
    : "manual"; // includes legacy "pause", unknown strings, etc.

  return {
    rawNotes: cp?.rawNotes ?? "",
    objective: cp?.objective ?? "",
    outputs: normalizeOutputs(cp?.outputs ?? defaultOutputs()),
    timestamp: cp?.timestamp ?? cp?.createdAt ?? Date.now(),
    reason,
  };
}

/**
 * Back-compat: normalize saved sessions from localStorage into the current shape.
 * This prevents crashes when you change types over time.
 */
function normalizeSession(s: any): Session {
  const now = Date.now();

  const checkpointsRaw = Array.isArray(s?.checkpoints) ? s.checkpoints : [];
  const redoRaw = Array.isArray(s?.redoStack) ? s.redoStack : [];

  return {
    id: s?.id ?? generateId(),
    title: s?.title ?? "Untitled Meeting",
    folderId: s?.folderId ?? null,
    mode: (s?.mode ?? "current") as SessionMode,
    objective: s?.objective ?? "",
    rawNotes: s?.rawNotes ?? "",
    postMeetingNotes: s?.postMeetingNotes ?? "",

    outputs: normalizeOutputs(s?.outputs ?? defaultOutputs()),

    checkpoints: checkpointsRaw.map(normalizeCheckpoint),
    redoStack: redoRaw.map(normalizeCheckpoint),

    createdAt: s?.createdAt ?? now,
    updatedAt: s?.updatedAt ?? now,
  };
}

/* -------------------- sessions -------------------- */

export function loadSessions(): Session[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(SESSIONS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeSession);
  } catch {
    return [];
  }
}

export function saveSessions(sessions: Session[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
}

/**
 * Default new sessions to CURRENT.
 * This matches product direction: you start in Current, then end meeting to Past.
 */
export function createSession(): Session {
  const now = Date.now();
  return {
    id: generateId(),
    title: "Untitled Meeting",
    folderId: null,
    mode: "current",
    objective: "",
    rawNotes: "",
    postMeetingNotes: "",
    outputs: defaultOutputs(),
    checkpoints: [],
    redoStack: [],
    createdAt: now,
    updatedAt: now,
  };
}

export function updateSession(sessions: Session[], updated: Session): Session[] {
  return sessions.map((s) => (s.id === updated.id ? { ...updated, updatedAt: Date.now() } : s));
}

export function deleteSession(sessions: Session[], sessionId: string): Session[] {
  return sessions.filter((s) => s.id !== sessionId);
}

export function moveSessionToFolder(
  sessions: Session[],
  sessionId: string,
  folderId: string | null
): Session[] {
  return sessions.map((s) => (s.id === sessionId ? { ...s, folderId, updatedAt: Date.now() } : s));
}

/* -------------------- folders -------------------- */

export function loadFolders(): Folder[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(FOLDERS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed as Folder[];
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

export function sortSessions(sessions: Session[], sortMode: SortMode): Session[] {
  const copy = [...sessions];

  if (sortMode === "alpha") {
    return copy.sort((a, b) => a.title.localeCompare(b.title));
  }

  // default: most recently updated first
  return copy.sort((a, b) => b.updatedAt - a.updatedAt);
}