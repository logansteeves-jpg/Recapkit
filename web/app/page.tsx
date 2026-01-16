// web/lib/recap.ts

export function normalizeLine(s: string): string {
  return s.replace(/\u00A0/g, " ").replace(/[ \t]+/g, " ").trim();
}

export function splitIntoSentences(paragraph: string): string[] {
  const text = paragraph.trim();
  if (!text) return [];
  const parts = text.split(/(?<=[.!?])\s+(?=[A-Z0-9(])/);
  return parts.map((p) => normalizeLine(p)).filter(Boolean);
}

export function toBullets(text: string): string[] {
  const raw = text.replace(/\r\n/g, "\n").trim();
  if (!raw) return [];

  const lines = raw.split("\n").map(normalizeLine).filter(Boolean);

  let candidates: string[] = [];
  if (lines.length <= 1 && raw.length > 80) {
    candidates = splitIntoSentences(raw);
  } else {
    candidates = lines.flatMap((line) => {
      const parts = line
        .split(/[•·]/g)
        .flatMap((p) => p.split(/\s-\s/g))
        .flatMap((p) => p.split(/\s\|\s/g))
        .map(normalizeLine)
        .filter(Boolean);

      return parts.length ? parts : [line];
    });
  }

  const cleaned = candidates
    .map((s) => s.replace(/^(\*|-|•|\d+\)|\d+\.|\[ \]|\[x\])\s+/, ""))
    .map(normalizeLine)
    .filter(Boolean);

  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const s of cleaned) {
    const key = s.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(s);
  }

  return deduped;
}

export type ActionItem = {
  raw: string;
  owner?: string;
  action: string;
  due?: string;
};

export function parseActionItems(bullets: string[]): ActionItem[] {
  const actionVerb =
    /\b(follow up|send|share|email|schedule|book|call|confirm|ask|create|update|review|meet|prepare|decide|draft|finalize)\b/i;

  const ownerPattern =
    /^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+(will|to|is going to|needs to|should)\b/;

  const duePattern =
    /\b(by|before|on|next)\s+([A-Za-z]+\s*\d{0,2}|EOD\s+\w+|EOD|tomorrow|today|next week|next month|this week|this month)\b/i;

  const items: ActionItem[] = [];

  for (const b of bullets) {
    const text = b.trim();
    if (!text) continue;

    const looksLikeAction =
      actionVerb.test(text) ||
      ownerPattern.test(text) ||
      /^action:\s*/i.test(text) ||
      /^to\s+\w+/i.test(text);

    if (!looksLikeAction) continue;

    const cleaned = text
      .replace(/^[-•]\s*/, "")
      .replace(/^action:\s*/i, "")
      .trim();

    const ownerMatch = cleaned.match(ownerPattern);
    const owner = ownerMatch?.[1];

    const dueMatch = cleaned.match(duePattern);
    const due = dueMatch ? `${dueMatch[1]} ${dueMatch[2]}` : undefined;

    const action = cleaned.replace(ownerPattern, "").trim();

    items.push({
      raw: text,
      owner,
      action: action || cleaned,
      due,
    });
  }

  // fallback: if we found zero "actions", still produce something usable
  if (items.length === 0) {
    return bullets.slice(0, 5).map((b) => ({
      raw: b,
      action: b.replace(/^[-•]\s*/, "").trim(),
    }));
  }

  return items.slice(0, 8);
}

export type ActionIssues = {
  missingOwners: number;
  missingDue: number;
  weak: number;
  missingVerb: number;
};

export function detectActionIssues(items: ActionItem[]): ActionIssues {
  const missingOwners = items.filter((i) => !i.owner).length;
  const missingDue = items.filter((i) => !i.due).length;
  const weak = items.filter((i) => i.action.trim().length < 10).length;

  const commonVerbs = [
    "follow up",
    "send",
    "share",
    "email",
    "schedule",
    "book",
    "call",
    "confirm",
    "ask",
    "create",
    "update",
    "review",
    "meet",
    "prepare",
    "decide",
    "draft",
    "finalize",
  ];

  const missingVerb = items.filter((i) => {
    const a = i.action.trim().toLowerCase();
    return !commonVerbs.some((v) => a.startsWith(v));
  }).length;

  return { missingOwners, missingDue, weak, missingVerb };
}

/**
 * Pro mode removed.
 * Always returns clean action items with optional quality checks.
 */
export function formatActionItems(items: ActionItem[], issues: ActionIssues): string {
  const lines = items.map((it) => `- ${it.action}`);

  const checks: string[] = [];
  if (issues.missingOwners > 0) checks.push(`Missing owner: ${issues.missingOwners}`);
  if (issues.missingDue > 0) checks.push(`Missing due date: ${issues.missingDue}`);
  if (issues.weak > 0) checks.push(`Too vague: ${issues.weak}`);
  if (issues.missingVerb > 0) checks.push(`Missing clear action verb: ${issues.missingVerb}`);

  const header = `Action items (${items.length}):`;

  const checksBlock =
    checks.length > 0 ? `\n\nQuality checks:\n- ${checks.join("\n- ")}` : "";

  return `${header}\n\n${lines.join("\n")}${checksBlock}`;
}
