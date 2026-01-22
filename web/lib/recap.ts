// web/lib/recap.ts

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

function normalizeLines(raw: string): string[] {
  return raw
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

export function parseBullets(rawNotes: string): string[] {
  const lines = normalizeLines(rawNotes);

  // Treat any line as a "bullet" for now. (Later: timestamps + quick marks)
  return lines.map((l) => {
    // Strip leading bullet markers like "-", "*", "•", "1.", etc.
    return l.replace(/^(\*|-|•|\d+\.)\s+/, "");
  });
}

// Very simple placeholder extraction: find lines that look like actions
export function parseActionItems(bullets: string[]): ActionItem[] {
  const actionVerbs = [
    "send",
    "share",
    "follow up",
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
    const dueTokens = [
      "today",
      "tomorrow",
      "this week",
      "next week",
      "end of day",
      "eod",
      "eow",
    ];
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

    // fallback: "I will" / "We will"
    if (lower.includes("i will")) return "Me";
    if (lower.includes("we will")) return "We";

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
      return actionVerbs.some((v) => lower.includes(v));
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
      textLower.includes("i will") ||
      textLower.includes("we will");

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
 * IMPORTANT:
 * - We removed Pro Mode from the product for now.
 * - This function stays backward-compatible so older page.tsx calls
 *   that pass a 3rd argument won't break.
 */
export function formatActionItems(
  items: ActionItem[],
  issues: ActionIssue[],
  _legacyProMode?: boolean
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

export function makeEmailDraft(
  bullets: string[],
  opts?: {
    type?:
      | "followUp"
      | "question"
      | "actionComplete"
      | "actionClarification"
      | "concern";
    tone?: "professional" | "warm" | "friendlyProfessional" | "casual";
  }
): string {
  const type =
    opts?.type ?? "followUp";
  const tone =
    opts?.tone ?? "professional";

  const bodyLines = bullets.slice(0, 6).map((b) => `- ${b}`);

  const subjectByType: Record<typeof type, string> = {
    followUp: "Follow-up from our meeting",
    question: "Quick question from our meeting",
    actionComplete: "Update: action item completed",
    actionClarification: "Clarification needed on an action item",
    concern: "Concern / follow-up from our meeting",
  };

  const greetingByTone: Record<typeof tone, string> = {
    professional: "Hi,",
    warm: "Hi there,",
    friendlyProfessional: "Hi team,",
    casual: "Hey,",
  };

  const closingByTone: Record<typeof tone, string> = {
    professional: "Thanks,",
    warm: "Thanks so much,",
    friendlyProfessional: "Thanks!",
    casual: "Thanks,",
  };

  const introByType: Record<typeof type, string> = {
    followUp: "Here are the key points from our discussion:",
    question: "I had a quick question coming out of our discussion:",
    actionComplete: "Quick update - we completed the following:",
    actionClarification: "Could you clarify the following item from our discussion?",
    concern: "I wanted to flag a concern and confirm next steps:",
  };

  const subject = subjectByType[type];

  return (
    `Email Draft\n` +
    `Subject: ${subject}\n\n` +
    `${greetingByTone[tone]}\n\n` +
    `${introByType[type]}\n` +
    `${bodyLines.join("\n") || "- (no notes provided)"}\n\n` +
    `Let me know if you have questions.\n\n` +
    `${closingByTone[tone]}`
  );
}
