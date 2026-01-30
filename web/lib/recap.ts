// web/lib/recap.ts
// Deterministic, local-only recap helpers (Phase 1).
// Summary + Action Items are generated via /api/generate using these functions.
// Follow-Up email drafts are generated via /api/generate/follow-up using makeFollowUpEmailDraftFromHighlights.

export type ActionItem = {
  text: string; // the action itself (cleaned)
  owner?: string; // best guess
  due?: string; // best guess
  notes?: string; // extra instruction like "contact Jackie when done"
};

export type ActionIssue = {
  type: "missingOwner" | "missingDueDate" | "vague";
  message: string;
};

export type EmailType =
  | "followUp"
  | "question"
  | "actionComplete"
  | "actionClarification"
  | "concern";

export type EmailTone = "professional" | "warm" | "friendlyProfessional" | "casual";

export type MakeEmailDraftOptions = {
  type?: EmailType;
  tone?: EmailTone;

  /**
   * Optional: override the Subject line (Follow-Up Planner can set this).
   */
  subjectOverride?: string;

  /**
   * Optional: extra context lines to include above the bullet list (Follow-Up Planner).
   * Example lines: ["Follow-Up Type: Phone Call", "Meeting Result: Rescheduled", "Focus: ..."]
   */
  contextLines?: string[];

  /**
   * Optional: the bullet limit (defaults to 6 to preserve existing behavior).
   */
  maxBullets?: number;
};

