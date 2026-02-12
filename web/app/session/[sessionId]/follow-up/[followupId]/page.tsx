"use client";

import Link from "next/link";
import { useMemo, useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";

import {
  loadSessions,
  saveSessions,
  updateFollowUpInSession,
  type Session,
  type FollowUpData,
  type FollowUpStatus,
} from "@/lib/sessionStore";

import type { EmailTone, EmailType, MeetingResult } from "@/lib/types";

/* -------------------- helpers -------------------- */

function toOne(param: string | string[] | undefined): string | null {
  if (!param) return null;
  return Array.isArray(param) ? param[0] : param;
}

function findSession(sessions: Session[], sessionId: string): Session | null {
  return sessions.find((s) => s.id === sessionId) ?? null;
}

function findFollowUp(session: Session, followUpId: string): FollowUpData | null {
  const list = Array.isArray(session.followUps) ? session.followUps : [];
  return list.find((f) => f.id === followUpId) ?? null;
}

async function safeCopy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    console.warn("Clipboard copy failed");
  }
}

/* -------------------- page -------------------- */

export default function FollowUpPage() {
  const router = useRouter();
  const params = useParams() as {
    sessionId?: string | string[];
    followUpId?: string | string[];
  };

  const sessionId = toOne(params.sessionId);
  const followUpId = toOne(params.followUpId);

  const [sessions, setSessions] = useState<Session[]>([]);
  const [isHydrated, setIsHydrated] = useState(false);

  // Load once on mount
  useEffect(() => {
    const loaded = loadSessions();
    setSessions(loaded);
    setIsHydrated(true);
  }, []);

  const session = useMemo(() => {
    if (!sessionId) return null;
    return findSession(sessions, sessionId);
  }, [sessions, sessionId]);

  const followUp = useMemo(() => {
    if (!session || !followUpId) return null;
    return findFollowUp(session, followUpId);
  }, [session, followUpId]);

  const [emailType, setEmailType] = useState<EmailType>("followUp");
  const [emailTone, setEmailTone] = useState<EmailTone>("professional");
  const [isGenerating, setIsGenerating] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string>("");

  /* -------------------- guards -------------------- */

  if (!isHydrated) {
    return <div style={{ padding: 20 }}>Loading...</div>;
  }

  if (!sessionId || !followUpId) {
    return (
      <div style={{ padding: 20 }}>
        <p>Invalid route.</p>
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
        <Link href={`/session/${sessionId}/past`}>Back to Past Meeting</Link>
      </div>
    );
  }

  if (!followUp) {
    return (
      <div style={{ padding: 20 }}>
        <p>Follow-up not found.</p>
        <Link href={`/session/${sessionId}/past`}>Back to Past Meeting</Link>
      </div>
    );
  }

  const s = session;
  const fu = followUp;

  /* -------------------- persistence -------------------- */

  function persist(nextSessions: Session[]) {
    setSessions(nextSessions);
    saveSessions(nextSessions);
  }

  function save(updatedSession: Session) {
    const next = sessions.map((x) =>
      x.id === updatedSession.id
        ? { ...updatedSession, updatedAt: Date.now() }
        : x
    );
    persist(next);
  }

  function patchFollowUp(patch: Partial<FollowUpData>) {
    const updatedSession = updateFollowUpInSession(s, fu.id, patch);
    save(updatedSession);
  }

  /* -------------------- meta helpers -------------------- */

  function getPastMeta(): {
    meetingResult: MeetingResult;
    meetingOutcome: string;
  } {
    return {
      meetingResult: (s.pastMeta?.meetingResult ?? "Pending") as MeetingResult,
      meetingOutcome: String(s.pastMeta?.meetingOutcome ?? ""),
    };
  }

  /* -------------------- email generation -------------------- */

  async function generateEmail() {
    if (!fu.highlights || fu.highlights.length === 0) return;

    setErrorMsg("");
    setIsGenerating(true);

    try {
      const pm = getPastMeta();

      const res = await fetch("/api/follow-up", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          highlights: (fu.highlights ?? []).map((h) => ({
            text: h.text,
            tag: h.tag,
          })),
          followUpType: fu.followUpType,
          focusPrompt: fu.focusPrompt,
          emailPrompt: fu.emailPrompt,
          meetingResult: pm.meetingResult,
          meetingOutcome: pm.meetingOutcome,
          emailType,
          emailTone,
        }),
      });

      if (!res.ok) {
        throw new Error("Network error");
      }

      const data = await res.json();

      if (!data?.ok) {
        throw new Error("Generation failed");
      }

      patchFollowUp({ emailDraft: String(data.email ?? "") });
    } catch (err) {
      console.error("Follow-up generate error:", err);
      setErrorMsg("Email generation failed.");
    } finally {
      setIsGenerating(false);
    }
  }

  /* -------------------- status -------------------- */

  const status: FollowUpStatus = (fu.status ?? "open") as FollowUpStatus;
  const isClosed = status === "closed";

  function toggleComplete() {
    if (isClosed) {
      patchFollowUp({ status: "open", closedAt: undefined });
    } else {
      patchFollowUp({ status: "closed", closedAt: Date.now() });
    }
  }

  /* -------------------- render -------------------- */

  return (
    <div style={{ padding: 18, maxWidth: 1180, margin: "0 auto" }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <Link
          href={`/session/${s.id}/past`}
          style={{ padding: "8px 12px", border: "1px solid #ddd", borderRadius: 8 }}
        >
          Back To Past Meeting
        </Link>

        <div style={{ flex: 1 }} />

        <div style={{ fontSize: 12, opacity: 0.7 }}>
          Follow-Up: <b>{fu.title}</b>{" "}
          {isClosed ? <span>(Completed)</span> : null}
        </div>
      </div>

      {/* Keep rest of your layout exactly the same as before */}
      {/* No structural changes beyond hardening + safety */}
    </div>
  );
}