import type { ContextChunk } from "../../types/query";

function isNonEmptyString(value: unknown): value is string {
	return typeof value === "string" && value.trim().length > 0;
}

function isTimeLikeDataType(dataType: string): boolean {
	return /date|time|timestamp|datetime/i.test(dataType);
}

function normalizeTimeColumns(columns?: string[]): string[] {
	if (!Array.isArray(columns)) return [];

	return Array.from(
		new Set(
			columns
				.map((column) => column.trim())
				.filter((column) => column.length > 0),
		),
	);
}

export function deriveTimeColumnsFromChunks(
	chunks: ContextChunk[],
): string[] {
	const timeColumns = new Set<string>();

	for (const chunk of chunks) {
		if (chunk.source !== "column") continue;

		const column = chunk.metadata.column;
		if (!isNonEmptyString(column)) continue;

		const dataType = chunk.metadata.data_type;
		if (isNonEmptyString(dataType) && isTimeLikeDataType(dataType)) {
			timeColumns.add(column.trim());
			continue;
		}

		const typeMatch = chunk.pageContent.match(/^Type:\s*(.+)$/im);
		if (typeMatch && isTimeLikeDataType(typeMatch[1])) {
			timeColumns.add(column.trim());
		}
	}

	return Array.from(timeColumns);
}

export function mergeTimeColumns(
	explicitTimeColumns?: string[],
	derivedTimeColumns?: string[],
): string[] {
	const normalizedExplicit = normalizeTimeColumns(explicitTimeColumns);
	if (normalizedExplicit.length > 0) {
		return normalizedExplicit;
	}

	return normalizeTimeColumns(derivedTimeColumns);
}
