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

function buildMergedNotes(rawNotes: string, postMeetingNotes: string) {
  const raw = rawNotes.trim();
  const post = postMeetingNotes.trim();

  if (!post) return raw;

  return [raw, "", "## Post-Meeting Notes", post].join("\n");
}

function buildContextStats(rawNotes: string, mergedNotes: string): ContextStats {
  return {
    rawNotesChars: rawNotes.length,
    mergedNotesChars: mergedNotes.length,
  };
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const tier: Tier = asTier(body?.tier);
    const addOns: AddOns = asAddOns(body?.addOns);

    const rawNotes = String(body?.rawNotes ?? "");
    const postMeetingNotes = String(body?.postMeetingNotes ?? "");
    const mode: Mode = asMode(body?.mode);

    if (!rawNotes.trim() && !postMeetingNotes.trim()) {
      return NextResponse.json({ ok: false, error: "Missing rawNotes" }, { status: 400 });
    }

    const merged = buildMergedNotes(rawNotes, postMeetingNotes);
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