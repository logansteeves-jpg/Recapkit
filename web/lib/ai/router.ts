// web/lib/ai/router.ts
// Canonical routing logic for RecapKit AI tasks.
// This is spec-first and should remain stable.

import type { Tier, AddOns } from "@/lib/types/tier";
import type { ContextStats, NormalizerJson } from "@/lib/ai/tasks";

export type RouterTask = "A" | "B" | "C" | "D" | "E";

function hasEnhancedLogic(addOns: AddOns): boolean {
  return Boolean(addOns?.enhancedLogic);
}

export function getModelForTask(
  task: RouterTask,
  tier: Tier,
  addOns: AddOns,
  _stats?: ContextStats
): string {
  // If you want, we can later swap these strings to real provider model IDs.
  // For now they are your "routing decision outputs".

  // Free
  if (tier === "free") {
    if (task === "A") return "gpt-4.1-nano";
    if (task === "B") return "gpt-4.1-mini";
    if (task === "C") return "none";
    if (task === "D") return "none";
    if (task === "E") return "none";
  }

  // Basic
  if (tier === "basic") {
    if (task === "A") return "gpt-4.1-mini";
    if (task === "B") return "gpt-5-mini";
    if (task === "C") return "none";
    if (task === "D") return "gpt-4.1-mini";
    if (task === "E") return "gpt-5-mini";
  }

  // Premium
  if (tier === "premium") {
    if (task === "A") return "gpt-4.1-mini";
    if (task === "B") return "gpt-5-mini";
    if (task === "C") return "gpt-5.2";
    if (task === "D") return "gpt-5-mini";
    if (task === "E") return "gpt-5-mini";
  }

  // Pro
  if (tier === "pro") {
    if (task === "A") return "gpt-4.1-mini";
    if (task === "B") return "gpt-5-mini";
    if (task === "C") return "gpt-5.2";
    if (task === "D") return "gpt-5.2";
    if (task === "E") return "gpt-5.2";
  }

  // Fallback safety
  return "gpt-4.1-nano";
}

export function shouldRefine(params: {
  tier: Tier;
  addOns: AddOns;
  stats: ContextStats;
  normalizerJson?: NormalizerJson;
}): boolean {
  const { tier, addOns, stats, normalizerJson } = params;

  // Pro always refines where applicable
  if (tier === "pro") return true;

  // Enhanced Logic add-on forces refine behavior on Basic/Premium
  if (hasEnhancedLogic(addOns)) return true;

  // Premium can refine selectively
  if (tier === "premium") {
    const ambiguityCount = normalizerJson?.ambiguity_flags?.length ?? 0;

    // Simple thresholds (tune later)
    if (stats.mergedNotesChars > 9000) return true;
    if (ambiguityCount >= 3) return true;

    return false;
  }

  // Basic + Free: no refine by default
  return false;
}