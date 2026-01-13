// web/lib/recap.ts

export function normalizeLine(s: string) {
  return s.replace(/\u00A0/g, " ").replace(/[ \t]+/g, " ").trim();
}

export function splitIntoSentences(paragraph: string) {
  const text = paragraph.trim();
  if (!text) return [];
  const parts = text.split(/(?<=[.!?])\s+(?=[A-Z0-9(])/);
  return parts.map((p) => normalizeLine(p)).filter(Boolean);
}

export function toBullets(text: string) {
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
    /\b(follow up|send|share|email|schedule|book|call|confirm|ask|create|update|review|meet|prepare|decide|draft)\b/i;

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

    const cleaned = text.replace(/^[-•]\s*/, "").replace(/^action:\s*/i, "").trim();

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

  if (items.length === 0) {
    return bullets.slice(0, 5).map((b) => ({
      raw: b,
      action: b.replace(/^[-•]\s*/, "").trim(),
    }));
  }

  return items.slice(0, 8);
}

export function detectActionIssues(items: ActionItem[]) {
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

export function formatActionItems(
  items: ActionItem[],
  issues: { missingOwners: number; missingDue: number; weak: number; missingVerb: number },
  proMode: boolean
) {
  const lines = items.map((it) => {
    const flags: string[] = [];
    if (!it.owner) flags.push("⚠️ missing owner");
    if (!it.due) flags.push("⏳ missing due date");
    if (it.action.trim().length < 10) flags.push("😕 vague action");

    const flagText = proMode && flags.length ? ` [${flags.join(", ")}]` : "";
    return `- ${it.action}${flagText}`;
  });

  const checks: string[] = [];
  if (issues.missingOwners > 0) checks.push(`⚠️ ${issues.missingOwners} item(s) missing owner`);
  if (issues.missingDue > 0) checks.push(`⏳ ${issues.missingDue} item(s) missing due date`);
  if (issues.weak > 0) checks.push(`😕 ${issues.weak} item(s) look too vague`);
  if (issues.missingVerb > 0) checks.push(`✏️ ${issues.missingVerb} item(s) lack a clear action verb`);

  const header = `Action items (${items.length}):`;
  const checksBlock =
    proMode && checks.length ? `\n\nChecks:\n- ${checks.join("\n- ")}` : "";

  return `${header}\n\n${lines.join("\n")}${checksBlock}`;
}
