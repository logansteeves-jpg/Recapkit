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
} from "../lib/sessionStore";

type Screen =
  | { name: "home" }
  | { name: "session"; sessionId: string };

// Local-only type so page.tsx compiles even if sessionStore.ts
// does not yet declare checkpoints/redoStack/postMeetingNotes.
type SessionCheckpoint = {
  id: string;
  createdAt: number;
  rawNotes: string;
  objective: string;
  outputs: { actionItems: string; summary: string; email: string };
};

function formatDate(ts: number) {
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return "";
  }
}

export default function Page() {
  const [screen, setScreen] = useState<Screen>({ name: "home" });

  const [folders, setFolders] = useState<Folder[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [sortMode, setSortMode] = useState<SortMode>("updated");

  // draft inputs for creating
  const [newFolderName, setNewFolderName] = useState("");

  // email controls (UI only for now)
  const [emailType, setEmailType] = useState<
    "followUp" | "question" | "actionComplete" | "actionClarification" | "concern"
  >("followUp");

  const [emailTone, setEmailTone] = useState<
    "professional" | "warm" | "friendlyProfessional" | "casual"
  >("professional");

  // load once
  useEffect(() => {
    setFolders(loadFolders());
    setSessions(loadSessions());
  }, []);

  // persist
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

  function openSession(sessionId: string) {
    setScreen({ name: "session", sessionId });
  }

  function goHome() {
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

  function patchSession(patch: Partial<Session> & Record<string, any>) {
    if (!currentSession) return;
    const updated: Session = {
      ...currentSession,
      ...(patch as any),
      updatedAt: Date.now(),
    };
    setSessions((prev) => updateSession(prev, updated));
  }

  function safeMakeEmailDraft(bullets: string[]) {
    // Some versions of recap.ts accept only (bullets)
    // and newer versions accept (bullets, { type, tone }).
    // Casting avoids TS mismatch and keeps your UI stable.
    return (makeEmailDraft as any)(bullets, { type: emailType, tone: emailTone }) as string;
  }

  function generateArtifactsFromRawNotes(rawNotes: string) {
    const bullets: string[] = parseBullets(rawNotes);
    const items = parseActionItems(bullets);
    const issues = detectActionIssues(items);

    return {
      summary: makeSummary(bullets),
      actionItems: formatActionItems(items, issues),
      email: safeMakeEmailDraft(bullets),
    };
  }

  function handleGenerateNow() {
    if (!currentSession) return;
    const outputs = generateArtifactsFromRawNotes(currentSession.rawNotes);
    patchSession({ outputs });
  }

  function snapshotCurrentSession(): SessionCheckpoint | null {
    if (!currentSession) return null;
    return {
      id: Math.random().toString(36).slice(2, 10),
      createdAt: Date.now(),
      rawNotes: currentSession.rawNotes,
      objective: currentSession.objective,
      outputs: currentSession.outputs,
    };
  }

  function handlePauseMeeting() {
    if (!currentSession) return;

    const checkpoint = snapshotCurrentSession();
    if (!checkpoint) return;

    const checkpoints = ((currentSession as any).checkpoints ?? []) as SessionCheckpoint[];

    const updated: any = {
      ...currentSession,
      checkpoints: [...checkpoints, checkpoint],
      // Any new "commit" kills redo history (Word/GDocs behavior)
      redoStack: [],
      updatedAt: Date.now(),
    };

    setSessions((prev) => updateSession(prev, updated as Session));
  }

  function handleEndMeeting() {
    if (!currentSession) return;
    const outputs = generateArtifactsFromRawNotes(currentSession.rawNotes);
    patchSession({ mode: "past", outputs });
  }

  function handleUndo() {
    if (!currentSession) return;

    const checkpoints = ((currentSession as any).checkpoints ?? []) as SessionCheckpoint[];
    if (checkpoints.length === 0) return;

    const previous = checkpoints[checkpoints.length - 1];
    const nowSnap = snapshotCurrentSession();
    if (!nowSnap) return;

    const redoStack = ((currentSession as any).redoStack ?? []) as SessionCheckpoint[];

    const updated: any = {
      ...currentSession,
      rawNotes: previous.rawNotes,
      objective: previous.objective,
      outputs: previous.outputs,
      checkpoints: checkpoints.slice(0, -1),
      redoStack: [...redoStack, nowSnap],
      updatedAt: Date.now(),
    };

    setSessions((prev) => updateSession(prev, updated as Session));
  }

  function handleRedo() {
    if (!currentSession) return;

    const redoStack = ((currentSession as any).redoStack ?? []) as SessionCheckpoint[];
    if (redoStack.length === 0) return;

    const next = redoStack[redoStack.length - 1];
    const nowSnap = snapshotCurrentSession();
    if (!nowSnap) return;

    const checkpoints = ((currentSession as any).checkpoints ?? []) as SessionCheckpoint[];

    const updated: any = {
      ...currentSession,
      rawNotes: next.rawNotes,
      objective: next.objective,
      outputs: next.outputs,
      redoStack: redoStack.slice(0, -1),
      checkpoints: [...checkpoints, nowSnap],
      updatedAt: Date.now(),
    };

    setSessions((prev) => updateSession(prev, updated as Session));
  }

  const headerSubtitle = "Turning your meetings into actionable and accountable follow-ups";

  return (
    <main
      style={{
        maxWidth: 1100,
        margin: "0 auto",
        padding: 18,
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
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
                                  <div style={{ fontWeight: 800 }}>{s.title}</div>
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
                      <div style={{ fontWeight: 800 }}>{s.title}</div>
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
                          <div style={{ fontWeight: 800 }}>{s.title}</div>
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
                      onChange={(e) => patchSession({ title: e.target.value })}
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
                      <div style={{ display: "flex", gap: 10 }}>
                        <button
                          onClick={handlePauseMeeting}
                          style={{
                            padding: "10px 12px",
                            borderRadius: 12,
                            border: "1px solid #ddd",
                            background: "#fff",
                            cursor: "pointer",
                            fontWeight: 800,
                          }}
                        >
                          Pause Meeting
                        </button>

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
                      </div>
                    ) : null}
                  </div>

                  <div style={{ marginTop: 10 }}>
                    <input
                      value={currentSession.objective}
                      onChange={(e) => patchSession({ objective: e.target.value })}
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
                    <div style={{ fontWeight: 900, marginBottom: 8 }}>Raw Notes</div>

                    <textarea
                      value={currentSession.rawNotes}
                      readOnly={currentSession.mode === "past"}
                      onChange={(e) => {
                        if (currentSession.mode === "past") return;
                        patchSession({ rawNotes: e.target.value });
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
                        background: currentSession.mode === "past" ? "#fafafa" : "#fff",
                      }}
                    />

                    <div style={{ display: "flex", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
                      <button
                        onClick={handleGenerateNow}
                        disabled={!currentSession.rawNotes.trim()}
                        style={{
                          padding: "10px 14px",
                          borderRadius: 12,
                          border: "1px solid #111",
                          background: currentSession.rawNotes.trim() ? "#111" : "#eee",
                          color: currentSession.rawNotes.trim() ? "#fff" : "#777",
                          cursor: currentSession.rawNotes.trim() ? "pointer" : "not-allowed",
                          fontWeight: 900,
                        }}
                      >
                        Generate
                      </button>

                      <button
                        onClick={handleUndo}
                        disabled={(((currentSession as any).checkpoints ?? []) as SessionCheckpoint[]).length === 0}
                        style={{
                          padding: "10px 14px",
                          borderRadius: 12,
                          border: "1px solid #ddd",
                          background:
                            (((currentSession as any).checkpoints ?? []) as SessionCheckpoint[]).length > 0
                              ? "#fff"
                              : "#eee",
                          color:
                            (((currentSession as any).checkpoints ?? []) as SessionCheckpoint[]).length > 0
                              ? "#111"
                              : "#777",
                          cursor:
                            (((currentSession as any).checkpoints ?? []) as SessionCheckpoint[]).length > 0
                              ? "pointer"
                              : "not-allowed",
                          fontWeight: 800,
                        }}
                      >
                        Undo
                      </button>

                      <button
                        onClick={handleRedo}
                        disabled={(((currentSession as any).redoStack ?? []) as SessionCheckpoint[]).length === 0}
                        style={{
                          padding: "10px 14px",
                          borderRadius: 12,
                          border: "1px solid #ddd",
                          background:
                            (((currentSession as any).redoStack ?? []) as SessionCheckpoint[]).length > 0
                              ? "#fff"
                              : "#eee",
                          color:
                            (((currentSession as any).redoStack ?? []) as SessionCheckpoint[]).length > 0
                              ? "#111"
                              : "#777",
                          cursor:
                            (((currentSession as any).redoStack ?? []) as SessionCheckpoint[]).length > 0
                              ? "pointer"
                              : "not-allowed",
                          fontWeight: 800,
                        }}
                      >
                        Redo
                      </button>

                      <button
                        onClick={() => {
                          if (!currentSession) return;

                          const checkpoint = snapshotCurrentSession();
                          if (!checkpoint) return;

                          const checkpoints = ((currentSession as any).checkpoints ?? []) as SessionCheckpoint[];

                          const updated: any = {
                            ...currentSession,
                            checkpoints: [...checkpoints, checkpoint],
                            redoStack: [], // important: new action clears redo chain
                            rawNotes: "",
                            objective: "",
                            outputs: { actionItems: "", summary: "", email: "" },
                            updatedAt: Date.now(),
                          };

                          setSessions((prev) => updateSession(prev, updated as Session));
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
                        Clear
                      </button>
                    </div>

                    <div style={{ marginTop: 8, color: "#777", fontSize: 12 }}>
                      Tip: In <b>Current</b> mode, use “End Meeting” when you’re done to convert to <b>Past</b> and auto-generate outputs.
                    </div>

                    {currentSession.mode === "past" ? (
                      <div style={{ marginTop: 12, borderTop: "1px solid #eee", paddingTop: 12 }}>
                        <div style={{ fontWeight: 900, marginBottom: 8 }}>Post-Meeting Notes</div>

                        <textarea
                          value={((currentSession as any).postMeetingNotes ?? "") as string}
                          onChange={(e) => patchSession({ postMeetingNotes: e.target.value } as any)}
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

                    {/* Summary */}
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

                    {/* Action Items */}
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

                    {/* Draft Email from Notes */}
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
    </main>
  );
}