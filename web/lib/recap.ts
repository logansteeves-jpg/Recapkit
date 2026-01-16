// web/lib/recap.ts

export type ActionItem = {
  text: string;
  owner?: string;
  due?: string;
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

  // Treat any line as a “bullet” for now. (Later: timestamps + quick marks)
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
  ];

  return bullets
    .filter((b) => {
      const lower = b.toLowerCase();
      return actionVerbs.some((v) => lower.includes(v));
    })
    .map((b) => ({ text: b }));
}

export function detectActionIssues(items: ActionItem[]): ActionIssue[] {
  const issues: ActionIssue[] = [];

  for (const item of items) {
    const text = item.text.toLowerCase();

    // Owner heuristic
    const hasOwner =
      text.includes("@") ||
      text.includes("owner:") ||
      text.includes("assigned to") ||
      text.includes("i will") ||
      text.includes("we will");

    // Due date heuristic
    const hasDue =
      text.includes("today") ||
      text.includes("tomorrow") ||
      text.includes("next week") ||
      /\b(mon|tue|wed|thu|fri|sat|sun)\b/i.test(text) ||
      /\b\d{4}-\d{2}-\d{2}\b/.test(text);

    // Vague heuristic
    const vague =
      text.length < 20 ||
      text.includes("look into") ||
      text.includes("check on") ||
      text.includes("touch base");

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
 *   that pass a 3rd argument won’t break.
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
  });

  if (issues.length) {
    lines.push("\nChecks\n");
    for (const issue of issues.slice(0, 8)) {
      lines.push(`- ${issue.message}`);
    }
    if (issues.length > 8) {
      lines.push(`- (+${issues.length - 8} more)`);
    }
  }

  return lines.join("\n");
}

export function makeSummary(bullets: string[]): string {
  if (!bullets.length) return "No notes provided.";

  const top = bullets.slice(0, 6);
  const restCount = Math.max(0, bullets.length - top.length);

  const lines: string[] = [];
  lines.push("Summary\n");
  for (const b of top) lines.push(`- ${b}`);
  if (restCount) lines.push(`\n(${restCount} additional note${restCount === 1 ? "" : "s"})`);

  return lines.join("\n");
}

export function makeEmailDraft(bullets: string[]): string {
  const subject = "Follow-up from our meeting";
  const bodyLines = bullets.slice(0, 6).map((b) => `- ${b}`);

  return (
    `Email Draft\n` +
    `Subject: ${subject}\n\n` +
    `Hi,\n\n` +
    `Here are the key points from our discussion:\n` +
    `${bodyLines.join("\n")}\n\n` +
    `Let me know if you have questions.\n\n` +
    `Thanks,`
  );
}