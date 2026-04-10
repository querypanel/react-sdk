const STOP_WORDS = new Set([
	"a",
	"an",
	"and",
	"are",
	"by",
	"for",
	"from",
	"get",
	"in",
	"is",
	"list",
	"me",
	"of",
	"on",
	"or",
	"show",
	"the",
	"to",
	"what",
	"with",
]);

/**
 * Normalize a free-form label/question for lexical matching.
 */
export function normalizeForGoldSqlMatch(value: string): string {
	return value
		.toLowerCase()
		.replace(/[^\w\s]/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}

function tokenize(normalized: string): string[] {
	return normalized
		.split(" ")
		.map((token) => token.trim())
		.filter((token) => token.length > 1 && !STOP_WORDS.has(token));
}

/**
 * Conservative "exact/near-exact" matcher for question ↔ gold_sql entry_name.
 * This intentionally avoids promoting short generic matches (e.g. "orders")
 * to EXACT MATCH mode.
 */
export function isExactOrNearGoldSqlMatch(
	question: string,
	entryName: string,
): boolean {
	const q = normalizeForGoldSqlMatch(question);
	const n = normalizeForGoldSqlMatch(entryName);

	if (!q || !n) return false;
	if (q === n) return true;

	const qTokens = tokenize(q);
	const nTokens = tokenize(n);
	if (qTokens.length === 0 || nTokens.length === 0) return false;

	const shorter = q.length <= n.length ? q : n;
	const longer = q.length <= n.length ? n : q;
	const shorterTokenCount = Math.min(qTokens.length, nTokens.length);

	// Phrase containment is only trusted for reasonably specific names.
	if (
		longer.includes(shorter) &&
		shorterTokenCount >= 2 &&
		shorter.length >= 12
	) {
		return true;
	}

	const wordsA = new Set(qTokens);
	const wordsB = new Set(nTokens);
	let intersection = 0;
	for (const token of wordsA) {
		if (wordsB.has(token)) intersection++;
	}
	const union = new Set([...wordsA, ...wordsB]).size;
	const jaccard = union > 0 ? intersection / union : 0;

	if (shorterTokenCount >= 3) {
		return intersection >= 2 && jaccard >= 0.7;
	}

	// For 2-token names, require exact token set equality.
	if (shorterTokenCount === 2) {
		return jaccard === 1;
	}

	return false;
}
