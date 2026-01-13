"use client";

import { useEffect, useRef, useState } from "react";
import {
  toBullets,
  parseActionItems,
  detectActionIssues,
  formatActionItems,
} from "../lib/recap";

type Mode = "action-items" | "summary" | "email";
type Outputs = { actionItems: string; summary: string; email: string };

function modeToKey(mode: Mode): keyof Outputs {
  return mode === "action-items" ? "actionItems" : mode;
}

export default function Page() {
  const [notes, setNotes] = useState("");
  const [mode, setMode] = useState<Mode>("action-items");

  const [outputs, setOutputs] = useState<Outputs>({
    actionItems: "",
    summary: "",
    email: "",
  });

  const activeOutput =
    mode === "action-items"
      ? outputs.actionItems
      : mode === "summary"
      ? outputs.summary
      : outputs.email;

  const [isGenerating, setIsGenerating] = useState(false);

  // Pro mode (hydration-safe)
  const [proMode, setProMode] = useState(false);
  const [mounted, setMounted] = useState(false);

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

  function handleGenerate() {
    setIsGenerating(true);

    // clear only the active tab output
    setOutputs((prev) => ({
      ...prev,
      actionItems: mode === "action-items" ? "" : prev.actionItems,
      summary: mode === "summary" ? "" : prev.summary,
      email: mode === "email" ? "" : prev.email,
    }));

    setTimeout(() => {
      try {
        const bullets = toBullets(notes);

        if (bullets.length === 0) {
          const msg =
            "No notes provided. Paste meeting notes into Raw notes, then click Generate.";
          setOutputs((prev) => ({
            ...prev,
            [modeToKey(mode)]: msg,
          }));
          setIsGenerating(false);
          return;
        }

        if (mode === "summary") {
          const first = bullets[0] ?? "Meeting notes provided.";
          const restCount = Math.max(0, bullets.length - 1);

          const out =
            `Summary:\n\n${first}\n\nOther topics discussed:\n` +
            bullets
              .slice(1)
              .map((b) => `- ${b}`)
              .join("\n") +
            `\n\n(${restCount} additional point${restCount === 1 ? "" : "s"})`;

          setOutputs((prev) => ({ ...prev, summary: out }));
          setIsGenerating(false);
          return;
        }

        if (mode === "email") {
          const subject = "Follow-up from our meeting";
          const bodyLines = bullets.slice(0, 6).map((b) => `- ${b}`);

          const out =
            `Email Draft:\n\n` +
            `Subject: ${subject}\n\n` +
            `Hi,\n\n` +
            `Here are the key points from our discussion:\n\n` +
            bodyLines.join("\n") +
            `\n\nLet me know if you have questions.\n\nThanks,`;

          setOutputs((prev) => ({ ...prev, email: out }));
          setIsGenerating(false);
          return;
        }

        // action-items
        const items = parseActionItems(bullets);
        const issues = detectActionIssues(items);
        const out = formatActionItems(items, issues, proMode);

        setOutputs((prev) => ({ ...prev, actionItems: out }));
        setIsGenerating(false);
      } catch (e) {
        const out = `Error generating output: ${String(e)}`;
        setOutputs((prev) => ({
          ...prev,
          [modeToKey(mode)]: out,
        }));
        setIsGenerating(false);
      }
    }, 400);
  }

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
            maxWidth: 920,
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
              Meeting notes -&gt; recap -&gt; action items
            </div>
          </div>

          {/* Mode toggle */}
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={() => setMode("action-items")}
              style={{
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid #ddd",
                background: mode === "action-items" ? "#111" : "#fff",
                color: mode === "action-items" ? "#fff" : "#111",
                cursor: "pointer",
              }}
            >
              Action Items
            </button>

            <button
              onClick={() => setMode("summary")}
              style={{
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid #ddd",
                background: mode === "summary" ? "#111" : "#fff",
                color: mode === "summary" ? "#fff" : "#111",
                cursor: "pointer",
              }}
            >
              Summary
            </button>

            <button
              onClick={() => setMode("email")}
              style={{
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid #ddd",
                background: mode === "email" ? "#111" : "#fff",
                color: mode === "email" ? "#fff" : "#111",
                cursor: "pointer",
              }}
            >
              Email Draft
            </button>
          </div>
        </div>
      </header>

      {/* Body */}
      <div style={{ maxWidth: 920, margin: "0 auto", padding: "18px 16px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          {/* Left: input */}
          <section>
            <div style={{ fontSize: 14, fontWeight: 600, color: "#444", marginBottom: 6 }}>
              Raw notes
            </div>

            <textarea
              suppressHydrationWarning
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
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

            <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 12 }}>
              <button
                onClick={handleGenerate}
                disabled={!notes.trim() || isGenerating}
                style={{
                  padding: "10px 14px",
                  borderRadius: 10,
                  border: "1px solid #111",
                  background: "#111",
                  color: "#fff",
                  fontWeight: 600,
                  opacity: notes.trim() ? 1 : 0.4,
                  cursor: notes.trim() ? "pointer" : "not-allowed",
                }}
              >
                {isGenerating ? "Generating..." : "Generate"}
              </button>

              <button
                onClick={() => {
                  setNotes("");
                  setOutputs({ actionItems: "", summary: "", email: "" });
                }}
                style={{
                  padding: "10px 14px",
                  borderRadius: 10,
                  border: "1px solid #ddd",
                  background: "#fff",
                  color: "#111",
                  cursor: "pointer",
                }}
              >
                Clear
              </button>

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
                }}
              >
                <input
                  type="checkbox"
                  checked={mounted ? proMode : false}
                  onChange={(e) => setProMode(e.target.checked)}
                />

                <span>Pro mode</span>

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
                    }}
                  >
                    <div style={{ fontWeight: 700, marginBottom: 6 }}>
                      Pro mode = Review + Cleanup Hints
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

              <div style={{ fontSize: 12, color: "#666" }}>
                Mode:{" "}
                <b>
                  {mode === "action-items"
                    ? "Action Items"
                    : mode === "email"
                    ? "Email Draft"
                    : "Summary"}
                </b>
              </div>
            </div>
          </section>

          {/* Right: output */}
          <section>
            <div style={{ fontSize: 14, fontWeight: 600, color: "#444", marginBottom: 6 }}>
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
    </main>
  );
}
