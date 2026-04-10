import type { ContextChunk } from "../types/query";

/**
 * Result of query complexity analysis
 */
export interface ComplexityAnalysis {
	allowed: boolean;
	warnings: string[];
	estimatedCardinality?: number;
	columnCount?: number;
	groupByColumnCount?: number;
	hasSelectStar: boolean;
	hasLimit: boolean;
	limitValue?: number;
	riskLevel: "low" | "medium" | "high" | "critical";
}

/**
 * Service for analyzing SQL query complexity and resource consumption
 * Provides warnings and estimates before execution
 */
export class QueryComplexityService {
	/**
	 * Analyze a SQL query for complexity and resource consumption risks
	 * @param sql The SQL query to analyze
	 * @param contextChunks Optional schema context for cardinality estimation
	 */
	analyze(sql: string, contextChunks?: ContextChunk[]): ComplexityAnalysis {
		const warnings: string[] = [];
		let riskLevel: ComplexityAnalysis["riskLevel"] = "low";

		const trimmed = sql.trim().replace(/;$/, "");

		// Check for SELECT *
		const hasSelectStar = /SELECT\s+\*\s+FROM/i.test(trimmed);
		if (hasSelectStar) {
			warnings.push("Query uses SELECT * which may return unnecessary columns");
			riskLevel = "medium";
		}

		// Count columns in SELECT clause (rough estimate)
		const columnCount = this.estimateColumnCount(trimmed);
		if (columnCount > 20) {
			warnings.push(
				`Query selects approximately ${columnCount} columns, which may impact performance`,
			);
			riskLevel = riskLevel === "critical" ? "critical" : "high";
		} else if (columnCount > 10) {
			warnings.push(`Query selects ${columnCount} columns`);
			riskLevel = riskLevel === "high" ? "high" : "medium";
		}

		// Check LIMIT clause
		const hasLimit = /LIMIT\s+\d+/i.test(trimmed);
		let limitValue: number | undefined;
		if (hasLimit) {
			const limitMatch = trimmed.match(/LIMIT\s+(\d+)/i);
			if (limitMatch) {
				limitValue = Number.parseInt(limitMatch[1], 10);
				if (limitValue > 1000) {
					warnings.push(`LIMIT ${limitValue} may return a large result set`);
					riskLevel = riskLevel === "critical" ? "critical" : "high";
				}
			}
		} else {
			warnings.push("Query has no LIMIT clause");
			riskLevel = "critical";
		}

		// Check GROUP BY
		const groupByMatch = trimmed.match(
			/GROUP\s+BY\s+(.+?)(?:\s+HAVING|\s+ORDER|\s+LIMIT|\s+OFFSET|$)/is,
		);
		let groupByColumnCount: number | undefined;
		let estimatedCardinality: number | undefined;

		if (groupByMatch) {
			groupByColumnCount = this.countGroupByColumns(groupByMatch[1]);

			if (groupByColumnCount > 7) {
				warnings.push(
					`GROUP BY with ${groupByColumnCount} columns may produce excessive cardinality`,
				);
				riskLevel = "critical";
			} else if (groupByColumnCount > 5) {
				warnings.push(
					`GROUP BY with ${groupByColumnCount} columns may produce high cardinality`,
				);
				riskLevel = riskLevel === "critical" ? "critical" : "high";
			}

			// Estimate cardinality if context is available
			if (contextChunks && contextChunks.length > 0) {
				estimatedCardinality = this.estimateCardinality(
					groupByColumnCount,
					contextChunks,
				);
				if (estimatedCardinality > 10000) {
					warnings.push(
						`Estimated result cardinality: ${estimatedCardinality.toLocaleString()} rows`,
					);
					riskLevel = "critical";
				} else if (estimatedCardinality > 1000) {
					warnings.push(
						`Estimated result cardinality: ${estimatedCardinality.toLocaleString()} rows`,
					);
					riskLevel = riskLevel === "critical" ? "critical" : "high";
				}
			}
		}

		// Determine if query should be allowed
		const allowed = riskLevel !== "critical";

		return {
			allowed,
			warnings,
			estimatedCardinality,
			columnCount,
			groupByColumnCount,
			hasSelectStar,
			hasLimit,
			limitValue,
			riskLevel,
		};
	}

