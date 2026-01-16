"use client";

import { useEffect, useMemo, useState } from "react";
import {
  toBullets,
  parseActionItems,
  detectActionIssues,
  formatActionItems,
} from "../lib/recap";

import {
  createFolder,
  createSession,
  loadFolders,
  loadSessions,
  saveFolders,
  saveSessions,
  sortSessions,
  type Folder,
  type Session,
  type SortMode,
} from "../lib/sessionStore";

type AppView = "home" | "editor";
type ArtifactView = "past-outputs" | "email";

type EmailType =
  | "follow-up"
  | "status-update"
  | "questions"
  | "action-items-complete"
  | "action-item-question"
  | "concern";

type EmailTone = "professional" | "warm" | "friendly-professional" | "casual";

function formatDateTime(ts: number) {
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return "Unknown date";
  }
}

function pickFirstNonEmptyLine(text: string) {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  return lines[0] ?? "";
}

function autoTitleForSession(s: Session) {
  const objective = s.objective.trim();
  if (objective) return objective.slice(0, 60);

  const firstLine = pickFirstNonEmptyLine(s.rawNotes);
  if (firstLine) return firstLine.slice(0, 60);

  return `Meeting - ${new Date(s.updatedAt).toLocaleDateString()}`;
}

function titleCase(s: string) {
  return s
    .split(" ")
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

function labelForEmailType(t: EmailType) {
  switch (t) {
    case "follow-up":
      return "Follow Up";
    case "status-update":
      return "Status Update";
    case "questions":
      return "Questions";
    case "action-items-complete":
      return "Action Items Complete";
    case "action-item-question":
      return "Action Item Question";
    case "concern":
      return "Concern";
  }
}

function labelForTone(t: EmailTone) {
  switch (t) {
    case "professional":
      return "Professional";
    case "warm":
      return "Warm";
    case "friendly-professional":
      return "Friendly Professional";
    case "casual":
      return "Casual";
  }
}

export default function Page() {
  const [appView, setAppView] = useState<AppView>("home");
  const [mounted, setMounted] = useState(false);
  const [storeReady, setStoreReady] = useState(false);

  const [sessions, setSessions] = useState<Session[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string>("");

  const [sortMode, setSortMode] = useState<SortMode>("updated");

  const [isGenerating, setIsGenerating] = useState(false);
  const [artifactView, setArtifactView] = useState<ArtifactView>("past-outputs");

  const [emailType, setEmailType] = useState<EmailType>("follow-up");
  const [emailTone, setEmailTone] = useState<EmailTone>("friendly-professional");

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;

    const loadedSessions = loadSessions();
    const loadedFolders = loadFolders();

    // Seed one session for brand new user
    if (loadedSessions.length === 0) {
      const s = createSession();
      const seed: Session = { ...s, title: "" };
      setSessions([seed]);
      setActiveSessionId(seed.id);
      saveSessions([seed]);
    } else {
      setSessions(loadedSessions);
      setActiveSessionId(loadedSessions[0].id);
    }

    setFolders(loadedFolders);
    setStoreReady(true);
  }, [mounted]);

  useEffect(() => {
    if (!mounted || !storeReady) return;
    saveSessions(sessions);
  }, [sessions, mounted, storeReady]);

  useEffect(() => {
    if (!mounted || !storeReady) return;
    saveFolders(folders);
  }, [folders, mounted, storeReady]);

  const activeSession = sessions.find((s) => s.id === activeSessionId) || null;

  const standaloneSessions = useMemo(() => {
    const list = sessions.filter((s) => s.folderId === null);
    return sortSessions(list, sortMode);
  }, [sessions, sortMode]);

  const folderSessionsMap = useMemo(() => {
    const map: Record<string, Session[]> = {};
    for (const f of folders) {
      const list = sessions.filter((s) => s.folderId === f.id);
      map[f.id] = sortSessions(list, sortMode);
    }
    return map;
  }, [folders, sessions, sortMode]);

  const activeFolder = useMemo(() => {
    if (!activeSession || activeSession.folderId === null) return null;
    return folders.find((f) => f.id === activeSession.folderId) || null;
  }, [activeSession, folders]);

  const activeFolderSessions = useMemo(() => {
    if (!activeSession || activeSession.folderId === null) return [];
    return folderSessionsMap[activeSession.folderId] ?? [];
  }, [activeSession, folderSessionsMap]);

  function updateSessionById(id: string, patch: Partial<Session>) {
    setSessions((prev) =>
      prev.map((s) => (s.id === id ? { ...s, ...patch, updatedAt: Date.now() } : s))
    );
  }

  function openSession(id: string) {
    setActiveSessionId(id);
    setAppView("editor");
  }

  function ensureTitleOnBlur() {
    if (!activeSession) return;
    const trimmed = activeSession.title.trim();
    if (trimmed) return;

    const generated = autoTitleForSession(activeSession);
    updateSessionById(activeSession.id, { title: generated });
  }

  function handleNewSingleSession() {
    const s = createSession();
    const now = Date.now();
    const newSession: Session = {
      ...s,
      title: "",
      folderId: null,
      createdAt: now,
      updatedAt: now,
    };

    setSessions((prev) => [newSession, ...prev]);
    openSession(newSession.id);
  }

  function handleNewFile() {
    const name = prompt("File name?");
    if (!name) return;

    const f = createFolder(name.trim());
    setFolders((prev) => [f, ...prev]);
  }

  function handleNewSessionInFolder(folderId: string) {
    const s = createSession();
    const now = Date.now();
    const newSession: Session = {
      ...s,
      title: "",
      folderId,
      createdAt: now,
      updatedAt: now,
    };

    setSessions((prev) => [newSession, ...prev]);
    openSession(newSession.id);
  }

  function moveActiveSessionToFolder(folderId: string) {
    if (!activeSession) return;
    updateSessionById(activeSession.id, { folderId });
  }

  function moveActiveSessionToStandalone() {
    if (!activeSession) return;
    updateSessionById(activeSession.id, { folderId: null });
  }

  function clearSessionContent() {
    if (!activeSession) return;
    updateSessionById(activeSession.id, {
      objective: "",
      rawNotes: "",
      outputs: { actionItems: "", summary: "", email: "" },
    });
  }

  function generatePastOutputs() {
    if (!activeSession) return;

    setIsGenerating(true);

    // clear the two outputs we regenerate
    updateSessionById(activeSession.id, {
      outputs: { ...activeSession.outputs, summary: "", actionItems: "" },
    });

    setTimeout(() => {
      try {
        const bullets = toBullets(activeSession.rawNotes);

        if (bullets.length === 0) {
          const msg =
            "No notes provided. Paste meeting notes into Raw Notes, then click Generate.";
          updateSessionById(activeSession.id, {
            outputs: { ...activeSession.outputs, summary: msg, actionItems: msg },
          });
          setIsGenerating(false);
          return;
        }

        const makeSummary = () => {
          const first = bullets[0] ?? "Meeting notes provided.";
          const rest = bullets.slice(1);

          if (rest.length === 0) return `Summary:\n\n${first}`;

          return (
            `Summary:\n\n${first}\n\nOther topics discussed:\n` +
            rest.map((b) => `- ${b}`).join("\n")
          );
        };

        const makeActionItems = () => {
          const items = parseActionItems(bullets);
          const issues = detectActionIssues(items);
          // Pro mode removed: 2-arg call
          return formatActionItems(items, issues);
        };

        updateSessionById(activeSession.id, {
          outputs: {
            ...activeSession.outputs,
            summary: makeSummary(),
            actionItems: makeActionItems(),
          },
        });

        setIsGenerating(false);
      } catch (e) {
        const out = `Error generating output: ${String(e)}`;
        updateSessionById(activeSession.id, {
          outputs: { ...activeSession.outputs, summary: out, actionItems: out },
        });
        setIsGenerating(false);
      }
    }, 250);
  }

  function generateEmailDraft() {
    if (!activeSession) return;

    setIsGenerating(true);
    updateSessionById(activeSession.id, {
      outputs: { ...activeSession.outputs, email: "" },
    });

    setTimeout(() => {
      try {
        const bullets = toBullets(activeSession.rawNotes);

        if (bullets.length === 0) {
          const msg =
            "No notes provided. Paste meeting notes into Raw Notes, then generate again.";
          updateSessionById(activeSession.id, {
            outputs: { ...activeSession.outputs, email: msg },
          });
          setIsGenerating(false);
          return;
        }

        const subjectBase = (() => {
          const sessionTitle = activeSession.title.trim() || "our meeting";
          const type = labelForEmailType(emailType);
          return `${type} - ${sessionTitle}`;
        })();

        const opening = (() => {
          switch (emailTone) {
            case "professional":
              return "Hi,";
            case "warm":
              return "Hi there,";
            case "friendly-professional":
              return "Hi,";
            case "casual":
              return "Hey,";
          }
        })();

        const closing = (() => {
          switch (emailTone) {
            case "professional":
              return "Thanks,";
            case "warm":
              return "Thanks so much,";
            case "friendly-professional":
              return "Thanks,";
            case "casual":
              return "Cheers,";
          }
        })();

        const keyPoints = bullets.slice(0, 6).map((b) => `- ${b}`).join("\n");

        const summaryBlock =
          activeSession.outputs.summary.trim() !== ""
            ? `\n\nSummary:\n${activeSession.outputs.summary.replace(
                /^Summary:\n\n?/,
                ""
              )}`
            : "";

        const actionItemsBlock =
          activeSession.outputs.actionItems.trim() !== ""
            ? `\n\nAction Items:\n${activeSession.outputs.actionItems.replace(
                /^Action items $begin:math:text$\\d\+$end:math:text$:\n\n?/i,
                ""
              )}`
            : "";

        const bodyIntro = (() => {
          switch (emailType) {
            case "follow-up":
              return "Following up with the key points from our meeting:";
            case "status-update":
              return "Here is a quick status update from our discussion:";
            case "questions":
              return "A few questions and clarifications from our discussion:";
            case "action-items-complete":
              return "Quick update: action items are complete. Details below:";
            case "action-item-question":
              return "I have a question on one of the action items:";
            case "concern":
              return "I wanted to flag a concern from our discussion:";
          }
        })();

        const email =
          `Email Draft:\n` +
          `Subject: ${subjectBase}\n\n` +
          `${opening}\n\n` +
          `${bodyIntro}\n\n` +
          `${keyPoints}` +
          summaryBlock +
          actionItemsBlock +
          `\n\nLet me know if you want me to adjust anything.\n\n` +
          `${closing}`;

        updateSessionById(activeSession.id, {
          outputs: { ...activeSession.outputs, email },
        });

        setIsGenerating(false);
      } catch (e) {
        const out = `Error generating email: ${String(e)}`;
        updateSessionById(activeSession.id, {
          outputs: { ...activeSession.outputs, email: out },
        });
        setIsGenerating(false);
      }
    }, 250);
  }

  return (
    <main style={{ minHeight: "100vh", background: "#fff", color: "#111" }}>
      {/* Header */}
      <header style={{ borderBottom: "1px solid #eee" }}>
        <div
          style={{
            maxWidth: 1200,
            margin: "0 auto",
            padding: "18px 16px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <div>
            <div style={{ fontSize: 34, fontWeight: 800 }}>RecapKit</div>
            <div style={{ fontSize: 14, color: "#666", marginTop: 4 }}>
              Turning your meetings into actionable and accountable follow-ups.
            </div>
          </div>

          {appView === "editor" && activeSession && (
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ fontSize: 12, color: "#666" }}>
                Session Mode:{" "}
                <b>{titleCase(activeSession.mode.replace("-", " "))}</b>
              </div>
              <button
                onClick={() => setAppView("home")}
                style={{
                  padding: "10px 12px",
                  borderRadius: 10,
                  border: "1px solid #ddd",
                  background: "#fff",
                  cursor: "pointer",
                  fontWeight: 800,
                }}
              >
                Home
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Home */}
      {appView === "home" && (
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "18px 16px" }}>
          <div
            style={{
              display: "flex",
              gap: 10,
              marginBottom: 14,
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            <button
              onClick={handleNewFile}
              style={{
                padding: "10px 14px",
                borderRadius: 10,
                border: "1px solid #ddd",
                background: "#fff",
                cursor: "pointer",
                fontWeight: 800,
              }}
            >
              New File
            </button>

            <button
              onClick={handleNewSingleSession}
              style={{
                padding: "10px 14px",
                borderRadius: 10,
                border: "1px solid #111",
                background: "#111",
                color: "#fff",
                cursor: "pointer",
                fontWeight: 800,
              }}
            >
              New Single Session
            </button>

            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <div style={{ fontSize: 12, color: "#666", whiteSpace: "nowrap" }}>
                Sort
              </div>
              <select
                value={sortMode}
                onChange={(e) => setSortMode(e.target.value as SortMode)}
                style={{
                  padding: "10px 12px",
                  borderRadius: 10,
                  border: "1px solid #ddd",
                  background: "#fff",
                  color: "#111",
                }}
              >
                <option value="updated">Date Modified</option>
                <option value="alpha">Alphabetical</option>
              </select>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            {/* Files */}
            <section style={{ border: "1px solid #eee", borderRadius: 12, padding: 12 }}>
              <div style={{ fontSize: 14, fontWeight: 900, marginBottom: 10 }}>
                Files
              </div>

              {folders.length === 0 ? (
                <div style={{ fontSize: 12, color: "#777" }}>
                  No files yet. Click "New File" to create one.
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {folders.map((f) => {
                    const list = folderSessionsMap[f.id] ?? [];
                    return (
                      <div
                        key={f.id}
                        style={{
                          border: "1px solid #eee",
                          borderRadius: 10,
                          padding: 10,
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: 8,
                          }}
                        >
                          <div style={{ fontWeight: 900 }}>{f.name}</div>
                          <button
                            onClick={() => handleNewSessionInFolder(f.id)}
                            style={{
                              border: "1px solid #ddd",
                              background: "#fff",
                              borderRadius: 8,
                              padding: "6px 8px",
                              cursor: "pointer",
                              fontSize: 12,
                              fontWeight: 800,
                            }}
                          >
                            + Session
                          </button>
                        </div>

                        <div
                          style={{
                            marginTop: 10,
                            display: "flex",
                            flexDirection: "column",
                            gap: 8,
                          }}
                        >
                          {list.length === 0 ? (
                            <div style={{ fontSize: 12, color: "#777" }}>
                              No sessions in this file yet.
                            </div>
                          ) : (
                            list.slice(0, 5).map((s) => (
                              <button
                                key={s.id}
                                onClick={() => openSession(s.id)}
                                style={{
                                  textAlign: "left",
                                  padding: "10px 10px",
                                  borderRadius: 10,
                                  border: "1px solid #ddd",
                                  background: "#fff",
                                  cursor: "pointer",
                                }}
                              >
                                <div style={{ fontWeight: 900, fontSize: 13 }}>
                                  {s.title.trim() ? s.title : "(Untitled Session)"}
                                </div>
                                <div style={{ fontSize: 11, opacity: 0.6, marginTop: 4 }}>
                                  {formatDateTime(s.updatedAt)}
                                </div>
                              </button>
                            ))
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            {/* Single Sessions */}
            <section style={{ border: "1px solid #eee", borderRadius: 12, padding: 12 }}>
              <div style={{ fontSize: 14, fontWeight: 900, marginBottom: 10 }}>
                Single Sessions
              </div>

              {standaloneSessions.length === 0 ? (
                <div style={{ fontSize: 12, color: "#777" }}>
                  No single sessions yet. Click "New Single Session".
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {standaloneSessions.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => openSession(s.id)}
                      style={{
                        textAlign: "left",
                        padding: "12px 12px",
                        borderRadius: 12,
                        border: "1px solid #ddd",
                        background: "#fff",
                        cursor: "pointer",
                      }}
                    >
                      <div style={{ fontWeight: 900, fontSize: 14 }}>
                        {s.title.trim() ? s.title : "(Untitled Session)"}
                      </div>
                      <div style={{ fontSize: 11, opacity: 0.6, marginTop: 4 }}>
                        {formatDateTime(s.updatedAt)}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </section>
          </div>
        </div>
      )}

      {/* Editor */}
      {appView === "editor" && (
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "18px 16px" }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "300px 1fr 1fr",
              gap: 14,
              alignItems: "start",
            }}
          >
            {/* Left Sidebar */}
            <aside
              style={{
                border: "1px solid #eee",
                borderRadius: 12,
                padding: 12,
                background: "#fafafa",
                position: "sticky",
                top: 16,
                maxHeight: "calc(100vh - 110px)",
                overflowY: "auto",
              }}
            >
              {!activeSession ? (
                <div style={{ color: "#777" }}>No session selected.</div>
              ) : activeSession.folderId ? (
                <>
                  <div style={{ fontSize: 12, fontWeight: 900, color: "#444" }}>
                    File
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 900, marginTop: 4 }}>
                    {activeFolder?.name ?? "Unknown File"}
                  </div>

                  <button
                    onClick={() => handleNewSessionInFolder(activeSession.folderId as string)}
                    style={{
                      width: "100%",
                      marginTop: 10,
                      padding: "10px 12px",
                      borderRadius: 10,
                      border: "1px solid #111",
                      background: "#111",
                      color: "#fff",
                      fontWeight: 900,
                      cursor: "pointer",
                    }}
                  >
                    + New Session
                  </button>

                  <div style={{ marginTop: 14, fontSize: 12, fontWeight: 900, color: "#444" }}>
                    Sessions In This File
                  </div>

                  <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 8 }}>
                    {activeFolderSessions.map((s) => {
                      const isActive = s.id === activeSessionId;
                      return (
                        <button
                          key={s.id}
                          onClick={() => openSession(s.id)}
                          style={{
                            textAlign: "left",
                            padding: "10px 10px",
                            borderRadius: 10,
                            border: "1px solid #ddd",
                            background: isActive ? "#111" : "#fff",
                            color: isActive ? "#fff" : "#111",
                            cursor: "pointer",
                          }}
                        >
                          <div style={{ fontWeight: 900, fontSize: 13 }}>
                            {s.title.trim() ? s.title : "(Untitled Session)"}
                          </div>
                          <div style={{ fontSize: 11, opacity: isActive ? 0.8 : 0.6, marginTop: 4 }}>
                            {formatDateTime(s.updatedAt)}
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  <button
                    onClick={moveActiveSessionToStandalone}
                    style={{
                      width: "100%",
                      marginTop: 12,
                      padding: "10px 12px",
                      borderRadius: 10,
                      border: "1px solid #ddd",
                      background: "#fff",
                      cursor: "pointer",
                      fontWeight: 900,
                    }}
                  >
                    Move To Standalone
                  </button>
                </>
              ) : (
                <>
                  <div style={{ fontSize: 12, fontWeight: 900, color: "#444" }}>
                    Standalone Sessions
                  </div>

                  <button
                    onClick={handleNewSingleSession}
                    style={{
                      width: "100%",
                      marginTop: 10,
                      padding: "10px 12px",
                      borderRadius: 10,
                      border: "1px solid #111",
                      background: "#111",
                      color: "#fff",
                      fontWeight: 900,
                      cursor: "pointer",
                    }}
                  >
                    + New Standalone Session
                  </button>

                  <div style={{ marginTop: 14, fontSize: 12, fontWeight: 900, color: "#444" }}>
                    Other Standalone Sessions
                  </div>

                  <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 8 }}>
                    {standaloneSessions.map((s) => {
                      const isActive = s.id === activeSessionId;
                      return (
                        <button
                          key={s.id}
                          onClick={() => openSession(s.id)}
                          style={{
                            textAlign: "left",
                            padding: "10px 10px",
                            borderRadius: 10,
                            border: "1px solid #ddd",
                            background: isActive ? "#111" : "#fff",
                            color: isActive ? "#fff" : "#111",
                            cursor: "pointer",
                          }}
                        >
                          <div style={{ fontWeight: 900, fontSize: 13 }}>
                            {s.title.trim() ? s.title : "(Untitled Session)"}
                          </div>
                          <div style={{ fontSize: 11, opacity: isActive ? 0.8 : 0.6, marginTop: 4 }}>
                            {formatDateTime(s.updatedAt)}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </aside>

            {/* Middle: Notes */}
            <section>
              {!activeSession ? (
                <div style={{ color: "#777" }}>No session selected.</div>
              ) : (
                <>
                  <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                    <input
                      value={activeSession.title}
                      onChange={(e) =>
                        updateSessionById(activeSession.id, { title: e.target.value })
                      }
                      onBlur={ensureTitleOnBlur}
                      placeholder="Enter Name For Session"
                      style={{
                        flex: 1,
                        minWidth: 240,
                        borderRadius: 12,
                        border: "1px solid #ddd",
                        padding: 12,
                        fontSize: 14,
                        fontWeight: 900,
                      }}
                    />

                    {activeSession.folderId === null && (
                      <>
                        {folders.length > 0 ? (
                          <select
                            value=""
                            onChange={(e) => {
                              const folderId = e.target.value;
                              if (!folderId) return;
                              moveActiveSessionToFolder(folderId);
                            }}
                            style={{
                              padding: "10px 12px",
                              borderRadius: 10,
                              border: "1px solid #ddd",
                              background: "#fff",
                              color: "#111",
                              cursor: "pointer",
                              fontWeight: 800,
                            }}
                          >
                            <option value="" disabled>
                              Add To File
                            </option>
                            {folders.map((f) => (
                              <option key={f.id} value={f.id}>
                                {f.name}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <button
                            onClick={handleNewFile}
                            style={{
                              padding: "10px 12px",
                              borderRadius: 10,
                              border: "1px solid #ddd",
                              background: "#fff",
                              cursor: "pointer",
                              fontWeight: 900,
                            }}
                          >
                            Create File
                          </button>
                        )}
                      </>
                    )}
                  </div>

                  <input
                    value={activeSession.objective}
                    onChange={(e) =>
                      updateSessionById(activeSession.id, { objective: e.target.value })
                    }
                    placeholder="Meeting Objective (optional)"
                    style={{
                      width: "100%",
                      marginTop: 10,
                      borderRadius: 12,
                      border: "1px solid #ddd",
                      padding: 12,
                      fontSize: 13,
                    }}
                  />

                  <div style={{ marginTop: 10, fontSize: 14, fontWeight: 900, color: "#444" }}>
                    Raw Notes
                  </div>

                  <textarea
                    suppressHydrationWarning
                    value={activeSession.rawNotes}
                    onChange={(e) =>
                      updateSessionById(activeSession.id, { rawNotes: e.target.value })
                    }
                    placeholder="Paste your meeting notes here..."
                    style={{
                      width: "100%",
                      minHeight: 380,
                      marginTop: 8,
                      borderRadius: 12,
                      border: "1px solid #ddd",
                      padding: 12,
                      fontSize: 14,
                      lineHeight: 1.4,
                      resize: "vertical",
                    }}
                  />

                  <div
                    style={{
                      display: "flex",
                      gap: 10,
                      alignItems: "center",
                      marginTop: 12,
                      flexWrap: "wrap",
                    }}
                  >
                    <button
                      onClick={() => {
                        setArtifactView("past-outputs");
                        generatePastOutputs();
                      }}
                      disabled={!activeSession.rawNotes.trim() || isGenerating}
                      style={{
                        padding: "10px 14px",
                        borderRadius: 10,
                        border: "1px solid #111",
                        background: "#111",
                        color: "#fff",
                        fontWeight: 900,
                        opacity: activeSession.rawNotes.trim() ? 1 : 0.4,
                        cursor: activeSession.rawNotes.trim() ? "pointer" : "not-allowed",
                      }}
                    >
                      {isGenerating ? "Generating..." : "Generate Summary + Action Items"}
                    </button>

                    <button
                      onClick={() => {
                        setArtifactView("email");
                        generateEmailDraft();
                      }}
                      disabled={!activeSession.rawNotes.trim() || isGenerating}
                      style={{
                        padding: "10px 14px",
                        borderRadius: 10,
                        border: "1px solid #ddd",
                        background: "#fff",
                        color: "#111",
                        fontWeight: 900,
                        cursor: activeSession.rawNotes.trim() ? "pointer" : "not-allowed",
                        opacity: activeSession.rawNotes.trim() ? 1 : 0.4,
                      }}
                    >
                      Generate Email Draft
                    </button>

                    <button
                      onClick={clearSessionContent}
                      style={{
                        padding: "10px 14px",
                        borderRadius: 10,
                        border: "1px solid #ddd",
                        background: "#fff",
                        color: "#111",
                        cursor: "pointer",
                        fontWeight: 900,
                      }}
                    >
                      Clear
                    </button>
                  </div>

                  <div style={{ marginTop: 10, fontSize: 12, color: "#666" }}>
                    Tip: This is still using local generation. Real OpenAI integration comes after
                    the UI and session model are stable.
                  </div>
                </>
              )}
            </section>

            {/* Right: Output */}
            <section
              style={{
                border: "1px solid #eee",
                borderRadius: 12,
                padding: 12,
                background: "#fff",
                position: "sticky",
                top: 16,
                maxHeight: "calc(100vh - 110px)",
                overflowY: "auto",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                <div style={{ fontSize: 14, fontWeight: 900 }}>Output</div>

                <select
                  value={artifactView}
                  onChange={(e) => setArtifactView(e.target.value as ArtifactView)}
                  style={{
                    padding: "8px 10px",
                    borderRadius: 10,
                    border: "1px solid #ddd",
                    background: "#fff",
                    fontWeight: 800,
                  }}
                >
                  <option value="past-outputs">Summary + Action Items</option>
                  <option value="email">Email Draft</option>
                </select>
              </div>

              {!activeSession ? (
                <div style={{ marginTop: 10, color: "#777" }}>No session selected.</div>
              ) : artifactView === "past-outputs" ? (
                <>
                  <div style={{ marginTop: 12, fontSize: 13, fontWeight: 900, color: "#444" }}>
                    Summary
                  </div>
                  <pre
                    style={{
                      marginTop: 8,
                      padding: 12,
                      borderRadius: 12,
                      border: "1px solid #eee",
                      background: "#fafafa",
                      whiteSpace: "pre-wrap",
                      fontSize: 13,
                      lineHeight: 1.45,
                      minHeight: 120,
                    }}
                  >
                    {activeSession.outputs.summary?.trim()
                      ? activeSession.outputs.summary
                      : "Click Generate Summary + Action Items to see results here."}
                  </pre>

                  <div style={{ marginTop: 12, fontSize: 13, fontWeight: 900, color: "#444" }}>
                    Action Items
                  </div>
                  <pre
                    style={{
                      marginTop: 8,
                      padding: 12,
                      borderRadius: 12,
                      border: "1px solid #eee",
                      background: "#fafafa",
                      whiteSpace: "pre-wrap",
                      fontSize: 13,
                      lineHeight: 1.45,
                      minHeight: 160,
                    }}
                  >
                    {activeSession.outputs.actionItems?.trim()
                      ? activeSession.outputs.actionItems
                      : "Click Generate Summary + Action Items to see results here."}
                  </pre>
                </>
              ) : (
                <>
                  <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      <div style={{ fontSize: 12, fontWeight: 900, color: "#444" }}>
                        Email Type
                      </div>
                      <select
                        value={emailType}
                        onChange={(e) => setEmailType(e.target.value as EmailType)}
                        style={{
                          padding: "10px 12px",
                          borderRadius: 10,
                          border: "1px solid #ddd",
                          background: "#fff",
                          fontWeight: 800,
                        }}
                      >
                        <option value="follow-up">{labelForEmailType("follow-up")}</option>
                        <option value="status-update">{labelForEmailType("status-update")}</option>
                        <option value="questions">{labelForEmailType("questions")}</option>
                        <option value="action-items-complete">
                          {labelForEmailType("action-items-complete")}
                        </option>
                        <option value="action-item-question">
                          {labelForEmailType("action-item-question")}
                        </option>
                        <option value="concern">{labelForEmailType("concern")}</option>
                      </select>
                    </div>

                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      <div style={{ fontSize: 12, fontWeight: 900, color: "#444" }}>
                        Tone
                      </div>
                      <select
                        value={emailTone}
                        onChange={(e) => setEmailTone(e.target.value as EmailTone)}
                        style={{
                          padding: "10px 12px",
                          borderRadius: 10,
                          border: "1px solid #ddd",
                          background: "#fff",
                          fontWeight: 800,
                        }}
                      >
                        <option value="professional">{labelForTone("professional")}</option>
                        <option value="warm">{labelForTone("warm")}</option>
                        <option value="friendly-professional">
                          {labelForTone("friendly-professional")}
                        </option>
                        <option value="casual">{labelForTone("casual")}</option>
                      </select>
                    </div>
                  </div>

                  <pre
                    style={{
                      marginTop: 12,
                      padding: 12,
                      borderRadius: 12,
                      border: "1px solid #eee",
                      background: "#fafafa",
                      whiteSpace: "pre-wrap",
                      fontSize: 13,
                      lineHeight: 1.45,
                      minHeight: 360,
                    }}
                  >
                    {activeSession.outputs.email?.trim()
                      ? activeSession.outputs.email
                      : "Click Generate Email Draft to see results here."}
                  </pre>
                </>
              )}
            </section>
          </div>
        </div>
      )}
    </main>
  );
}