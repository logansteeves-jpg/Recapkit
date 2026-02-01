// web/app/api/follow-up/route.ts

import { NextResponse } from "next/server";
import { makeFollowUpEmailDraftFromHighlights } from "@/lib/recap";
import type { EmailTone, EmailType, MeetingResult } from "@/lib/types";

type Highlight = { text: string; tag?: string };

/* -------------------- validation helpers -------------------- */

const EMAIL_TYPES: EmailType[] = [
  "followUp",
  "question",
  "actionComplete",
  "actionClarification",
  "concern",
];

const EMAIL_TONES: EmailTone[] = ["professional", "warm", "friendlyProfessional", "casual"];

const MEETING_RESULTS: MeetingResult[] = [
  "Completed",
  "No Show",
  "Rescheduled",
  "Cancelled",
  "Blocked",
  "Pending",
];

function asEmailType(x: unknown): EmailType {
  return EMAIL_TYPES.includes(x as EmailType) ? (x as EmailType) : "followUp";
}

function asEmailTone(x: unknown): EmailTone {
  return EMAIL_TONES.includes(x as EmailTone) ? (x as EmailTone) : "professional";
}

function asMeetingResult(x: unknown): MeetingResult {
  return MEETING_RESULTS.includes(x as MeetingResult) ? (x as MeetingResult) : "Pending";
}

/* -------------------- route -------------------- */

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const highlights: Highlight[] = Array.isArray(body?.highlights) ? body.highlights : [];

    const followUpType = String(body?.followUpType ?? "").trim();
    const focusPrompt = String(body?.focusPrompt ?? "").trim();
    const emailPrompt = String(body?.emailPrompt ?? "").trim();
    const meetingOutcome = String(body?.meetingOutcome ?? "").trim();

    const meetingResult = asMeetingResult(body?.meetingResult);
    const emailType = asEmailType(body?.emailType);
    const emailTone = asEmailTone(body?.emailTone);

    const email = makeFollowUpEmailDraftFromHighlights({
      highlights,
      followUpType,
      focusPrompt,
      emailPrompt,
      meetingResult,
      meetingOutcome,
      emailType,
      emailTone,
    });

    return NextResponse.json({ ok: true, email });
  } catch (err) {
    console.error("Follow-up API error:", err);
    return NextResponse.json(
      { ok: false, error: "Failed to generate follow-up email" },
      { status: 400 }
    );
  }
}