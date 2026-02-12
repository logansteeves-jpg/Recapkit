"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  createFolder,
  createSession,
  loadFolders,
  loadSessions,
  saveFolders,
  saveSessions,
  sortSessions,
  updateSession,
  type Folder,
  type Session,
  type SortMode,
  type SessionCheckpoint,
  type CheckpointReason,
} from "../lib/sessionStore";
import type { MeetingResult } from "@/lib/types";

type Screen = { name: "home" } | { name: "session"; sessionId: string };
type GenerateMode = "current" | "past";

/* -------------------- small helpers -------------------- */

function formatDate(ts: number) {
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return "";
  }
}

function modeLabel(mode: any) {
  if (mode === "past") return "Past Meeting";
  if (mode === "current") return "Meeting Still Open";
  if (mode === "followUp") return "Past Meeting"; // back-compat
  return String(mode ?? "");
}

function checkpointCoreEqual(a: SessionCheckpoint, b: SessionCheckpoint) {
  return (
    a.rawNotes === b.rawNotes &&
    a.objective === b.objective &&
    a.outputs.actionItems === b.outputs.actionItems &&
    a.outputs.summary === b.outputs.summary &&
    a.outputs.email === b.outputs.email
  );
}

function InSessionBadge() {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "4px 8px",
        borderRadius: 999,
        border: "1px solid #f1d08a",
        background: "#fff8e6",
        color: "#6a4b00",
        fontSize: 12,
        fontWeight: 800,
        lineHeight: 1,
        whiteSpace: "nowrap",
      }}
      title="Meeting Still Open"
    >
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: 999,
          background: "#f1b72a",
          display: "inline-block",
        }}
      />
      Meeting Still Open
    </span>
  );
}

