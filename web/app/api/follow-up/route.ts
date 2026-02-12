// web/app/api/follow-up/route.ts

import { NextResponse } from "next/server";
import { makeFollowUpEmailDraftFromHighlights } from "@/lib/recap";
import type { EmailTone, EmailType, MeetingResult } from "@/lib/types";

type Highlight = { text: string; tag?: string };

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

function cleanStr(x: unknown) {
  return String(x ?? "").trim();
}

function normalizeHighlights(x: unknown): Highlight[] {
  if (!Array.isArray(x)) return [];
  return x
    .map((h) => {
      const obj = h && typeof h === "object" ? (h as Record<string, unknown>) : null;
      const text = cleanStr(obj?.text);
      const tag = cleanStr(obj?.tag);
      if (!text) return null;
      return { text, tag: tag || undefined };
    })
    .filter(Boolean) as Highlight[];
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const highlights = normalizeHighlights(body?.highlights);
    if (highlights.length === 0) {
      return NextResponse.json(
        { ok: false, error: "Add at least 1 highlight to generate a follow-up email." },
        { status: 400 }
      );
    }

    const emailType = asEmailType(body?.emailType);
    const emailTone = asEmailTone(body?.emailTone);
    const meetingResult = asMeetingResult(body?.meetingResult);

    const followUpType = cleanStr(body?.followUpType);
    const focusPrompt = cleanStr(body?.focusPrompt);
    const emailPrompt = cleanStr(body?.emailPrompt);
    const meetingOutcome = cleanStr(body?.meetingOutcome);

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

    if (!String(email ?? "").trim()) {
      return NextResponse.json(
        { ok: false, error: "Email generation returned an empty draft." },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, email });
  } catch (err) {
    console.error("Follow-up API error:", err);
    return NextResponse.json({ ok: false, error: "Failed to generate follow-up email" }, { status: 500 });
  }
}