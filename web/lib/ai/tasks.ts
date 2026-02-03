// web/lib/ai/tasks.ts
// Task contracts for the AI router. These are spec-first and should remain stable.

export type AITask = "A_NORMALIZE" | "B_CORE_OUTPUTS" | "C_REFINE" | "D_TRANSCRIPT_POLISH" | "E_FOLLOW_UP_EMAIL";

/**
 * Context stats used for routing decisions (refine thresholds, etc).
 * These can be estimated without OpenAI by using string lengths.
 */
export type ContextStats = {
  rawNotesChars: number;
  mergedNotesChars: number;
  highlightsCount?: number;
};

export type NormalizerJson = {
  meeting_objective?: string;
  topics?: string[];
  decisions?: string[];
  action_item_candidates?: string[];
  dates_mentioned?: string[];
  attendees?: string[];
  blockers_risks?: string[];
  open_questions?: string[];
  ambiguity_flags?: string[];
};

export type CoreOutputs = {
  summary: string;
  actionItems: string;
  // Email is intentionally blank in /api/generate by design.
  email?: string;
};

export type FollowUpEmailOutput = {
  email: string;
};