export default function Page() {
  const router = useRouter();

  const [screen, setScreen] = useState<Screen>({ name: "home" });

  const [folders, setFolders] = useState<Folder[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [sortMode, setSortMode] = useState<SortMode>("updated");

  const [newFolderName, setNewFolderName] = useState("");

  // Past raw notes edit warning UX
  const [showPastEditConfirm, setShowPastEditConfirm] = useState(false);
  const [isEditingPastRawNotes, setIsEditingPastRawNotes] = useState(false);
  const [pastEditDraft, setPastEditDraft] = useState("");
  const [pastEditOriginal, setPastEditOriginal] = useState("");

  useEffect(() => {
    setFolders(loadFolders());

    // Back-compat: any legacy followUp sessions get normalized to past
    const loaded = loadSessions().map((s: any) =>
      s?.mode === "followUp" ? ({ ...s, mode: "past" } as any) : s
    );
    setSessions(loaded);
  }, []);

  useEffect(() => {
    saveFolders(folders);
  }, [folders]);

  useEffect(() => {
    saveSessions(sessions);
  }, [sessions]);

  const standaloneSessions = useMemo(() => {
    const standalones = sessions.filter((s) => s.folderId === null);
    return sortSessions(standalones, sortMode);
  }, [sessions, sortMode]);

  const sessionsByFolder = useMemo(() => {
    const map: Record<string, Session[]> = {};
    for (const f of folders) map[f.id] = [];

    for (const s of sessions) {
      if (s.folderId) {
        if (!map[s.folderId]) map[s.folderId] = [];
        map[s.folderId].push(s);
      }
    }

    for (const key of Object.keys(map)) {
      map[key] = sortSessions(map[key], sortMode);
    }

    return map;
  }, [folders, sessions, sortMode]);

  const currentSession: Session | null = useMemo(() => {
    if (screen.name !== "session") return null;
    return sessions.find((s) => s.id === screen.sessionId) ?? null;
  }, [screen, sessions]);

  function resetPastEditUi() {
    setShowPastEditConfirm(false);
    setIsEditingPastRawNotes(false);
    setPastEditDraft("");
    setPastEditOriginal("");
  }

  function openSession(sessionId: string) {
    resetPastEditUi();
    setScreen({ name: "session", sessionId });
  }

  function goHome() {
    resetPastEditUi();
    setScreen({ name: "home" });
  }

  function openPastMeetingPage() {
    if (!currentSession) return;
    router.push(`/session/${currentSession.id}/past`);
  }

  function handleCreateStandalone() {
    const s = createSession();
    setSessions((prev) => [s, ...prev]);
    openSession(s.id);
  }

  function handleCreateFolder() {
    const name = newFolderName.trim();
    if (!name) return;
    const f = createFolder(name);
    setFolders((prev) => [f, ...prev]);
    setNewFolderName("");
  }

  function handleCreateSessionInFolder(folderId: string) {
    const s = createSession();
    const updated: Session = { ...s, folderId };
    setSessions((prev) => [updated, ...prev]);
    openSession(updated.id);
  }

  function getCheckpoints(s: Session): SessionCheckpoint[] {
    return Array.isArray((s as any).checkpoints)
      ? ((s as any).checkpoints as SessionCheckpoint[])
      : [];
  }

  function getRedoStack(s: Session): SessionCheckpoint[] {
    return Array.isArray((s as any).redoStack)
      ? ((s as any).redoStack as SessionCheckpoint[])
      : [];
  }

  function makeCheckpoint(reason: CheckpointReason, s: Session): SessionCheckpoint {
    return {
      rawNotes: s.rawNotes,
      objective: s.objective,
      outputs: s.outputs,
      timestamp: Date.now(),
      reason,
    };
  }

  const MAX_CHECKPOINTS = 50;

  function pushCheckpoint(session: Session, checkpoint: SessionCheckpoint) {
    const existing = getCheckpoints(session);
    const last = existing[existing.length - 1];
    if (last && checkpointCoreEqual(last, checkpoint)) return existing;

    const next = [...existing, checkpoint];
    return next.length > MAX_CHECKPOINTS ? next.slice(next.length - MAX_CHECKPOINTS) : next;
  }

  function doDestructive(
    reason: CheckpointReason,
    mutate: (base: Session) => Partial<Session> & Record<string, any>
  ) {
    if (!currentSession) return;

    const cp = makeCheckpoint(reason, currentSession);
    const nextCheckpoints = pushCheckpoint(currentSession, cp);

    const updated: any = {
      ...currentSession,
      checkpoints: nextCheckpoints,
      redoStack: [],
      ...mutate(currentSession),
      updatedAt: Date.now(),
    };

    setSessions((prev) => updateSession(prev, updated as Session));
  }

  function patchSession(patch: Partial<Session> & Record<string, any>, opts?: { clearRedo?: boolean }) {
    if (screen.name !== "session") return;

    const sessionId = screen.sessionId;
    const clearRedo = opts?.clearRedo ?? false;

    setSessions((prev) => {
      const base = prev.find((s) => s.id === sessionId);
      if (!base) return prev;

      const updated: any = {
        ...base,
        ...(patch as any),
        updatedAt: Date.now(),
      };

      if (clearRedo) updated.redoStack = [];

      return updateSession(prev, updated as Session);
    });
  }

  /* -------------------- pastMeta (meeting outcome lives here) -------------------- */

  function getPastMeta(s: Session): { meetingResult: MeetingResult; meetingOutcome: string } {
    const pm = (s as any).pastMeta;
    return {
      meetingResult: (pm?.meetingResult ?? "Pending") as MeetingResult,
      meetingOutcome: String(pm?.meetingOutcome ?? ""),
    };
  }

  function patchPastMeta(patch: Partial<{ meetingResult: MeetingResult; meetingOutcome: string }>) {
    if (!currentSession) return;
    const pm = getPastMeta(currentSession);
    patchSession({ pastMeta: { ...pm, ...patch } } as any, { clearRedo: true });
  }

  /* -------------------- generate -------------------- */

  async function generateViaApi(params: {
    rawNotes: string;
    postMeetingNotes: string;
    meetingOutcome: string;
    mode: GenerateMode;
  }): Promise<Session["outputs"] | null> {
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
      });

      const data = await res.json();

      if (!data?.ok || !data?.outputs) {
        console.error("Generate failed:", data);
        return null;
      }

      return {
        summary: String(data.outputs.summary ?? ""),
        actionItems: String(data.outputs.actionItems ?? ""),
        // Email is generated only in Follow-Up routes, not here
        email: "",
      };
    } catch (err) {
      console.error("Generate error:", err);
      return null;
    }
  }

  function getRawNotesForGeneration(s: Session) {
    if (s.mode === "past" && isEditingPastRawNotes) return pastEditDraft;
    return s.rawNotes;
  }

  async function runGenerate(reason: CheckpointReason, modeOverride?: GenerateMode) {
    if (!currentSession) return;

    const rawNotesForGen = getRawNotesForGeneration(currentSession);
    const pm = getPastMeta(currentSession);

    const outputs = await generateViaApi({
      rawNotes: rawNotesForGen,
      postMeetingNotes: String((currentSession as any).postMeetingNotes ?? ""),
      meetingOutcome: String(pm.meetingOutcome ?? ""),
      mode: modeOverride ?? ((currentSession.mode === "current" ? "current" : "past") as GenerateMode),
    });

    if (!outputs) return;
    doDestructive(reason, () => ({ outputs }));
  }

  async function handleGenerateNow() {
    // Normal Generate button
    await runGenerate("generate");
  }

  async function handleIncorporateIntoOutputs() {
    // Explicit button for Post-Meeting Notes + Meeting Outcome
    await runGenerate("generate", "past");
  }

  async function handleEndMeeting() {
    if (!currentSession) return;

    const pm = getPastMeta(currentSession);

    const outputs = await generateViaApi({
      rawNotes: currentSession.rawNotes,
      postMeetingNotes: String((currentSession as any).postMeetingNotes ?? ""),
      meetingOutcome: String(pm.meetingOutcome ?? ""),
      mode: "past",
    });

    if (!outputs) return;

    doDestructive("end", () => ({
      mode: "past",
      outputs,
      pastMeta: (currentSession as any).pastMeta ?? {
        meetingResult: "Pending",
        meetingOutcome: "",
      },
    }));

    resetPastEditUi();
  }

  /* -------------------- undo/redo (avoid hijacking textarea undo) -------------------- */

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (screen.name !== "session") return;
      if (!currentSession) return;

      const el = document.activeElement as HTMLElement | null;
      const tag = el?.tagName?.toLowerCase();
      const isTypingField = tag === "textarea" || tag === "input" || (el as any)?.isContentEditable;
      if (isTypingField) return;

      const isMac = navigator.platform.toLowerCase().includes("mac");
      const mod = isMac ? e.metaKey : e.ctrlKey;
      if (!mod) return;

      if (e.key.toLowerCase() === "z" && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
        return;
      }

      if ((e.key.toLowerCase() === "z" && e.shiftKey) || (!isMac && e.key.toLowerCase() === "y")) {
        e.preventDefault();
        handleRedo();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, currentSession, sessions]);

  function handleUndo() {
    if (!currentSession) return;

    const checkpoints = getCheckpoints(currentSession);
    if (checkpoints.length === 0) return;

    const previous = checkpoints[checkpoints.length - 1];
    const nowSnap = makeCheckpoint("manual", currentSession);
    const redoStack = getRedoStack(currentSession);

    const updated: any = {
      ...currentSession,
      rawNotes: previous.rawNotes,
      objective: previous.objective,
      outputs: previous.outputs,
      checkpoints: checkpoints.slice(0, -1),
      redoStack: [...redoStack, nowSnap],
      updatedAt: Date.now(),
    };

    resetPastEditUi();
    setSessions((prev) => updateSession(prev, updated as Session));
  }

  function handleRedo() {
    if (!currentSession) return;

    const redoStack = getRedoStack(currentSession);
    if (redoStack.length === 0) return;

    const next = redoStack[redoStack.length - 1];
    const nowSnap = makeCheckpoint("manual", currentSession);
    const checkpoints = getCheckpoints(currentSession);

    const updated: any = {
      ...currentSession,
      rawNotes: next.rawNotes,
      objective: next.objective,
      outputs: next.outputs,
      redoStack: redoStack.slice(0, -1),
      checkpoints: [...checkpoints, nowSnap],
      updatedAt: Date.now(),
    };

    resetPastEditUi();
    setSessions((prev) => updateSession(prev, updated as Session));
  }

  function handleClear() {
    if (!currentSession) return;

    doDestructive("clear", () => ({
      rawNotes: "",
      objective: "",
      outputs: { actionItems: "", summary: "", email: "" },
      postMeetingNotes: "",
      pastMeta:
        currentSession.mode === "past"
          ? {
              meetingResult: getPastMeta(currentSession).meetingResult,
              meetingOutcome: "",
            }
          : (currentSession as any).pastMeta,
    }));

    resetPastEditUi();
  }

  /* -------------------- past raw notes edit flow -------------------- */

  function requestEnablePastEdit() {
    if (!currentSession) return;
    if (currentSession.mode !== "past") return;

    setPastEditOriginal(currentSession.rawNotes);
    setPastEditDraft(currentSession.rawNotes);
    setShowPastEditConfirm(true);
  }

  function confirmEnablePastEdit() {
    setShowPastEditConfirm(false);
    setIsEditingPastRawNotes(true);
  }

  function cancelPastEdit() {
    resetPastEditUi();
  }

  async function savePastEdit() {
    if (!currentSession) return;
    if (currentSession.mode !== "past") return;

    const pm = getPastMeta(currentSession);

    const outputs = await generateViaApi({
      rawNotes: pastEditDraft,
      postMeetingNotes: String((currentSession as any).postMeetingNotes ?? ""),
      meetingOutcome: String(pm.meetingOutcome ?? ""),
      mode: "past",
    });

    if (!outputs) return;

    doDestructive("manual", () => ({
      rawNotes: pastEditDraft,
      outputs,
    }));

    resetPastEditUi();
  }

  /* -------------------- derived UI state -------------------- */

  const checkpointsCount = currentSession ? getCheckpoints(currentSession).length : 0;
  const redoCount = currentSession ? getRedoStack(currentSession).length : 0;

  const headerSubtitle = "Turning Your Meetings Into Actionable And Accountable Follow-Ups";

  /* -------------------- render -------------------- */

  return (
    <main style={{ maxWidth: 1100, margin: "0 auto", padding: 18 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12 }}>
        <div>
          <div style={{ fontSize: 46, fontWeight: 800, lineHeight: 1.0 }}>RecapKit</div>
          <div style={{ marginTop: 6, color: "#666", fontSize: 14 }}>{headerSubtitle}</div>
        </div>

        {screen.name === "session" ? (
          <button
            onClick={goHome}
            style={{
              padding: "10px 14px",
              borderRadius: 10,
              border: "1px solid #ddd",
              background: "#fff",
              cursor: "pointer",
              fontWeight: 600,
            }}
          >
            Back To Home
          </button>
        ) : null}
      </div>

      <div style={{ height: 1, background: "#eee", margin: "16px 0" }} />

      {/* HOME */}
      {screen.name === "home" ? (
        <section>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <button
              onClick={handleCreateStandalone}
              style={{
                padding: "10px 14px",
                borderRadius: 10,
                border: "1px solid #111",
                background: "#111",
                color: "#fff",
                cursor: "pointer",
                fontWeight: 700,
              }}
            >
              New Single Session
            </button>

            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span style={{ color: "#666", fontSize: 13 }}>Sort</span>
              <select
                value={sortMode}
                onChange={(e) => setSortMode(e.target.value as SortMode)}
                style={{
                  padding: "10px 12px",
                  borderRadius: 10,
                  border: "1px solid #ddd",
                  background: "#fff",
                }}
              >
                <option value="updated">Date Modified</option>
                <option value="alpha">Alphabetical</option>
              </select>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginTop: 16 }}>
            {/* Files */}
            <div style={{ border: "1px solid #eee", borderRadius: 14, padding: 14, minHeight: 240 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                <div style={{ fontWeight: 800, fontSize: 16 }}>Files</div>

                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input
                    value={newFolderName}
                    onChange={(e) => setNewFolderName(e.target.value)}
                    placeholder="New File Name"
                    style={{
                      padding: "9px 10px",
                      borderRadius: 10,
                      border: "1px solid #ddd",
                      width: 160,
                    }}
                  />
                  <button
                    onClick={handleCreateFolder}
                    style={{
                      padding: "9px 12px",
                      borderRadius: 10,
                      border: "1px solid #ddd",
                      background: "#fff",
                      cursor: "pointer",
                      fontWeight: 700,
                    }}
                  >
                    New File
                  </button>
                </div>
              </div>

              <div style={{ marginTop: 12 }}>
                {folders.length === 0 ? (
                  <div style={{ color: "#777", fontSize: 13 }}>No Files Yet. Create One Above.</div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {folders.map((f) => {
                      const list = sessionsByFolder[f.id] ?? [];
                      return (
                        <div key={f.id} style={{ border: "1px solid #eee", borderRadius: 12, padding: 12 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                            <div style={{ fontWeight: 800 }}>{f.name}</div>
                            <button
                              onClick={() => handleCreateSessionInFolder(f.id)}
                              style={{
                                padding: "6px 10px",
                                borderRadius: 10,
                                border: "1px solid #ddd",
                                background: "#fff",
                                cursor: "pointer",
                                fontWeight: 700,
                              }}
                            >
                              + Session
                            </button>
                          </div>

                          <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
                            {list.length === 0 ? (
                              <div style={{ color: "#777", fontSize: 13 }}>No Sessions Yet.</div>
                            ) : (
                              list.slice(0, 3).map((s) => (
                                <button
                                  key={s.id}
                                  onClick={() => openSession(s.id)}
                                  style={{
                                    textAlign: "left",
                                    padding: "10px 12px",
                                    borderRadius: 12,
                                    border: "1px solid #eee",
                                    background: "#fff",
                                    cursor: "pointer",
                                  }}
                                >
                                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                                    <div style={{ fontWeight: 800 }}>{s.title}</div>
                                    {s.mode === "current" ? <InSessionBadge /> : null}
                                  </div>
                                  <div style={{ color: "#777", fontSize: 12 }}>{formatDate(s.updatedAt)}</div>
                                </button>
                              ))
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Single Sessions */}
            <div style={{ border: "1px solid #eee", borderRadius: 14, padding: 14, minHeight: 240 }}>
              <div style={{ fontWeight: 800, fontSize: 16 }}>Single Sessions</div>

              <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
                {standaloneSessions.length === 0 ? (
                  <div style={{ color: "#777", fontSize: 13 }}>No Standalone Sessions Yet.</div>
                ) : (
                  standaloneSessions.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => openSession(s.id)}
                      style={{
                        textAlign: "left",
                        padding: "12px 12px",
                        borderRadius: 12,
                        border: "1px solid #eee",
                        background: "#fff",
                        cursor: "pointer",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                        <div style={{ fontWeight: 800 }}>{s.title}</div>
                        {s.mode === "current" ? <InSessionBadge /> : null}
                      </div>
                      <div style={{ color: "#777", fontSize: 12 }}>{formatDate(s.updatedAt)}</div>
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {/* SESSION */}
      {screen.name === "session" ? (
        <section>
          {!currentSession ? (
            <div style={{ color: "#b00" }}>Session Not Found.</div>
          ) : (
            <div className="recap-session-grid">
              {/* Left: context list */}
              <aside
                className="recap-session-sidebar"
                style={{
                  border: "1px solid #eee",
                  borderRadius: 14,
                  padding: 14,
                  height: "fit-content",
                }}
              >
                <div style={{ fontWeight: 900, fontSize: 14 }}>
                  {currentSession.folderId
                    ? `File: ${folders.find((f) => f.id === currentSession.folderId)?.name ?? "Unknown"}`
                    : "Standalone Session"}
                </div>

                <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
                  {(currentSession.folderId ? sessionsByFolder[currentSession.folderId] ?? [] : standaloneSessions).map(
                    (s) => {
                      const active = s.id === currentSession.id;
                      return (
                        <div key={s.id} style={{ border: active ? "1px solid #111" : "1px solid #eee", borderRadius: 12 }}>
                          <button
                            onClick={() => openSession(s.id)}
                            style={{
                              width: "100%",
                              textAlign: "left",
                              padding: "10px 12px",
                              borderRadius: 12,
                              border: "none",
                              background: active ? "#111" : "#fff",
                              color: active ? "#fff" : "#111",
                              cursor: "pointer",
                            }}
                          >
                            <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                              <div style={{ fontWeight: 800 }}>{s.title}</div>
                              {!active && s.mode === "current" ? <InSessionBadge /> : null}
                            </div>
                            <div style={{ opacity: 0.8, fontSize: 12 }}>{formatDate(s.updatedAt)}</div>
                          </button>
                        </div>
                      );
                    }
                  )}
                </div>

                <div style={{ marginTop: 12 }}>
                  <button
                    onClick={() => {
                      if (currentSession.folderId) handleCreateSessionInFolder(currentSession.folderId);
                      else handleCreateStandalone();
                    }}
                    style={{
                      width: "100%",
                      padding: "10px 12px",
                      borderRadius: 12,
                      border: "1px solid #ddd",
                      background: "#fff",
                      cursor: "pointer",
                      fontWeight: 800,
                    }}
                  >
                    + New Session
                  </button>
                </div>

                {/* Past session follow-ups entry point */}
                {currentSession.mode === "past" ? (
                  <div style={{ marginTop: 14, borderTop: "1px solid #eee", paddingTop: 12 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                      <div style={{ fontWeight: 900, fontSize: 13 }}>Follow-Ups</div>
                      <button
                        onClick={openPastMeetingPage}
                        style={{
                          padding: "6px 10px",
                          borderRadius: 10,
                          border: "1px solid #ddd",
                          background: "#fff",
                          cursor: "pointer",
                          fontWeight: 900,
                          fontSize: 12,
                        }}
                        title="Open Past Meeting page"
                      >
                        Open
                      </button>
                    </div>

                    <div style={{ color: "#777", fontSize: 12, marginTop: 8 }}>
                      Follow-ups are managed on the Past Meeting page.
                    </div>
                  </div>
                ) : null}
              </aside>

              {/* Right: editor + outputs */}
              <div className="recap-session-main" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {/* Title row */}
                <div style={{ border: "1px solid #eee", borderRadius: 14, padding: 14 }}>
                  <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                    <input
                      value={currentSession.title}
                      onChange={(e) => patchSession({ title: e.target.value }, { clearRedo: true })}
                      placeholder="Enter Name For Session"
                      style={{
                        flex: 1,
                        minWidth: 220,
                        padding: "12px 12px",
                        borderRadius: 12,
                        border: "1px solid #ddd",
                        fontWeight: 800,
                      }}
                    />

                    <div style={{ color: "#666", fontSize: 13 }}>
                      <b>{modeLabel(currentSession.mode)}</b>
                    </div>

                    {currentSession.mode === "current" ? (
                      <button
                        onClick={handleEndMeeting}
                        style={{
                          padding: "10px 12px",
                          borderRadius: 12,
                          border: "1px solid #111",
                          background: "#111",
                          color: "#fff",
                          cursor: "pointer",
                          fontWeight: 900,
                        }}
                      >
                        End Meeting
                      </button>
                    ) : null}

                    {currentSession.mode === "past" ? (
                      <button
                        onClick={openPastMeetingPage}
                        style={{
                          padding: "10px 12px",
                          borderRadius: 12,
                          border: "1px solid #ddd",
                          background: "#fff",
                          cursor: "pointer",
                          fontWeight: 900,
                        }}
                        title="Open Past Meeting page"
                      >
                        Open Follow-Ups
                      </button>
                    ) : null}
                  </div>

                  <div style={{ marginTop: 10 }}>
                    <input
                      value={currentSession.objective}
                      onChange={(e) => patchSession({ objective: e.target.value }, { clearRedo: true })}
                      placeholder="Meeting Objective (Optional)"
                      style={{
                        width: "100%",
                        padding: "12px 12px",
                        borderRadius: 12,
                        border: "1px solid #ddd",
                      }}
                    />
                  </div>
                </div>

                <div className="recap-home-grid" style={{ marginTop: 16 }}>
                  {/* LEFT PANEL */}
                  <div style={{ border: "1px solid #eee", borderRadius: 14, padding: 14 }}>
                    <div>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                        <div style={{ fontWeight: 900 }}>Raw Notes</div>

                        {currentSession.mode === "past" && !isEditingPastRawNotes ? (
                          <button
                            onClick={requestEnablePastEdit}
                            style={{
                              padding: "8px 10px",
                              borderRadius: 10,
                              border: "1px solid #ddd",
                              background: "#fff",
                              cursor: "pointer",
                              fontWeight: 800,
                              fontSize: 13,
                            }}
                          >
                            Edit Raw Notes
                          </button>
                        ) : null}
                      </div>

                      {currentSession.mode === "past" && isEditingPastRawNotes ? (
                        <div
                          style={{
                            marginTop: 10,
                            padding: 10,
                            borderRadius: 12,
                            border: "1px solid #f1d08a",
                            background: "#fff8e6",
                            color: "#6a4b00",
                            fontSize: 13,
                            lineHeight: 1.35,
                          }}
                        >
                          <b>Editing Past Raw Notes</b> - You are changing the historical record. Outputs regenerate when
                          you save.
                        </div>
                      ) : null}

                      <textarea
                        value={currentSession.mode === "past" && isEditingPastRawNotes ? pastEditDraft : currentSession.rawNotes}
                        readOnly={currentSession.mode === "past" && !isEditingPastRawNotes}
                        onChange={(e) => {
                          if (currentSession.mode === "past") {
                            if (!isEditingPastRawNotes) return;
                            setPastEditDraft(e.target.value);
                            return;
                          }
                          patchSession({ rawNotes: e.target.value }, { clearRedo: true });
                        }}
                        placeholder={"Paste your meeting notes here..."}
                        style={{
                          width: "100%",
                          minHeight: 260,
                          borderRadius: 12,
                          border: "1px solid #ddd",
                          padding: 12,
                          fontSize: 14,
                          lineHeight: 1.4,
                          resize: "vertical",
                          background: currentSession.mode === "past" && !isEditingPastRawNotes ? "#fafafa" : "#fff",
                          marginTop: 10,
                        }}
                      />

                      {currentSession.mode === "past" && isEditingPastRawNotes ? (
                        <div style={{ display: "flex", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
                          <button
                            onClick={savePastEdit}
                            style={{
                              padding: "10px 14px",
                              borderRadius: 12,
                              border: "1px solid #111",
                              background: "#111",
                              color: "#fff",
                              cursor: "pointer",
                              fontWeight: 900,
                            }}
                          >
                            Save Changes
                          </button>

                          <button
                            onClick={() => {
                              setPastEditDraft(pastEditOriginal);
                              cancelPastEdit();
                            }}
                            style={{
                              padding: "10px 14px",
                              borderRadius: 12,
                              border: "1px solid #ddd",
                              background: "#fff",
                              cursor: "pointer",
                              fontWeight: 800,
                            }}
                          >
                            Cancel
                          </button>
                        </div>
                      ) : null}

                      <div style={{ display: "flex", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
                        <button
                          onClick={handleGenerateNow}
                          disabled={
                            currentSession.mode === "past" && isEditingPastRawNotes
                              ? !pastEditDraft.trim()
                              : !currentSession.rawNotes.trim()
                          }
                          style={{
                            padding: "10px 14px",
                            borderRadius: 12,
                            border: "1px solid #111",
                            background:
                              (currentSession.mode === "past" && isEditingPastRawNotes
                                ? pastEditDraft.trim()
                                : currentSession.rawNotes.trim())
                                ? "#111"
                                : "#eee",
                            color:
                              (currentSession.mode === "past" && isEditingPastRawNotes
                                ? pastEditDraft.trim()
                                : currentSession.rawNotes.trim())
                                ? "#fff"
                                : "#777",
                            cursor:
                              (currentSession.mode === "past" && isEditingPastRawNotes
                                ? pastEditDraft.trim()
                                : currentSession.rawNotes.trim())
                                ? "pointer"
                                : "not-allowed",
                            fontWeight: 900,
                          }}
                        >
                          Generate
                        </button>

                        <button
                          onClick={handleUndo}
                          disabled={checkpointsCount === 0}
                          style={{
                            padding: "10px 14px",
                            borderRadius: 12,
                            border: "1px solid #ddd",
                            background: checkpointsCount > 0 ? "#fff" : "#eee",
                            color: checkpointsCount > 0 ? "#111" : "#777",
                            cursor: checkpointsCount > 0 ? "pointer" : "not-allowed",
                            fontWeight: 800,
                          }}
                          title="Undo last checkpoint"
                        >
                          Undo
                        </button>

                        <button
                          onClick={handleRedo}
                          disabled={redoCount === 0}
                          style={{
                            padding: "10px 14px",
                            borderRadius: 12,
                            border: "1px solid #ddd",
                            background: redoCount > 0 ? "#fff" : "#eee",
                            color: redoCount > 0 ? "#111" : "#777",
                            cursor: redoCount > 0 ? "pointer" : "not-allowed",
                            fontWeight: 800,
                          }}
                          title="Redo"
                        >
                          Redo
                        </button>

                        <button
                          onClick={handleClear}
                          style={{
                            padding: "10px 14px",
                            borderRadius: 12,
                            border: "1px solid #ddd",
                            background: "#fff",
                            cursor: "pointer",
                            fontWeight: 800,
                          }}
                        >
                          Clear
                        </button>
                      </div>

                      <div style={{ marginTop: 8, color: "#777", fontSize: 12 }}>
                        {currentSession.mode === "current" ? (
                          <>
                            Status: <b>Meeting Still Open</b>. Notes auto-save until you press <b>End Meeting</b>.
                          </>
                        ) : (
                          <>
                            Status: <b>Past Meeting</b>. Read-only by default to preserve history.
                          </>
                        )}
                      </div>

                      {/* Past-only: Post-meeting notes + meeting outcome */}
                      {currentSession.mode === "past" ? (
                        <div style={{ marginTop: 12, borderTop: "1px solid #eee", paddingTop: 12 }}>
                          <div style={{ fontWeight: 900, marginBottom: 8 }}>Post-Meeting Notes</div>

                          <textarea
                            value={String((currentSession as any).postMeetingNotes ?? "")}
                            onChange={(e) => patchSession({ postMeetingNotes: e.target.value } as any, { clearRedo: true })}
                            placeholder="Anything you remembered after the meeting (clarifications, context, etc.)"
                            style={{
                              width: "100%",
                              minHeight: 120,
                              borderRadius: 12,
                              border: "1px solid #ddd",
                              padding: 12,
                              fontSize: 14,
                              lineHeight: 1.4,
                              resize: "vertical",
                              background: "#fff",
                            }}
                          />

                          <div style={{ height: 12 }} />

                          <div style={{ fontWeight: 900, marginBottom: 8 }}>Meeting Outcome</div>

                          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                              <span style={{ color: "#666", fontSize: 13 }}>Result</span>
                              <select
                                value={getPastMeta(currentSession).meetingResult}
                                onChange={(e) => patchPastMeta({ meetingResult: e.target.value as MeetingResult })}
                                style={{
                                  padding: "10px 12px",
                                  borderRadius: 10,
                                  border: "1px solid #ddd",
                                  background: "#fff",
                                }}
                              >
                                <option value="Pending">Pending</option>
                                <option value="Completed">Completed</option>
                                <option value="No Show">No Show</option>
                                <option value="Rescheduled">Rescheduled</option>
                                <option value="Cancelled">Cancelled</option>
                              </select>
                            </div>
                          </div>

                          <div style={{ marginTop: 10 }}>
                            <textarea
                              value={getPastMeta(currentSession).meetingOutcome}
                              onChange={(e) => patchPastMeta({ meetingOutcome: e.target.value })}
                              placeholder="Outcome notes (what changed, decisions made, blockers, etc.)"
                              style={{
                                width: "100%",
                                minHeight: 90,
                                borderRadius: 12,
                                border: "1px solid #ddd",
                                padding: 12,
                                fontSize: 14,
                                lineHeight: 1.4,
                                resize: "vertical",
                                background: "#fff",
                              }}
                            />
                          </div>

                          {/* This is the missing UX you asked for */}
                          <div style={{ display: "flex", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
                            <button
                              onClick={handleIncorporateIntoOutputs}
                              style={{
                                padding: "10px 14px",
                                borderRadius: 12,
                                border: "1px solid #111",
                                background: "#111",
                                color: "#fff",
                                cursor: "pointer",
                                fontWeight: 900,
                              }}
                              title="Regenerate outputs using Raw Notes + Post-Meeting Notes + Meeting Outcome"
                            >
                              Incorporate Into Outputs
                            </button>

                            <div style={{ color: "#777", fontSize: 12, alignSelf: "center" }}>
                              Updates Summary and Action Items using Post-Meeting Notes and Meeting Outcome.
                            </div>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </div>

                  {/* RIGHT PANEL: Outputs */}
                  <div style={{ border: "1px solid #eee", borderRadius: 14, padding: 14 }}>
                    <div style={{ fontWeight: 900, marginBottom: 10 }}>Outputs</div>

                    <div>
                      <div style={{ marginBottom: 12 }}>
                        <div style={{ fontWeight: 900, marginBottom: 8 }}>Summary</div>
                        <textarea
                          value={currentSession.outputs.summary || ""}
                          readOnly
                          placeholder="Summary output..."
                          style={{
                            width: "100%",
                            minHeight: 160,
                            borderRadius: 12,
                            border: "1px solid #ddd",
                            padding: 12,
                            fontSize: 14,
                            lineHeight: 1.4,
                            resize: "vertical",
                            background: "#fafafa",
                          }}
                        />
                      </div>

                      <div style={{ marginBottom: 12 }}>
                        <div style={{ fontWeight: 900, marginBottom: 8 }}>Action Items</div>
                        <textarea
                          value={currentSession.outputs.actionItems || ""}
                          readOnly
                          placeholder="Action items output..."
                          style={{
                            width: "100%",
                            minHeight: 220,
                            borderRadius: 12,
                            border: "1px solid #ddd",
                            padding: 12,
                            fontSize: 14,
                            lineHeight: 1.4,
                            resize: "vertical",
                            background: "#fafafa",
                          }}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Past raw-notes edit confirm modal */}
                {showPastEditConfirm ? (
                  <div
                    style={{
                      position: "fixed",
                      inset: 0,
                      background: "rgba(0,0,0,0.4)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      padding: 18,
                      zIndex: 50,
                    }}
                  >
                    <div style={{ width: "100%", maxWidth: 560, background: "#fff", borderRadius: 14, padding: 14 }}>
                      <div style={{ fontWeight: 900, fontSize: 16 }}>Edit Past Raw Notes?</div>
                      <div style={{ marginTop: 8, color: "#444", fontSize: 13, lineHeight: 1.4 }}>
                        This past meeting is treated as a historical record. Editing it will regenerate outputs when you
                        save.
                      </div>

                      <div
                        style={{
                          marginTop: 12,
                          display: "flex",
                          gap: 10,
                          justifyContent: "flex-end",
                          flexWrap: "wrap",
                        }}
                      >
                        <button
                          onClick={cancelPastEdit}
                          style={{
                            padding: "10px 14px",
                            borderRadius: 12,
                            border: "1px solid #ddd",
                            background: "#fff",
                            cursor: "pointer",
                            fontWeight: 800,
                          }}
                        >
                          Cancel
                        </button>
                        <button
                          onClick={confirmEnablePastEdit}
                          style={{
                            padding: "10px 14px",
                            borderRadius: 12,
                            border: "1px solid #111",
                            background: "#111",
                            color: "#fff",
                            cursor: "pointer",
                            fontWeight: 900,
                          }}
                        >
                          Yes, Enable Editing
                        </button>
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          )}
        </section>
      ) : null}
    </main>
  );
}