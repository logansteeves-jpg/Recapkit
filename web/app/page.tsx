"use client";

import { useEffect, useMemo, useState } from "react";
import {
  parseBullets,
  parseActionItems,
  detectActionIssues,
  formatActionItems,
  makeSummary,
  makeEmailDraft,
} from "../lib/recap";
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

type Screen = { name: "home" } | { name: "session"; sessionId: string };

function formatDate(ts: number) {
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return "";
  }
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
      title="Meeting still in session"
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
      In session
    </span>
  );
}

export default function Page() {
  const [screen, setScreen] = useState<Screen>({ name: "home" });

  const [folders, setFolders] = useState<Folder[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [sortMode, setSortMode] = useState<SortMode>("updated");

  const [newFolderName, setNewFolderName] = useState("");

  const [emailType, setEmailType] = useState<
    "followUp" | "question" | "actionComplete" | "actionClarification" | "concern"
  >("followUp");

  const [emailTone, setEmailTone] = useState<
    "professional" | "warm" | "friendlyProfessional" | "casual"
  >("professional");

  // Module 3 (partial): Past raw notes edit warning UX
  const [showPastEditConfirm, setShowPastEditConfirm] = useState(false);
  const [isEditingPastRawNotes, setIsEditingPastRawNotes] = useState(false);
  const [pastEditDraft, setPastEditDraft] = useState("");
  const [pastEditOriginal, setPastEditOriginal] = useState("");

  useEffect(() => {
    setFolders(loadFolders());
    setSessions(loadSessions());
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
    return Array.isArray(s.checkpoints) ? s.checkpoints : [];
  }

  function getRedoStack(s: Session): SessionCheckpoint[] {
    return Array.isArray(s.redoStack) ? s.redoStack : [];
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
    if (!currentSession) return;

    const clearRedo = opts?.clearRedo ?? false;

    const updated: any = {
      ...currentSession,
      ...(patch as any),
      updatedAt: Date.now(),
    };

    if (clearRedo) updated.redoStack = [];

    setSessions((prev) => updateSession(prev, updated as Session));
  }

  function safeMakeEmailDraft(bullets: string[]) {
    return (makeEmailDraft as any)(bullets, { type: emailType, tone: emailTone }) as string;
  }

  function generateArtifactsFromRawNotes(rawNotes: string, postMeetingNotes?: string) {
    const merged = postMeetingNotes?.trim()
      ? `${rawNotes}\n\nPost-Meeting Notes:\n${postMeetingNotes.trim()}`
      : rawNotes;

    const bullets: string[] = parseBullets(merged);
    const items = parseActionItems(bullets);
    const issues = detectActionIssues(items);

    return {
      summary: makeSummary(bullets),
      actionItems: formatActionItems(items, issues),
      email: safeMakeEmailDraft(bullets),
    };
  }

  // Avoid hijacking native textarea undo
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

  function handleGenerateNow() {
    if (!currentSession) return;

    doDestructive("generate", (base) => {
      const postMeetingNotes = (base.postMeetingNotes ?? "") as string;
      const outputs = generateArtifactsFromRawNotes(base.rawNotes, postMeetingNotes);
      return { outputs };
    });
  }

  function handleEndMeeting() {
    if (!currentSession) return;

    doDestructive("end", (base) => {
      const postMeetingNotes = (base.postMeetingNotes ?? "") as string;
      const outputs = generateArtifactsFromRawNotes(base.rawNotes, postMeetingNotes);
      return { mode: "past", outputs };
    });

    resetPastEditUi();
  }

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

    doDestructive("clear", () => {
      return {
        rawNotes: "",
        objective: "",
        outputs: { actionItems: "", summary: "", email: "" },
      };
    });

    resetPastEditUi();
  }

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

  function savePastEdit() {
    if (!currentSession) return;
    if (currentSession.mode !== "past") return;

    doDestructive("manual", (base) => {
      const postMeetingNotes = (base.postMeetingNotes ?? "") as string;
      const outputs = generateArtifactsFromRawNotes(pastEditDraft, postMeetingNotes);
      return { rawNotes: pastEditDraft, outputs };
    });

    resetPastEditUi();
  }

  const checkpointsCount = currentSession ? getCheckpoints(currentSession).length : 0;
  const redoCount = currentSession ? getRedoStack(currentSession).length : 0;

  const headerSubtitle = "Turning your meetings into actionable and accountable follow-ups";

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
            Back to Home
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
                    placeholder="New file name"
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
                  <div style={{ color: "#777", fontSize: 13 }}>No files yet. Create one above.</div>
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
                              <div style={{ color: "#777", fontSize: 13 }}>No sessions yet.</div>
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
                  <div style={{ color: "#777", fontSize: 13 }}>No standalone sessions yet.</div>
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
            <div style={{ color: "#b00" }}>Session not found.</div>
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
                        <button
                          key={s.id}
                          onClick={() => openSession(s.id)}
                          style={{
                            textAlign: "left",
                            padding: "10px 12px",
                            borderRadius: 12,
                            border: "1px solid #eee",
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
              </aside>

              {/* Right: editor + outputs */}
              <div className="recap-session-main" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {/* Title row */}
                <div style={{ border: "1px solid #eee", borderRadius: 14, padding: 14 }}>
                  <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                    <input
                      value={currentSession.title}
                      onChange={(e) => patchSession({ title: e.target.value }, { clearRedo: true })}
                      placeholder="Enter name for session"
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
                      Mode: <b>{currentSession.mode}</b>
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
                  </div>

                  <div style={{ marginTop: 10 }}>
                    <input
                      value={currentSession.objective}
                      onChange={(e) => patchSession({ objective: e.target.value }, { clearRedo: true })}
                      placeholder="Meeting objective (optional)"
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
                  {/* Raw Notes */}
                  <div style={{ border: "1px solid #eee", borderRadius: 14, padding: 14 }}>
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
                        <b>Editing Past Raw Notes</b> - you are changing the historical record. Outputs will regenerate
                        when you save.
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
                      placeholder="Paste your meeting notes here..."
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
                      Tip: In <b>Current</b> mode, your meeting stays <b>in session</b> until you press <b>End Meeting</b>.
                    </div>

                    {currentSession.mode === "past" ? (
                      <div style={{ marginTop: 12, borderTop: "1px solid #eee", paddingTop: 12 }}>
                        <div style={{ fontWeight: 900, marginBottom: 8 }}>Post-Meeting Notes</div>

                        <textarea
                          value={(currentSession.postMeetingNotes ?? "") as string}
                          onChange={(e) => patchSession({ postMeetingNotes: e.target.value } as any, { clearRedo: true })}
                          placeholder="Add anything you remembered after the meeting (clarifications, follow-ups, context, etc.)"
                          style={{
                            width: "100%",
                            minHeight: 140,
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
                    ) : null}
                  </div>

                  {/* Output */}
                  <div style={{ border: "1px solid #eee", borderRadius: 14, padding: 14 }}>
                    <div style={{ fontWeight: 900, marginBottom: 8 }}>Output</div>

                    <div style={{ fontWeight: 900, fontSize: 13, marginBottom: 6 }}>Summary</div>
                    <pre
                      style={{
                        whiteSpace: "pre-wrap",
                        border: "1px solid #ddd",
                        borderRadius: 12,
                        padding: 12,
                        minHeight: 120,
                        fontSize: 13,
                        lineHeight: 1.35,
                        background: "#fafafa",
                        margin: 0,
                      }}
                    >
                      {currentSession.outputs.summary?.trim()
                        ? currentSession.outputs.summary
                        : "Click Generate to create a summary."}
                    </pre>

                    <div style={{ height: 12 }} />

                    <div style={{ fontWeight: 900, fontSize: 13, marginBottom: 6 }}>Action Items (from notes)</div>
                    <pre
                      style={{
                        whiteSpace: "pre-wrap",
                        border: "1px solid #ddd",
                        borderRadius: 12,
                        padding: 12,
                        minHeight: 140,
                        fontSize: 13,
                        lineHeight: 1.35,
                        background: "#fafafa",
                        margin: 0,
                      }}
                    >
                      {currentSession.outputs.actionItems?.trim()
                        ? currentSession.outputs.actionItems
                        : "Click Generate to extract action items."}
                    </pre>

                    <div style={{ height: 12 }} />

                    <div style={{ fontWeight: 900, fontSize: 13, marginBottom: 8 }}>Draft Email from Notes</div>

                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <span style={{ color: "#666", fontSize: 13 }}>Type</span>
                        <select
                          value={emailType}
                          onChange={(e) => setEmailType(e.target.value as any)}
                          style={{
                            padding: "10px 12px",
                            borderRadius: 10,
                            border: "1px solid #ddd",
                            background: "#fff",
                          }}
                        >
                          <option value="followUp">Follow-up</option>
                          <option value="question">Question</option>
                          <option value="actionComplete">Action item completion</option>
                          <option value="actionClarification">Action item clarification</option>
                          <option value="concern">Concern</option>
                        </select>
                      </div>

                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <span style={{ color: "#666", fontSize: 13 }}>Tone</span>
                        <select
                          value={emailTone}
                          onChange={(e) => setEmailTone(e.target.value as any)}
                          style={{
                            padding: "10px 12px",
                            borderRadius: 10,
                            border: "1px solid #ddd",
                            background: "#fff",
                          }}
                        >
                          <option value="professional">Professional</option>
                          <option value="warm">Warm</option>
                          <option value="friendlyProfessional">Friendly professional</option>
                          <option value="casual">Casual</option>
                        </select>
                      </div>

                      <button
                        onClick={handleGenerateNow}
                        disabled={!currentSession.rawNotes.trim()}
                        style={{
                          padding: "10px 14px",
                          borderRadius: 10,
                          border: "1px solid #111",
                          background: currentSession.rawNotes.trim() ? "#111" : "#eee",
                          color: currentSession.rawNotes.trim() ? "#fff" : "#777",
                          cursor: currentSession.rawNotes.trim() ? "pointer" : "not-allowed",
                          fontWeight: 900,
                        }}
                        title="Uses the current Type + Tone selections"
                      >
                        Generate Email Draft
                      </button>
                    </div>

                    <pre
                      style={{
                        whiteSpace: "pre-wrap",
                        border: "1px solid #ddd",
                        borderRadius: 12,
                        padding: 12,
                        minHeight: 160,
                        fontSize: 13,
                        lineHeight: 1.35,
                        background: "#fafafa",
                        margin: 0,
                      }}
                    >
                      {currentSession.outputs.email?.trim()
                        ? currentSession.outputs.email
                        : "Pick a Type + Tone, then Generate Email Draft."}
                    </pre>
                  </div>
                </div>
              </div>
            </div>
          )}
        </section>
      ) : null}

      {/* Module 3 (partial): Past edit confirmation modal */}
      {screen.name === "session" && currentSession?.mode === "past" && showPastEditConfirm ? (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.35)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 18,
            zIndex: 50,
          }}
          onClick={() => setShowPastEditConfirm(false)}
        >
          <div
            style={{
              width: "100%",
              maxWidth: 520,
              background: "#fff",
              borderRadius: 14,
              border: "1px solid #eee",
              padding: 16,
              boxShadow: "0 10px 30px rgba(0,0,0,0.15)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontWeight: 900, fontSize: 16 }}>Edit Past Raw Notes?</div>

            <div style={{ marginTop: 10, color: "#444", fontSize: 13, lineHeight: 1.45 }}>
              Past meetings are intended to be an immutable record of what happened.
              <br />
              <br />
              If you continue, you will be changing the historical raw notes. RecapKit will regenerate outputs from the
              updated notes.
            </div>

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 14, flexWrap: "wrap" }}>
              <button
                onClick={() => setShowPastEditConfirm(false)}
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
                Yes, Edit Raw Notes
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}