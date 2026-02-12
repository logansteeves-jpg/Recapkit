// web/app/api/generate/route.ts

import { NextResponse } from "next/server";
import {
  parseBullets,
  parseActionItems,
  detectActionIssues,
  formatActionItems,
  makeSummary,
} from "@/lib/recap";

import type { Tier, AddOns } from "@/lib/types/tier";
import { getModelForTask, shouldRefine } from "@/lib/ai/router";
import type { ContextStats } from "@/lib/ai/tasks";

type Mode = "current" | "past";

/* -------------------- tiny validators -------------------- */

function asMode(x: unknown): Mode {
  return x === "current" || x === "past" ? x : "past";
}

function asTier(x: unknown): Tier {
  return x === "free" || x === "basic" || x === "premium" || x === "pro" ? x : "free";
}

function asAddOns(x: unknown): AddOns {
  const obj = x && typeof x === "object" ? (x as Record<string, unknown>) : {};
  return {
    enhancedLogic: Boolean(obj.enhancedLogic),
    aiTranscription: Boolean(obj.aiTranscription),
    extraTranscriptionMinutes: Boolean(obj.extraTranscriptionMinutes),
  };
}

function cleanStr(x: unknown) {
  return String(x ?? "").trim();
}

/* -------------------- merge helpers -------------------- */

function buildMergedNotes(params: {
  rawNotes: string;
  postMeetingNotes: string;
  meetingOutcome: string;
}) {
  const raw = params.rawNotes.trim();
  const post = params.postMeetingNotes.trim();
  const outcome = params.meetingOutcome.trim();

  const parts: string[] = [];

  if (raw) parts.push(raw);

  if (post) {
    parts.push("", "## Post-Meeting Notes", post);
  }

  // IMPORTANT: This is what makes “Incorporate Into Outputs” actually change the results.
  if (outcome) {
    parts.push("", "## Meeting Outcome", outcome);
  }

  return parts.join("\n");
}

function buildContextStats(rawNotes: string, mergedNotes: string): ContextStats {
  return {
    rawNotesChars: rawNotes.length,
    mergedNotesChars: mergedNotes.length,
  };
}

/* -------------------- route -------------------- */

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const tier: Tier = asTier(body?.tier);
    const addOns: AddOns = asAddOns(body?.addOns);

    const rawNotes = cleanStr(body?.rawNotes);
    const postMeetingNotes = cleanStr(body?.postMeetingNotes);
    const meetingOutcome = cleanStr(body?.meetingOutcome);

    const mode: Mode = asMode(body?.mode);

    if (!rawNotes && !postMeetingNotes && !meetingOutcome) {
      return NextResponse.json(
        { ok: false, error: "Missing input: provide rawNotes, postMeetingNotes, or meetingOutcome." },
        { status: 400 }
      );
    }

    // Simple safety guard so someone can’t paste a novel and freeze the app.
    const merged = buildMergedNotes({ rawNotes, postMeetingNotes, meetingOutcome });
    const MAX_MERGED_CHARS = 50_000;
    if (merged.length > MAX_MERGED_CHARS) {
      return NextResponse.json(
        { ok: false, error: `Notes too large (${merged.length} chars). Please shorten and try again.` },
        { status: 413 }
      );
    }

    const stats = buildContextStats(rawNotes, merged);

    // Phase 1: deterministic parsing (AI not integrated yet)
    const bullets = parseBullets(merged);
    const items = parseActionItems(bullets);
    const issues = detectActionIssues(items);

    const summary = makeSummary(bullets);
    const actionItems = formatActionItems(items, issues);

    // Email is intentionally blank here - follow-up route owns email generation.
    const email = "";

    // Router hooks (choose models + refine decision; do not execute AI yet)
    const modelForNormalizer = getModelForTask("A", tier, addOns, stats);
    const modelForCoreOutputs = getModelForTask("B", tier, addOns, stats);

    const refine = shouldRefine({
      tier,
      addOns,
      stats,
      normalizerJson: undefined,
    });

    return NextResponse.json({
      ok: true,
      outputs: { summary, actionItems, email },
      debug: {
        mode,
        tier,
        addOns,
        stats,
        modelForNormalizer,
        modelForCoreOutputs,
        refine,
      },
    });
  } catch (err) {
    console.error("Generate API error:", err);
    return NextResponse.json({ ok: false, error: "Failed to generate outputs" }, { status: 500 });
  }
}