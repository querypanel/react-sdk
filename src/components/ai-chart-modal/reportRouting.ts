/**
 * Decides, per message, whether the Workspace chat runs the parallel report pipeline (a plan and
 * several charts) or the regular single-answer agent. The heuristic is instant and free: it only looks
 * at the text and the conversation state, never calls a model.
 */
export type ReportPreference = "auto" | "report" | "quick";

export const REPORT_PREFERENCES: ReportPreference[] = ["auto", "report", "quick"];

/** Older builds stored "true"/"false" for an on/off toggle; "true" was the default and maps to auto. */
export function parseStoredPreference(raw: string | null | undefined): ReportPreference {
  if (raw === "report" || raw === "quick" || raw === "auto") return raw;
  if (raw === "false") return "quick";
  return "auto";
}

const EXPLICIT_REPORT =
  /\b(report|overview|summary of|summari[sz]e|insights?|analy[sz]e|analysis|deep dive|full picture|big picture|state of|key metrics|kpis?|how (?:are|is) (?:we|it|things|the business)|health of|performance)\b/;

const QUESTION_START =
  /^(how many|how much|how often|what(?:'s| is| are| was| were)|which|who|when|where|why|list|count|top \d+|show me (?:the )?(?:top|\d+|all)|average|avg|total|sum|median|compare|give me (?:the )?(?:number|count|total))\b/;

const CHART_WORDS = /\b(bar|line|pie|donut|area|scatter|table|chart|graph|plot|histogram)\b/;
const TIME_OR_NUMBER =
  /\b(\d+|last|past|previous|this|next|yesterday|today|tonight|week|weekly|day|daily|month|monthly|quarter|quarterly|year|yearly|ytd|q[1-4])\b/;
const GROUPING = /\b(by|per|grouped|broken down|breakdown of)\b/;
const FOLLOW_UP_PRONOUN = /\b(it|that|those|them|this|these|same)\b/;
const FOLLOW_UP_START = /^(make|change|add|remove|filter|sort|group|split|now|also|and|but|instead|only|exclude|include|drill)\b/;

function normalize(text: string): string {
  return text.toLowerCase().replace(/[“”"']/g, "'").replace(/[^\w\s'?-]/g, " ").replace(/\s+/g, " ").trim();
}

/** True when an auto-routed message should become a multi-chart report. */
export function looksLikeReportRequest(text: string, hasPriorTurns: boolean): boolean {
  const normalized = normalize(text);
  if (!normalized) return false;
  const words = normalized.split(" ").filter(Boolean);

  const followUp = hasPriorTurns && (FOLLOW_UP_START.test(normalized) || FOLLOW_UP_PRONOUN.test(normalized));
  if (EXPLICIT_REPORT.test(normalized) && !followUp) return true;
  if (hasPriorTurns) return false;

  const specific =
    QUESTION_START.test(normalized) ||
    normalized.endsWith("?") ||
    CHART_WORDS.test(normalized) ||
    TIME_OR_NUMBER.test(normalized) ||
    GROUPING.test(normalized);
  return !specific && words.length <= 4;
}

/** Final decision for one message. Tagged charts always go to the regular agent. */
export function decideReportMode(input: {
  text: string;
  preference: ReportPreference;
  hasTaggedCharts: boolean;
  hasPriorTurns: boolean;
}): boolean {
  if (input.hasTaggedCharts) return false;
  if (input.preference === "report") return true;
  if (input.preference === "quick") return false;
  return looksLikeReportRequest(input.text, input.hasPriorTurns);
}
