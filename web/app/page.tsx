"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
type ViewMode = "action-items" | "summary" | "email";
type GenerateChoice = "" | "selected" | "all";

function viewModeToKey(mode: ViewMode): "actionItems" | "summary" | "email" {
  return mode === "action-items" ? "actionItems" : mode;
}

function formatDateShort(ts: number) {
  try {
    return new Date(ts).toLocaleDateString();
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

  return `Meeting - ${formatDateShort(s.updatedAt)}`;
}

export default function Page() {
  const [appView, setAppView] = useState<AppView>("home");

  const [viewMode, setViewMode] = useState<ViewMode>("action-items");
  const [generateChoice, setGenerateChoice] = useState<GenerateChoice>("");

  const [proMode, setProMode] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [storeReady, setStoreReady] = useState(false);

  const [sessions, setSessions] = useState<Session[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string>("");

  const [sortMode, setSortMode] = useState<SortMode>("updated");
  const [openFolderIds, setOpenFolderIds] = useState<Record<string, boolean>>(
    {}
  );

  const [isGenerating, setIsGenerating] = useState(false);

  // Pro mode help tooltip
  const [showProHelp, setShowProHelp] = useState(false);
  const proHelpRef = useRef<HTMLDivElement | null>(null);
  const proHelpBtnRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    setMounted(true);
    const saved = localStorage.getItem("proMode");
    if (saved !== null) setProMode(saved !== "false");
  }, []);

  useEffect(() => {
    if (!mounted) return;
    localStorage.setItem("proMode", String(proMode));
  }, [proMode, mounted]);

  useEffect(() => {
    if (!showProHelp) return;

    function onDown(e: MouseEvent) {
      const target = e.target as Node;
      if (proHelpRef.current?.contains(target)) return;
      if (proHelpBtnRef.current?.contains(target)) return;
      setShowProHelp(false);
    }

    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [showProHelp]);

  // Load sessions/folders after mount
  useEffect(() => {
    if (!mounted) return;

    const loadedSessions = loadSessions();
    const loadedFolders = loadFolders();

    // If brand new user, create one seed session but stay on Home
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

    const initialOpen: Record<string, boolean> = {};
    for (const f of loadedFolders) initialOpen[f.id] = true;
    setOpenFolderIds(initialOpen);

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

  const activeOutput = useMemo(() => {
    if (!activeSession) return "";
    const key = viewModeToKey(viewMode);
    return activeSession.outputs[key];
  }, [activeSession, viewMode]);

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

  function updateSessionById(id: string, patch: Partial<Session>) {
    setSessions((prev) =>
      prev.map((s) =>
        s.id === id ? { ...s, ...patch, updatedAt: Date.now() } : s
      )
    );
  }

  function openSession(id: string) {
    setActiveSessionId(id);
    setAppView("editor");
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
    setOpenFolderIds((prev) => ({ ...prev, [f.id]: true }));
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

  function toggleFolder(folderId: string) {
    setOpenFolderIds((prev) => ({ ...prev, [folderId]: !prev[folderId] }));
  }

  function ensureTitleOnBlur() {
    if (!activeSession) return;
    const trimmed = activeSession.title.trim();
    if (trimmed) return;

    const generated = autoTitleForSession(activeSession);
    updateSessionById(activeSession.id, { title: generated });
  }

  function moveActiveSessionToFolder(folderId: string) {
    if (!activeSession) return;
    updateSessionById(activeSession.id, { folderId });
  }

  function handleGenerate(choice: GenerateChoice) {
    if (!activeSession) return;

    setIsGenerating(true);

    // Clear outputs we are about to regenerate
    updateSessionById(activeSession.id, {
      outputs:
        choice === "all"
          ? { actionItems: "", summary: "", email: "" }
          : {
              ...activeSession.outputs,
              actionItems:
                viewMode === "action-items" ? "" : activeSession.outputs.actionItems,
              summary: viewMode === "summary" ? "" : activeSession.outputs.summary,
              email: viewMode === "email" ? "" : activeSession.outputs.email,
            },
    });

    setTimeout(() => {
      try {
        const bullets = toBullets(activeSession.rawNotes);

        const setOutput = (
          key: "actionItems" | "summary" | "email",
          value: string
        ) => {
          // Use latest session value to avoid overwriting other fields
          const latest =
            sessions.find((s) => s.id === activeSession.id) || activeSession;
          updateSessionById(activeSession.id, {
            outputs: { ...latest.outputs, [key]: value },
          });
        };

        const setAllOutputs = (out: {
          actionItems: string;
          summary: string;
          email: string;
        }) => {
          updateSessionById(activeSession.id, { outputs: out });
        };

        if (bullets.length === 0) {
          const msg =
            "No notes provided. Paste meeting notes into Raw Notes, then click Generate.";

          if (choice === "all") {
            setAllOutputs({ actionItems: msg, summary: msg, email: msg });
          } else {
            const key = viewModeToKey(viewMode);
            setOutput(key, msg);
          }

          setIsGenerating(false);
          return;
        }

        const makeSummary = () => {
          const first = bullets[0] ?? "Meeting notes provided.";
          const restCount = Math.max(0, bullets.length - 1);

          return (
            `Summary:\n\n${first}\n\nOther topics discussed:\n` +
            bullets
              .slice(1)
              .map((b) => `- ${b}`)
              .join("\n") +
            `\n\n(${restCount} additional point${restCount === 1 ? "" : "s"})`
          );
        };

        const makeEmail = () => {
          const subject = "Follow-up from our meeting";
          const bodyLines = bullets.slice(0, 6).map((b) => `- ${b}`);

          return (
            `Email Draft:\n` +
            `Subject: ${subject}\n\n` +
            `Hi,\n\n` +
            `Here are the key points from our discussion:\n\n` +
            bodyLines.join("\n") +
            `\n\nLet me know if you have questions.\n\nThanks,`
          );
        };

        const makeActionItems = () => {
          const items = parseActionItems(bullets);
          const issues = detectActionIssues(items);
          return formatActionItems(items, issues, proMode);
        };

        if (choice === "all") {
          setAllOutputs({
            actionItems: makeActionItems(),
            summary: makeSummary(),
            email: makeEmail(),
          });
          setIsGenerating(false);
          return;
        }

        if (viewMode === "summary") {
          setOutput("summary", makeSummary());
          setIsGenerating(false);
          return;
        }

        if (viewMode === "email") {
          setOutput("email", makeEmail());
          setIsGenerating(false);
          return;
        }

        setOutput("actionItems", makeActionItems());
        setIsGenerating(false);
      } catch (e) {
        const out = `Error generating output: ${String(e)}`;

        if (choice === "all") {
          updateSessionById(activeSession.id, {
            outputs: { actionItems: out, summary: out, email: out },
          });
        } else {
          const key = viewModeToKey(viewMode);
          const latest =
            sessions.find((s) => s.id === activeSession.id) || activeSession;
          updateSessionById(activeSession.id, {
            outputs: { ...latest.outputs, [key]: out },
          });
        }

        setIsGenerating(false);
      }
    }, 400);
  }

  /* -------------------- UI -------------------- */

  return (
    <main style={{ minHeight: "100vh", background: "#fff", color: "#111" }}>
      <style jsx global>{`
        @keyframes proHelpIn {
          from {
            opacity: 0;
            transform: scale(0.96) translateY(-4px);
          }
          to {
            opacity: 1;
            transform: scale(1) translateY(0);
          }
        }
      `}</style>

      {/* Header */}
      <header style={{ borderBottom: "1px solid #eee" }}>
        <div
          style={{
            maxWidth: 1200,
            margin: "0 auto",
            padding: "20px 16px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <div>
            <div style={{ fontSize: 34, fontWeight: 700 }}>RecapKit</div>
            <div style={{ fontSize: 14, color: "#666", marginTop: 4 }}>
              Meeting Notes → Recap → Action Items
            </div>
          </div>

          {appView === "editor" && (
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => setViewMode("action-items")}
                style={{
                  padding: "10px 12px",
                  borderRadius: 10,
                  border: "1px solid #ddd",
                  background: viewMode === "action-items" ? "#111" : "#fff",
                  color: viewMode === "action-items" ? "#fff" : "#111",
                  cursor: "pointer",
                }}
              >
                Action Items
              </button>

              <button
                onClick={() => setViewMode("summary")}
                style={{
                  padding: "10px 12px",
                  borderRadius: 10,
                  border: "1px solid #ddd",
                  background: viewMode === "summary" ? "#111" : "#fff",
                  color: viewMode === "summary" ? "#fff" : "#111",
                  cursor: "pointer",
                }}
              >
                Summary
              </button>

              <button
                onClick={() => setViewMode("email")}
                style={{
                  padding: "10px 12px",
                  borderRadius: 10,
                  border: "1px solid #ddd",
                  background: viewMode === "email" ? "#111" : "#fff",
                  color: viewMode === "email" ? "#fff" : "#111",
                  cursor: "pointer",
                }}
              >
                Email
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Home */}
      {appView === "home" && (
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "18px 16px" }}>
          <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
            <button
              onClick={handleNewFile}
              style={{
                padding: "10px 14px",
                borderRadius: 10,
                border: "1px solid #ddd",
                background: "#fff",
                cursor: "pointer",
                fontWeight: 700,
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
                fontWeight: 700,
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
              <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 10 }}>
                Files
              </div>

              {folders.length === 0 && (
                <div style={{ fontSize: 12, color: "#777" }}>
                  No files yet. Click "New File" to create one.
                </div>
              )}

              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {folders.map((f) => {
                  const list = folderSessionsMap[f.id] ?? [];
                  return (
                    <div
                      key={f.id}
                      style={{ border: "1px solid #eee", borderRadius: 10, padding: 10 }}
                    >
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                        <div style={{ fontWeight: 800 }}>{f.name}</div>
                        <button
                          onClick={() => handleNewSessionInFolder(f.id)}
                          style={{
                            border: "1px solid #ddd",
                            background: "#fff",
                            borderRadius: 8,
                            padding: "6px 8px",
                            cursor: "pointer",
                            fontSize: 12,
                          }}
                        >
                          + Session
                        </button>
                      </div>

                      <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
                        {list.length === 0 ? (
                          <div style={{ fontSize: 12, color: "#777" }}>
                            No sessions in this file yet.
                          </div>
                        ) : (
                          list.slice(0, 4).map((s) => (
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
                              <div style={{ fontWeight: 800, fontSize: 13 }}>
                                {s.title.trim() ? s.title : "(Untitled Session)"}
                              </div>
                              <div style={{ fontSize: 11, opacity: 0.6, marginTop: 4 }}>
                                {new Date(s.updatedAt).toLocaleString()}
                              </div>
                            </button>
                          ))
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* Single Sessions */}
            <section style={{ border: "1px solid #eee", borderRadius: 12, padding: 12 }}>
              <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 10 }}>
                Single Sessions
              </div>

              {standaloneSessions.length === 0 ? (
                <div style={{ fontSize: 12, color: "#777" }}>
                  No single sessions yet. Click "New Single Session".
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {standaloneSessions.map((s) => (
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
                      <div style={{ fontWeight: 800, fontSize: 13 }}>
                        {s.title.trim() ? s.title : "(Untitled Session)"}
                      </div>
                      <div style={{ fontSize: 11, opacity: 0.6, marginTop: 4 }}>
                        {new Date(s.updatedAt).toLocaleString()}
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
              gridTemplateColumns: "280px 1fr 1fr",
              gap: 14,
              alignItems: "start",
            }}
          >
            {/* Sidebar */}
            <aside
              style={{
                border: "1px solid #eee",
                borderRadius: 12,
                padding: 12,
                background: "#fafafa",
                position: "sticky",
                top: 16,
                maxHeight: "calc(100vh - 120px)",
                overflowY: "auto",
              }}
            >
              <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
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
                  Back
                </button>

                <button
                  onClick={handleNewSingleSession}
                  style={{
                    flex: 1,
                    padding: "10px 12px",
                    borderRadius: 10,
                    border: "1px solid #111",
                    background: "#111",
                    color: "#fff",
                    fontWeight: 800,
                    cursor: "pointer",
                  }}
                >
                  New Session
                </button>
              </div>

              <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12 }}>
                <div style={{ fontSize: 12, color: "#666", whiteSpace: "nowrap" }}>Sort</div>
                <select
                  value={sortMode}
                  onChange={(e) => setSortMode(e.target.value as SortMode)}
                  style={{
                    flex: 1,
                    padding: "8px 10px",
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

              <div style={{ fontSize: 12, fontWeight: 800, color: "#444", marginBottom: 8 }}>
                Standalone
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 14 }}>
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
                        lineHeight: 1.2,
                      }}
                    >
                      <div style={{ fontWeight: 800, fontSize: 13 }}>
                        {s.title.trim() ? s.title : "(Untitled Session)"}
                      </div>
                      <div style={{ fontSize: 11, opacity: isActive ? 0.8 : 0.6, marginTop: 4 }}>
                        {new Date(s.updatedAt).toLocaleString()}
                      </div>
                    </button>
                  );
                })}
              </div>

              <div style={{ fontSize: 12, fontWeight: 800, color: "#444", marginBottom: 8 }}>
                Files
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {folders.map((f) => {
                  const isOpen = openFolderIds[f.id] ?? false;
                  const list = folderSessionsMap[f.id] ?? [];

                  return (
                    <div key={f.id} style={{ border: "1px solid #eee", borderRadius: 10, background: "#fff" }}>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: 8,
                          padding: "10px 10px",
                        }}
                      >
                        <button
                          onClick={() => toggleFolder(f.id)}
                          style={{
                            border: "none",
                            background: "transparent",
                            cursor: "pointer",
                            fontWeight: 800,
                            fontSize: 13,
                            padding: 0,
                            textAlign: "left",
                            flex: 1,
                          }}
                        >
                          {isOpen ? "▾" : "▸"} {f.name}
                        </button>

                        <button
                          onClick={() => handleNewSessionInFolder(f.id)}
                          style={{
                            border: "1px solid #ddd",
                            background: "#fff",
                            borderRadius: 8,
                            padding: "6px 8px",
                            cursor: "pointer",
                            fontSize: 12,
                          }}
                        >
                          + Session
                        </button>
                      </div>

                      {isOpen && (
                        <div style={{ padding: "0 10px 10px", display: "flex", flexDirection: "column", gap: 6 }}>
                          {list.map((s) => {
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
                                  lineHeight: 1.2,
                                }}
                              >
                                <div style={{ fontWeight: 800, fontSize: 13 }}>
                                  {s.title.trim() ? s.title : "(Untitled Session)"}
                                </div>
                                <div style={{ fontSize: 11, opacity: isActive ? 0.8 : 0.6, marginTop: 4 }}>
                                  {new Date(s.updatedAt).toLocaleString()}
                                </div>
                              </button>
                            );
                          })}

                          {list.length === 0 && (
                            <div style={{ fontSize: 12, color: "#777", paddingBottom: 6 }}>
                              No sessions in this file.
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}

                <button
                  onClick={handleNewFile}
                  style={{
                    marginTop: 8,
                    padding: "10px 12px",
                    borderRadius: 10,
                    border: "1px solid #ddd",
                    background: "#fff",
                    cursor: "pointer",
                    fontWeight: 800,
                  }}
                >
                  + New File
                </button>
              </div>
            </aside>

            {/* Middle: input */}
            <section>
              {!activeSession ? (
                <div style={{ color: "#777" }}>No session selected.</div>
              ) : (
                <>
                  {/* Session Title + File controls */}
                  <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 10, flexWrap: "wrap" }}>
                    <input
                      value={activeSession.title}
                      onChange={(e) => updateSessionById(activeSession.id, { title: e.target.value })}
                      onBlur={ensureTitleOnBlur}
                      placeholder="Enter Name For Session"
                      style={{
                        flex: 1,
                        minWidth: 220,
                        borderRadius: 12,
                        border: "1px solid #ddd",
                        padding: 12,
                        fontSize: 14,
                        fontWeight: 800,
                      }}
                    />

                    {activeSession.folderId === null && folders.length > 0 && (
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
                    )}

                    {activeSession.folderId === null && folders.length === 0 && (
                      <button
                        onClick={handleNewFile}
                        style={{
                          padding: "10px 12px",
                          borderRadius: 10,
                          border: "1px solid #ddd",
                          background: "#fff",
                          cursor: "pointer",
                          fontWeight: 800,
                        }}
                      >
                        Create File
                      </button>
                    )}

                    <div style={{ fontSize: 12, color: "#666", whiteSpace: "nowrap" }}>
                      Session Mode: <b>{activeSession.mode}</b>
                    </div>
                  </div>

                  {/* Objective (global feature slot) */}
                  <input
                    value={activeSession.objective}
                    onChange={(e) => updateSessionById(activeSession.id, { objective: e.target.value })}
                    placeholder="Meeting Objective (optional)"
                    style={{
                      width: "100%",
                      borderRadius: 12,
                      border: "1px solid #ddd",
                      padding: 12,
                      fontSize: 13,
                      marginBottom: 10,
                    }}
                  />

                  <div style={{ fontSize: 14, fontWeight: 800, color: "#444", marginBottom: 6 }}>
                    Raw Notes
                  </div>

                  <textarea
                    suppressHydrationWarning
                    value={activeSession.rawNotes}
                    onChange={(e) => updateSessionById(activeSession.id, { rawNotes: e.target.value })}
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
                    }}
                  />

                  <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 12, flexWrap: "wrap" }}>
                    {/* Generate */}
                    <button
                      onClick={() => handleGenerate(generateChoice)}
                      disabled={
                        !activeSession.rawNotes.trim() || isGenerating || !generateChoice
                      }
                      style={{
                        padding: "10px 14px",
                        borderRadius: 10,
                        border: "1px solid #111",
                        background: "#111",
                        color: "#fff",
                        fontWeight: 800,
                        opacity: activeSession.rawNotes.trim() && generateChoice ? 1 : 0.4,
                        cursor: activeSession.rawNotes.trim() && generateChoice ? "pointer" : "not-allowed",
                      }}
                    >
                      {isGenerating ? "Generating..." : "Generate"}
                    </button>

                    {/* Generate options */}
                    <select
                      value={generateChoice}
                      onChange={(e) => setGenerateChoice(e.target.value as GenerateChoice)}
                      disabled={isGenerating}
                      style={{
                        padding: "10px 12px",
                        borderRadius: 10,
                        border: "1px solid #ddd",
                        background: "#fff",
                        color: "#111",
                        cursor: isGenerating ? "not-allowed" : "pointer",
                      }}
                    >
                      <option value="" disabled>
                        Select Generate Options
                      </option>
                      <option value="all">Generate All Modes</option>
                      <option value="selected">Generate Selected Mode Only</option>
                    </select>

                    {/* Clear */}
                    <button
                      onClick={() => {
                        updateSessionById(activeSession.id, {
                          rawNotes: "",
                          objective: "",
                          outputs: { actionItems: "", summary: "", email: "" },
                        });
                      }}
                      style={{
                        padding: "10px 14px",
                        borderRadius: 10,
                        border: "1px solid #ddd",
                        background: "#fff",
                        color: "#111",
                        cursor: "pointer",
                        fontWeight: 800,
                      }}
                    >
                      Clear
                    </button>

                    {/* Pro mode + help */}
                    <label
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        marginLeft: 12,
                        fontSize: 12,
                        color: proMode ? "#666" : "#999",
                        cursor: "pointer",
                        position: "relative",
                        userSelect: "none",
                        fontWeight: 800,
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={mounted ? proMode : false}
                        onChange={(e) => setProMode(e.target.checked)}
                      />

                      <span>Pro Mode</span>

                      <button
                        ref={proHelpBtnRef}
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setShowProHelp((v) => !v);
                        }}
                        aria-label="What is Pro mode?"
                        style={{
                          width: 16,
                          height: 16,
                          borderRadius: 999,
                          border: "1px solid #bbb",
                          background: "#fff",
                          color: "#666",
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: 11,
                          lineHeight: "16px",
                          padding: 0,
                          cursor: "pointer",
                          fontWeight: 800,
                        }}
                      >
                        ?
                      </button>

                      {showProHelp && (
                        <div
                          ref={proHelpRef}
                          style={{
                            position: "absolute",
                            top: "100%",
                            left: 0,
                            marginTop: 6,
                            background: "#fff7cc",
                            border: "1px solid #e6d38a",
                            borderRadius: 8,
                            padding: "10px 12px",
                            fontSize: 12,
                            lineHeight: 1.4,
                            width: 260,
                            boxShadow: "0 6px 14px rgba(0,0,0,0.12)",
                            zIndex: 10,
                            transformOrigin: "top left",
                            animation: "proHelpIn 140ms ease-out",
                            fontWeight: 600,
                          }}
                        >
                          <div style={{ fontWeight: 900, marginBottom: 6 }}>
                            Pro Mode = Review + Cleanup Hints
                          </div>

                          <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
                            <li>
                              <b>Shows flags</b> beside action items (missing owner, missing date, vague wording)
                            </li>
                            <li>
                              Adds a <b>Checks</b> section at the bottom that summarizes what might need fixing
                            </li>
                            <li>
                              Best when you’re <b>still refining</b> notes before sharing
                            </li>
                          </ul>

                          <div style={{ marginTop: 8, opacity: 0.85 }}>
                            Turn it off when you want a <b>clean final output</b> with just the action items.
                          </div>
                        </div>
                      )}
                    </label>

                    <div style={{ fontSize: 12, color: "#666", whiteSpace: "nowrap", fontWeight: 800 }}>
                      View:{" "}
                      <b>
                        {viewMode === "action-items"
                          ? "Action Items"
                          : viewMode === "email"
                          ? "Email"
                          : "Summary"}
                      </b>
                    </div>
                  </div>
                </>
              )}
            </section>

            {/* Right: output */}
            <section>
              <div style={{ fontSize: 14, fontWeight: 800, color: "#444", marginBottom: 6 }}>
                Output
              </div>

              <div
                style={{
                  width: "100%",
                  minHeight: 260,
                  borderRadius: 12,
                  border: "1px solid #ddd",
                  padding: 12,
                  fontSize: 14,
                  lineHeight: 1.5,
                  whiteSpace: "pre-line",
                  background: "#fafafa",
                }}
              >
                {activeOutput ? activeOutput : "Click Generate to see results here."}
              </div>
            </section>
          </div>
        </div>
      )}
    </main>
  );
}