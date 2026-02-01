// web/lib/sessionStore.ts

import type { FollowUpType, HighlightTag, MeetingResult, SessionMode } from "./types";

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

export type FollowUpHighlight = {
  id: string; // stable id for the highlight row
  text: string; // what was highlighted (usually an action item line)
  tag: HighlightTag; // category tag (drives follow-up focus)
};

export type FollowUpData = {
  id: string; // NEW: follow-ups are distinct objects now
  title: string; // NEW: a label for the follow-up (ex: "Follow-Up: Pricing + Timeline")
  createdAt: number;
  updatedAt: number;

  followUpType: FollowUpType;
  focusPrompt: string;
  emailPrompt: string;

  highlights: FollowUpHighlight[];
};

/**
 * Past meeting metadata lives on the past meeting session (NOT inside follow-up).
 */
export type PastMeta = {
  meetingResult: MeetingResult;
  meetingOutcome: string;

  /**
   * Optional: future expansion (ex: reschedule date, next meeting date, etc.)
   * Keep strings for now so you can pipe into calendar integrations later.
   */
  nextMeetingDate?: string;
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

  /**
   * NEW: Past meeting metadata (result + outcome) stored on the past meeting session.
   */
  pastMeta?: PastMeta;

  /**
   * NEW: multiple follow-ups per past meeting
   */
  followUps?: FollowUpData[];

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

function defaultPastMeta(): PastMeta {
  return {
    meetingResult: "Pending",
    meetingOutcome: "",
    nextMeetingDate: "",
  };
}

function normalizePastMeta(p: any): PastMeta {
  return {
    meetingResult: (p?.meetingResult ?? "Pending") as MeetingResult,
    meetingOutcome: p?.meetingOutcome ?? "",
    nextMeetingDate: p?.nextMeetingDate ?? "",
  };
}

function normalizeHighlights(raw: any): FollowUpHighlight[] {
  const highlightsRaw = Array.isArray(raw) ? raw : [];
  return highlightsRaw.map((h: any) => ({
    id: h?.id ?? generateId(),
    text: h?.text ?? "",
    tag: (h?.tag ?? "None") as HighlightTag,
  }));
}

function defaultFollowUpData(): FollowUpData {
  const now = Date.now();
  return {
    id: generateId(),
    title: "Untitled Follow-Up",
    createdAt: now,
    updatedAt: now,
    followUpType: "Email",
    focusPrompt: "",
    emailPrompt: "",
    highlights: [],
  };
}

function normalizeFollowUpData(f: any): FollowUpData {
  const now = Date.now();
  return {
    id: f?.id ?? generateId(),
    title: f?.title ?? "Untitled Follow-Up",
    createdAt: f?.createdAt ?? now,
    updatedAt: f?.updatedAt ?? now,
    followUpType: (f?.followUpType ?? "Email") as FollowUpType,
    focusPrompt: f?.focusPrompt ?? "",
    emailPrompt: f?.emailPrompt ?? "",
    highlights: normalizeHighlights(f?.highlights),
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

  // Back-compat: legacy "future" becomes "followUp"
  const modeRaw = String(s?.mode ?? "current");
  const mode: SessionMode =
    modeRaw === "past" || modeRaw === "current" || modeRaw === "followUp"
      ? (modeRaw as SessionMode)
      : modeRaw === "future"
        ? "followUp"
        : "current";

  // NEW: followUps array (back-compat from legacy followUp object)
  const followUpsRaw = Array.isArray(s?.followUps) ? s.followUps : [];
  const legacySingleFollowUp = s?.followUp ? s.followUp : null;

  const followUpsNormalized: FollowUpData[] = [
    ...followUpsRaw.map(normalizeFollowUpData),
    ...(legacySingleFollowUp ? [normalizeFollowUpData(legacySingleFollowUp)] : []),
  ];

  // NEW: pastMeta (back-compat: lift meetingResult/outcome from legacy followUp if present)
  const hasPastMeta = Boolean(s?.pastMeta);
  const legacyMeetingResult = legacySingleFollowUp?.meetingResult;
  const legacyMeetingOutcome = legacySingleFollowUp?.meetingOutcome;

  const pastMetaFromLegacy =
    !hasPastMeta && (legacyMeetingResult || legacyMeetingOutcome)
      ? normalizePastMeta({
          meetingResult: legacyMeetingResult ?? "Pending",
          meetingOutcome: legacyMeetingOutcome ?? "",
        })
      : undefined;

  return {
    id: s?.id ?? generateId(),
    title: s?.title ?? "Untitled Meeting",
    folderId: s?.folderId ?? null,
    mode,
    objective: s?.objective ?? "",
    rawNotes: s?.rawNotes ?? "",
    postMeetingNotes: s?.postMeetingNotes ?? "",
    outputs: normalizeOutputs(s?.outputs ?? defaultOutputs()),

    pastMeta: s?.pastMeta
      ? normalizePastMeta(s.pastMeta)
      : pastMetaFromLegacy
        ? pastMetaFromLegacy
        : undefined,

    followUps: followUpsNormalized.length ? followUpsNormalized : undefined,

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

    pastMeta: undefined,
    followUps: undefined,

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

/**
 * Helper: Create a new Follow-Up object and attach it to a session.
 * (You can call this from page.tsx when the user clicks "New Follow-Up".)
 */
export function addFollowUpToSession(session: Session, patch?: Partial<FollowUpData>): Session {
  const now = Date.now();
  const base = defaultFollowUpData();

  const next: FollowUpData = {
    ...base,
    ...patch,
    // ensure timestamps exist and update updatedAt
    createdAt: patch?.createdAt ?? base.createdAt,
    updatedAt: now,
    highlights: patch?.highlights ? normalizeHighlights(patch.highlights) : base.highlights,
  };

  const list = Array.isArray(session.followUps) ? session.followUps : [];
  return {
    ...session,
    followUps: [...list, next],
    updatedAt: now,
  };
}

/**
 * Helper: Update an existing follow-up by id.
 */
export function updateFollowUpInSession(session: Session, followUpId: string, patch: Partial<FollowUpData>): Session {
  const now = Date.now();
  const list = Array.isArray(session.followUps) ? session.followUps : [];
  const nextList = list.map((fu) => {
    if (fu.id !== followUpId) return fu;
    return {
      ...fu,
      ...patch,
      updatedAt: now,
      highlights: patch?.highlights ? normalizeHighlights(patch.highlights) : fu.highlights,
    };
  });

  return {
    ...session,
    followUps: nextList,
    updatedAt: now,
  };
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