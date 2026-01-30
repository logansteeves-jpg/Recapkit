// web/app/api/generate/route.ts

import { NextResponse } from "next/server";
import {
  parseBullets,
  parseActionItems,
  detectActionIssues,
  formatActionItems,
  makeSummary,
} from "@/lib/recap";

type Mode = "current" | "past";

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const rawNotes = String(body?.rawNotes ?? "");
    const postMeetingNotes = String(body?.postMeetingNotes ?? "");
    const mode = (body?.mode ?? "past") as Mode;

    if (mode !== "current" && mode !== "past") {
      return NextResponse.json({ ok: false, error: "Invalid mode" }, { status: 400 });
    }

    if (!rawNotes.trim() && !postMeetingNotes.trim()) {
      return NextResponse.json({ ok: false, error: "Missing rawNotes" }, { status: 400 });
    }

    const merged = postMeetingNotes.trim()
      ? `${rawNotes}\n\nPost-Meeting Notes:\n${postMeetingNotes.trim()}`
      : rawNotes;

    const bullets = parseBullets(merged);
    const items = parseActionItems(bullets);
    const issues = detectActionIssues(items);

    const summary = makeSummary(bullets);
    const actionItems = formatActionItems(items, issues);

    // Email is NOT generated here anymore (follow-up route owns that)
    const email = "";

    return NextResponse.json({
      ok: true,
      outputs: { summary, actionItems, email },
    });
  } catch (err) {
    console.error("Generate API error:", err);
    return NextResponse.json({ ok: false, error: "Failed to generate outputs" }, { status: 500 });
  }
}