function normalizeLines(raw: string): string[] {
  return raw
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

function safeString(x: any): string {
  return typeof x === "string" ? x : String(x ?? "");
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function includesWord(haystackLower: string, wordLower: string): boolean {
  // exact word boundary match (prevents "call" matching "callback", etc.)
  const re = new RegExp(`\\b${escapeRegExp(wordLower)}\\b`, "i");
  return re.test(haystackLower);
}

export function parseBullets(rawNotes: string): string[] {
  const lines = normalizeLines(rawNotes);

  // Treat any line as a "bullet" for now. (Later: timestamps + quick marks)
  return lines.map((l) => {
    // Strip leading bullet markers like "-", "*", "•", "1.", "1)", etc.
    return l.replace(/^(\*|-|•|\d+[.)])\s+/, "").trim();
  });
}

// Very simple placeholder extraction: find lines that look like actions
export function parseActionItems(bullets: string[]): ActionItem[] {
  // Phrase-based verbs can use includes; single-word verbs should use word boundaries.
  const phraseVerbs = ["follow up", "touch base"]; // keep as phrases
  const singleWordVerbs = [
    "send",
    "share",
    "schedule",
    "book",
    "confirm",
    "review",
    "update",
    "fix",
    "create",
    "ship",
    "deliver",
    "email",
    "call",
    "contact",
  ];

  function extractDue(text: string): string | undefined {
    const lower = text.toLowerCase();

    // explicit ISO date
    const iso = text.match(/\b\d{4}-\d{2}-\d{2}\b/);
    if (iso) return iso[0];

    // simple relative tokens
    const dueTokens = ["today", "tomorrow", "this week", "next week", "end of day", "eod", "eow"];
    for (const t of dueTokens) {
      if (lower.includes(t)) return t;
    }

    // weekday mention
    const weekday = text.match(/\b(mon|tue|wed|thu|fri|sat|sun)(day)?\b/i);
    if (weekday) return weekday[0];

    return undefined;
  }

  function extractOwner(text: string): string | undefined {
    // @name
    const at = text.match(/@([a-zA-Z0-9_]+)/);
    if (at) return at[1];

    const lower = text.toLowerCase();

    // "owner: Logan"
    const ownerTag = text.match(/\bowner:\s*([a-zA-Z][a-zA-Z\s'.-]{1,40})/i);
    if (ownerTag) return ownerTag[1].trim();

    // "assigned to Mike"
    const assigned = text.match(/\bassigned to\s*([a-zA-Z][a-zA-Z\s'.-]{1,40})/i);
    if (assigned) return assigned[1].trim();

    // "Logan will ..."
    const will = text.match(/^([A-Z][a-zA-Z'.-]{1,20})\s+will\b/);
    if (will) return will[1].trim();

    // fallback: "I will" / "We will" (word-boundary-ish)
    if (/\bi will\b/i.test(lower)) return "Me";
    if (/\bwe will\b/i.test(lower)) return "We";

    return undefined;
  }

  function extractNotes(original: string): string | undefined {
    // Anything after " - " becomes notes
    const dashSplit = original.split(" - ");
    if (dashSplit.length > 1) return dashSplit.slice(1).join(" - ").trim();

    // "note: ..."
    const noteTag = original.match(/\bnote:\s*(.+)$/i);
    if (noteTag) return noteTag[1].trim();

    // parenthetical notes at end: "(...)".
    const paren = original.match(/\(([^)]+)\)\s*$/);
    if (paren) return paren[1].trim();

    return undefined;
  }

  return bullets
    .filter((b) => {
      const lower = b.toLowerCase();

      // phrase verbs
      if (phraseVerbs.some((v) => lower.includes(v))) return true;

      // single-word verbs as whole words
      return singleWordVerbs.some((v) => includesWord(lower, v));
    })
    .map((b) => {
      const cleaned = b.trim();
      return {
        text: cleaned,
        owner: extractOwner(cleaned),
        due: extractDue(cleaned),
        notes: extractNotes(cleaned),
      };
    });
}

export function detectActionIssues(items: ActionItem[]): ActionIssue[] {
  const issues: ActionIssue[] = [];

  for (const item of items) {
    const textLower = item.text.toLowerCase();

    // Prefer extracted signals first, fallback to text heuristics
    const hasOwner =
      Boolean(item.owner) ||
      textLower.includes("@") ||
      textLower.includes("owner:") ||
      textLower.includes("assigned to") ||
      /\bi will\b/i.test(textLower) ||
      /\bwe will\b/i.test(textLower);

    const hasDue =
      Boolean(item.due) ||
      textLower.includes("today") ||
      textLower.includes("tomorrow") ||
      textLower.includes("next week") ||
      /\b(mon|tue|wed|thu|fri|sat|sun)\b/i.test(item.text) ||
      /\b\d{4}-\d{2}-\d{2}\b/.test(item.text);

    const vague =
      item.text.length < 20 ||
      textLower.includes("look into") ||
      textLower.includes("check on") ||
      textLower.includes("touch base");

    if (!hasOwner) {
      issues.push({
        type: "missingOwner",
        message: `Missing owner: "${item.text}"`,
      });
    }

    if (!hasDue) {
      issues.push({
        type: "missingDueDate",
        message: `Missing due date: "${item.text}"`,
      });
    }

    if (vague) {
      issues.push({
        type: "vague",
        message: `Possibly vague: "${item.text}"`,
      });
    }
  }

  return issues;
}

/**
 * Backward-compatible signature:
 * - Some older callers passed a 3rd arg (legacy pro mode).
 * - We ignore it but keep it so nothing breaks.
 */
export function formatActionItems(
  items: ActionItem[],
  issues: ActionIssue[],
  _legacyThirdArg?: unknown
): string {
  if (!items.length) return "No obvious action items found.";

  const lines: string[] = [];
  lines.push("Action Items\n");

  items.forEach((item, idx) => {
    lines.push(`${idx + 1}. ${item.text}`);

    const owner = item.owner ? item.owner : "Unassigned";
    const due = item.due ? item.due : "No due date";

    lines.push(`   - Owner: ${owner}`);
    lines.push(`   - Due: ${due}`);

    if (item.notes && item.notes.length) {
      lines.push(`   - Notes: ${item.notes}`);
    }

    lines.push(""); // spacing between items
  });

  if (issues.length) {
    lines.push("Checks\n");
    for (const issue of issues.slice(0, 8)) {
      lines.push(`- ${issue.message}`);
    }
    if (issues.length > 8) {
      lines.push(`- (+${issues.length - 8} more)`);
    }
  }

  return lines.join("\n").trim();
}

export function makeSummary(bullets: string[]): string {
  if (!bullets.length) return "No notes provided.";

  const top = bullets.slice(0, 6);
  const restCount = Math.max(0, bullets.length - top.length);

  const lines: string[] = [];
  lines.push("Summary\n");
  for (const b of top) lines.push(`- ${b}`);
  if (restCount) {
    lines.push(`\n(${restCount} additional note${restCount === 1 ? "" : "s"})`);
  }

  return lines.join("\n");
}

/**
 * Deterministic email template generator.
 * In Phase 1, only Follow-Up uses this (via makeFollowUpEmailDraftFromHighlights).
 * /api/generate should not call this.
 */
export function makeEmailDraft(bullets: string[], opts?: MakeEmailDraftOptions): string {
  const type: EmailType = opts?.type ?? "followUp";
  const tone: EmailTone = opts?.tone ?? "professional";
  const maxBullets = typeof opts?.maxBullets === "number" ? opts!.maxBullets! : 6;

  const bodyLines = bullets.slice(0, maxBullets).map((b) => `- ${b}`);

  const subjectByType: Record<EmailType, string> = {
    followUp: "Follow-Up From Our Meeting",
    question: "Quick Question From Our Meeting",
    actionComplete: "Update: Action Item Completed",
    actionClarification: "Clarification Needed On An Action Item",
    concern: "Concern And Follow-Up From Our Meeting",
  };

  const greetingByTone: Record<EmailTone, string> = {
    professional: "Hi,",
    warm: "Hi There,",
    friendlyProfessional: "Hi Team,",
    casual: "Hey,",
  };

  const closingByTone: Record<EmailTone, string> = {
    professional: "Thanks,",
    warm: "Thanks So Much,",
    friendlyProfessional: "Thanks!",
    casual: "Thanks,",
  };

  const introByType: Record<EmailType, string> = {
    followUp: "Here Are The Key Points From Our Discussion:",
    question: "I Had A Quick Question Coming Out Of Our Discussion:",
    actionComplete: "Quick Update - We Completed The Following:",
    actionClarification: "Could You Clarify The Following Item From Our Discussion?",
    concern: "I Wanted To Flag A Concern And Confirm Next Steps:",
  };

  const subject = (opts?.subjectOverride ?? subjectByType[type]).trim();
  const contextLines = Array.isArray(opts?.contextLines) ? opts!.contextLines!.filter(Boolean) : [];

  const contextBlock =
    contextLines.length > 0
      ? `Context\n${contextLines.map((l) => `- ${l}`).join("\n")}\n\n`
      : "";

  return (
    `Email Draft\n` +
    `Subject: ${subject}\n\n` +
    `${greetingByTone[tone]}\n\n` +
    contextBlock +
    `${introByType[type]}\n` +
    `${bodyLines.join("\n") || "- (No Notes Provided)"}\n\n` +
    `Let Me Know If You Have Questions.\n\n` +
    `${closingByTone[tone]}`
  );
}

/* -------------------- Follow-Up Helper -------------------- */

export type FollowUpEmailHighlight = {
  text: string;
  tag?: string;
};

export type MakeFollowUpEmailDraftArgs = {
  highlights: FollowUpEmailHighlight[];
  followUpType?: string;
  focusPrompt?: string;
  emailPrompt?: string;
  meetingResult?: string;
  meetingOutcome?: string;
  emailType?: EmailType;
  emailTone?: EmailTone;
};

export function makeFollowUpEmailDraftFromHighlights(args: MakeFollowUpEmailDraftArgs): string {
  const type: EmailType = args.emailType ?? "followUp";
  const tone: EmailTone = args.emailTone ?? "professional";

  const contextLines: string[] = [];

  const followUpType = safeString(args.followUpType).trim();
  const focusPrompt = safeString(args.focusPrompt).trim();
  const emailPrompt = safeString(args.emailPrompt).trim();
  const meetingResult = safeString(args.meetingResult).trim();
  const meetingOutcome = safeString(args.meetingOutcome).trim();

  if (followUpType) {
    contextLines.push(`Follow-Up Type: ${followUpType}`);
  }

  if (meetingResult && meetingResult !== "Pending") {
    contextLines.push(`Meeting Result: ${meetingResult}`);
  }

  if (focusPrompt) {
    contextLines.push(`Focus: ${focusPrompt}`);
  }

  if (meetingOutcome) {
    contextLines.push(`Outcome: ${meetingOutcome}`);
  }

  if (emailPrompt) {
    contextLines.push(`Email Instructions: ${emailPrompt}`);
  }

  // Keep selection stable - do not mutate/derive from raw notes here.
  const bullets: string[] =
    Array.isArray(args.highlights) && args.highlights.length
      ? args.highlights
          .slice(0, 50) // hard cap for safety
          .map((h) => {
            const tag = safeString(h.tag).trim();
            const text = safeString(h.text).trim();
            if (!text) return "";
            const prefix = tag && tag !== "None" ? `[${tag}] ` : "";
            return `${prefix}${text}`.trim();
          })
          .filter(Boolean)
      : ["(No Follow-Up Items Selected Yet)"];

  const subjectOverride = followUpType ? `Follow-Up - ${followUpType}` : undefined;

  return makeEmailDraft(bullets, {
    type,
    tone,
    subjectOverride,
    contextLines,
    maxBullets: 20,
  });
}