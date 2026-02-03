// web/lib/types/tier.ts

export type Tier = "free" | "basic" | "premium" | "pro";

export type AddOn =
  | "enhancedLogic"
  | "aiTranscription"
  | "extraTranscriptionMinutes";

export type AddOns = {
  enhancedLogic?: boolean;
  aiTranscription?: boolean;
  extraTranscriptionMinutes?: boolean;
};