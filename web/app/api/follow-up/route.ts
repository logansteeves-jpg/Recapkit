// web/app/api/follow-up/route.ts

import { NextResponse } from "next/server";
import { makeFollowUpEmailDraftFromHighlights } from "@/lib/recap";

type EmailType =
  | "followUp"
  | "question"
  | "actionComplete"
  | "actionClarification"
  | "concern";

type EmailTone = "professional" | "warm" | "friendlyProfessional" | "casual";

type Highlight = { text: string; tag?: string };

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const highlights: Highlight[] = Array.isArray(body?.highlights) ? body.highlights : [];

    const followUpType = String(body?.followUpType ?? "");
    const focusPrompt = String(body?.focusPrompt ?? "");
    const emailPrompt = String(body?.emailPrompt ?? "");
    const meetingResult = String(body?.meetingResult ?? "");
    const meetingOutcome = String(body?.meetingOutcome ?? "");

    const emailType = (body?.emailType ?? "followUp") as EmailType;
    const emailTone = (body?.emailTone ?? "professional") as EmailTone;

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

    return NextResponse.json({
      ok: true,
      email,
    });
  } catch (err) {
    console.error("Follow-up API error:", err);
    return NextResponse.json(
      { ok: false, error: "Failed to generate follow-up email" },
      { status: 400 }
    );
  }
}