"use client";

import Link from "next/link";
import { useMemo, useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";

import { loadSessions, saveSessions, addFollowUpToSession, type Session } from "@/lib/sessionStore";

function toOne(param: string | string[] | undefined): string | null {
  if (!param) return null;
  return Array.isArray(param) ? param[0] : param;
}

function findSession(sessions: Session[], sessionId: string): Session | null {
  return sessions.find((s) => s.id === sessionId) ?? null;
}

async function safeCopy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    console.warn("Clipboard copy failed");
  }
}

function fmt(ts?: number) {
  if (!ts) return "";
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return "";
  }
}

export default function PastMeetingPage() {
  const router = useRouter();
  const params = useParams() as { sessionId?: string | string[] };
  const sessionId = toOne(params.sessionId);

  const [sessions, setSessions] = useState<Session[]>([]);
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    const loaded = loadSessions();
    setSessions(loaded);
    setIsHydrated(true);
  }, []);

  const session = useMemo(() => {
    if (!sessionId) return null;
    return findSession(sessions, sessionId);
  }, [sessions, sessionId]);

  function persist(nextSessions: Session[]) {
    setSessions(nextSessions);
    saveSessions(nextSessions);
  }

  function save(updatedSession: Session) {
    const next = sessions.map((x) =>
      x.id === updatedSession.id ? { ...updatedSession, updatedAt: Date.now() } : x
    );
    persist(next);
  }

  function createFollowUp() {
    if (!session) return;

    const count = Array.isArray(session.followUps) ? session.followUps.length : 0;

    const updated = addFollowUpToSession(session, {
      title: `Follow-Up ${count + 1}`,
    });

    // Persist first (prevents “I navigated and nothing saved”)
    save(updated);

    const newId = updated.followUps?.[updated.followUps.length - 1]?.id;
    if (newId) {
      router.push(`/session/${updated.id}/follow-up/${newId}`);
    }
  }

  /* -------------------- guards -------------------- */

  if (!isHydrated) {
    return <div style={{ padding: 20 }}>Loading...</div>;
  }

  if (!sessionId) {
    return (
      <div style={{ padding: 20 }}>
        <p>Missing route params.</p>
        <Link href="/">Back home</Link>
      </div>
    );
  }

  if (!session) {
    return (
      <div style={{ padding: 20 }}>
        <p>Session not found.</p>
        <Link href="/">Back home</Link>
      </div>
    );
  }

  if (session.mode !== "past") {
    return (
      <div style={{ padding: 20 }}>
        <p>This page is only for Past Meetings.</p>
        <Link href="/">Back home</Link>
      </div>
    );
  }

  const s = session;
  const followUps = Array.isArray(s.followUps) ? s.followUps : [];

  const meetingResult = s.pastMeta?.meetingResult ?? "Pending";
  const meetingOutcome = String(s.pastMeta?.meetingOutcome ?? "");
  const postMeetingNotes = String((s as any).postMeetingNotes ?? "");

  return (
    <div style={{ padding: 18, maxWidth: 1180, margin: "0 auto" }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <Link href="/" style={{ padding: "8px 12px", border: "1px solid #ddd", borderRadius: 8 }}>
          Back Home
        </Link>

        <div style={{ flex: 1 }} />

        <div style={{ fontSize: 12, opacity: 0.7 }}>
          Past Meeting: <b>{s.title}</b>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 360px", gap: 14, marginTop: 14 }}>
        {/* Left column */}
        <section style={{ border: "1px solid #eee", borderRadius: 12, padding: 14 }}>
          <h3 style={{ marginTop: 0 }}>Outputs</h3>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h4 style={{ marginBottom: 8 }}>Summary</h4>
            <button onClick={() => safeCopy(s.outputs.summary)} style={{ padding: "6px 10px" }}>
              Copy
            </button>
          </div>
          <pre style={{ whiteSpace: "pre-wrap", border: "1px solid #eee", borderRadius: 10, padding: 10, marginTop: 0 }}>
            {s.outputs.summary || "(No summary yet)"}
          </pre>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12 }}>
            <h4 style={{ marginBottom: 8 }}>Action Items</h4>
            <button onClick={() => safeCopy(s.outputs.actionItems)} style={{ padding: "6px 10px" }}>
              Copy
            </button>
          </div>
          <pre style={{ whiteSpace: "pre-wrap", border: "1px solid #eee", borderRadius: 10, padding: 10, marginTop: 0 }}>
            {s.outputs.actionItems || "(No action items yet)"}
          </pre>

          {/* QC Context: show post-meeting + outcome so you can verify behavior */}
          <div style={{ marginTop: 14, borderTop: "1px solid #eee", paddingTop: 12 }}>
            <h3 style={{ marginTop: 0 }}>QC Context</h3>

            <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 6 }}>Post-Meeting Notes</div>
            <pre style={{ whiteSpace: "pre-wrap", border: "1px solid #eee", borderRadius: 10, padding: 10, marginTop: 0 }}>
              {postMeetingNotes || "(None)"}
            </pre>

            <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 10 }}>
              <div style={{ fontSize: 12, opacity: 0.7 }}>
                Meeting Result: <b>{String(meetingResult)}</b>
              </div>
            </div>

            <div style={{ fontSize: 12, opacity: 0.7, marginTop: 10, marginBottom: 6 }}>Meeting Outcome</div>
            <pre style={{ whiteSpace: "pre-wrap", border: "1px solid #eee", borderRadius: 10, padding: 10, marginTop: 0 }}>
              {meetingOutcome || "(None)"}
            </pre>

            <div style={{ fontSize: 12, opacity: 0.65, marginTop: 8 }}>
              Note: Right now this page is QC-only for these fields. We’ll wire “incorporate into summary/action items” next.
            </div>
          </div>
        </section>

        {/* Right column */}
        <aside style={{ border: "1px solid #eee", borderRadius: 12, padding: 14, height: "fit-content" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
            <h3 style={{ marginTop: 0, marginBottom: 0 }}>Follow-Ups</h3>
            <button
              onClick={createFollowUp}
              style={{
                padding: "8px 10px",
                borderRadius: 10,
                border: "1px solid #ddd",
                background: "#fff",
                cursor: "pointer",
                fontWeight: 800,
              }}
            >
              + New Follow-Up
            </button>
          </div>

          {followUps.length === 0 ? (
            <div style={{ opacity: 0.7, marginTop: 10 }}>(No follow-ups yet)</div>
          ) : (
            <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
              {followUps
                .slice()
                .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
                .map((fu) => {
                  const status = fu.status ?? "open";
                  const isClosed = status === "closed";
                  return (
                    <Link
                      key={fu.id}
                      href={`/session/${s.id}/follow-up/${fu.id}`}
                      style={{
                        border: "1px solid #eee",
                        borderRadius: 10,
                        padding: 10,
                        textDecoration: "none",
                        color: "inherit",
                        background: "#fff",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                        <div style={{ fontWeight: 800 }}>{fu.title}</div>
                        <div
                          style={{
                            fontSize: 11,
                            padding: "3px 8px",
                            borderRadius: 999,
                            border: "1px solid #ddd",
                            opacity: 0.9,
                          }}
                        >
                          {isClosed ? "Completed" : "Open"}
                        </div>
                      </div>

                      <div style={{ fontSize: 12, opacity: 0.7, marginTop: 6 }}>
                        Last updated: {fmt(fu.updatedAt ?? s.updatedAt)}
                      </div>
                    </Link>
                  );
                })}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}