	/**
	 * Estimate the number of columns in a SELECT clause
	 */
	private estimateColumnCount(sql: string): number {
		// Extract SELECT clause (from SELECT to FROM)
		const selectMatch = sql.match(/SELECT\s+(.+?)\s+FROM/is);
		if (!selectMatch) return 0;

		const selectClause = selectMatch[1];

		// If it's SELECT *, estimate based on typical table
		if (selectClause.trim() === "*") {
			return 15; // Typical table has ~15 columns
		}

		// Count commas at depth 0 (not inside function calls or subqueries)
		let depth = 0;
		let columnCount = 1;
		let inQuote = false;
		let quoteChar = "";

		for (let i = 0; i < selectClause.length; i++) {
			const char = selectClause[i];

			// Handle quotes
			if ((char === '"' || char === "'" || char === "`") && !inQuote) {
				inQuote = true;
				quoteChar = char;
				continue;
			}
			if (char === quoteChar && inQuote) {
				inQuote = false;
				quoteChar = "";
				continue;
			}

			if (inQuote) continue;

			// Track depth
			if (char === "(" || char === "[") {
				depth++;
			} else if (char === ")" || char === "]") {
				depth--;
			} else if (char === "," && depth === 0) {
				columnCount++;
			}
		}

		return columnCount;
	}

	/**
	 * Count columns in GROUP BY clause
	 */
	private countGroupByColumns(groupByClause: string): number {
		let depth = 0;
		let columnCount = 1;
		let inQuote = false;
		let quoteChar = "";

		for (let i = 0; i < groupByClause.length; i++) {
			const char = groupByClause[i];

			// Handle quotes
			if ((char === '"' || char === "'" || char === "`") && !inQuote) {
				inQuote = true;
				quoteChar = char;
				continue;
			}
			if (char === quoteChar && inQuote) {
				inQuote = false;
				quoteChar = "";
				continue;
			}

			if (inQuote) continue;

			// Track depth
			if (char === "(") {
				depth++;
			} else if (char === ")") {
				depth--;
			} else if (char === "," && depth === 0) {
				columnCount++;
			}
		}

		return columnCount;
	}

	/**
	 * Estimate result cardinality based on GROUP BY column count
	 * Uses heuristics: each grouping column multiplies cardinality
	 */
	private estimateCardinality(
		groupByColumns: number,
		contextChunks: ContextChunk[],
	): number {
		// Base estimate: each column adds an order of magnitude
		// This is a rough heuristic:
		// 1 column: ~100 unique values
		// 2 columns: ~1,000 combinations
		// 3 columns: ~10,000 combinations
		// etc.

		let baseCardinality = 100;

		// Try to get more accurate estimates from context metadata
		// Look for cardinality hints in column descriptions
		for (const chunk of contextChunks) {
			const content = chunk.pageContent.toLowerCase();

			// Look for cardinality indicators
			if (content.includes("unique") || content.includes("primary key")) {
				baseCardinality = Math.max(baseCardinality, 10000);
			}
			if (content.includes("enum") || content.includes("category")) {
				baseCardinality = Math.max(baseCardinality, 50);
			}
			if (content.includes("boolean") || content.includes("flag")) {
				baseCardinality = Math.max(baseCardinality, 2);
			}
		}

		// Multiply by estimated combinations
		const estimatedCardinality = Math.pow(baseCardinality, groupByColumns / 2);

		// Cap at a reasonable maximum
		return Math.min(estimatedCardinality, 1000000);
	}

	/**
	 * Format analysis results as human-readable string
	 */
	formatAnalysis(analysis: ComplexityAnalysis): string {
		const lines = [`Risk Level: ${analysis.riskLevel.toUpperCase()}`];

		if (analysis.columnCount) {
			lines.push(`Columns: ${analysis.columnCount}`);
		}

		if (analysis.groupByColumnCount) {
			lines.push(`GROUP BY columns: ${analysis.groupByColumnCount}`);
		}

		if (analysis.limitValue) {
			lines.push(`LIMIT: ${analysis.limitValue}`);
		}

		if (analysis.estimatedCardinality) {
			lines.push(
				`Estimated cardinality: ${analysis.estimatedCardinality.toLocaleString()}`,
			);
		}

		if (analysis.warnings.length > 0) {
			lines.push("\nWarnings:");
			for (const warning of analysis.warnings) {
				lines.push(`  - ${warning}`);
			}
		}

		return lines.join("\n");
	}
}
