import { RunnableLambda } from "@langchain/core/runnables";
import { createLogger } from "../lib/logger";

const logger = createLogger("sql-validator");

/** Input type for validation chain - must contain SQL */
export interface ValidationInput {
	sql: string;
	[key: string]: unknown;
}

export class SqlValidatorService {
	/**
	 * LangChain Runnable chain for SQL validation
	 * Throws an error if the SQL is invalid, passes through otherwise
	 */
	public validationChain = RunnableLambda.from(
		<T extends ValidationInput>(input: T): T => {
			this.validate(input.sql);
			// Pass through the input unchanged if validation passes
			return input;
		},
	);

	/**
	 * Validates a SQL query for safety and correctness
	 * Throws an error if the SQL is invalid
	 */
	validate(sql: string): void {
		// Remove trailing semicolon if present (harmless on single statements)
		const trimmed = sql.trim().replace(/;$/, "");

		// Check for semicolons in the middle (multi-statement injection attempt)
		if (trimmed.includes(";")) {
			throw new Error(
				"SQL must not contain semicolons (multi-statement queries are not allowed).",
			);
		}

		if (
			/\b(insert|update|delete|drop|alter|create|truncate)\b/i.test(trimmed)
		) {
			throw new Error("Only read-only SELECT statements are allowed.");
		}

		const selectPattern = /^(with\s+.+)?\s*select\s+/is;
		if (!selectPattern.test(trimmed)) {
			throw new Error("Query must start with SELECT or WITH ... SELECT.");
		}

		// Prevent SELECT * - require explicit column specification
		// Match SELECT * but allow SELECT * FROM subquery in CTEs
		const selectStarPattern = /SELECT\s+\*\s+FROM\s+(?![\(\s])/i;
		if (selectStarPattern.test(trimmed)) {
			throw new Error(
				"SELECT * is not allowed. Please specify columns explicitly for better performance and security.",
			);
		}

		// Check for excessive GROUP BY columns (high cardinality risk)
		const groupByMatch = trimmed.match(
			/GROUP\s+BY\s+(.+?)(?:\s+HAVING|\s+ORDER|\s+LIMIT|\s+OFFSET|$)/is,
		);
		if (groupByMatch) {
			const groupByClause = groupByMatch[1];
			// Split by comma but be careful with function calls like COALESCE(a, b)
			const groupColumns = this.countGroupByColumns(groupByClause);

			if (groupColumns > 10) {
				throw new Error(
					`GROUP BY with ${groupColumns} columns may produce excessive cardinality. Maximum 10 columns allowed.`,
				);
			}

			// Warn about moderately high cardinality (informational)
			if (groupColumns > 5) {
				// Note: This is a soft warning, we don't throw but could log
				// For now, we allow it but you could add logging here
			}
		}

		// Enforce LIMIT clause for all databases (safety against large result sets).
		// Exception: single-row aggregates (e.g. SELECT SUM(...) FROM ... with no GROUP BY) return one row;
		// LIMIT does not reduce resource usage there — time range / filters do. Require LIMIT for GROUP BY and list queries.
		const hasLimit = /LIMIT\s+(\d+|\{[^}]+\})/i.test(trimmed) || /TOP\s+\d+/i.test(trimmed);
		if (!hasLimit && !this.isSingleRowAggregate(trimmed)) {
			throw new Error(
				"All queries must include a LIMIT clause to prevent excessive resource usage. Add LIMIT <number> to your query.",
			);
		}

		// Check for reasonable LIMIT values (prevent LIMIT 999999999)
		const limitMatch = trimmed.match(/LIMIT\s+(\d+)/i);
		if (limitMatch) {
			const limitValue = Number.parseInt(limitMatch[1], 10);
			if (limitValue > 10000) {
				throw new Error(
					`LIMIT ${limitValue} is too high. Maximum allowed is 10,000 rows for safety.`,
				);
			}
		}

		// Check for TOP clause (SQL Server / ClickHouse)
		const topMatch = trimmed.match(/TOP\s+(\d+)/i);
		if (topMatch) {
			const topValue = Number.parseInt(topMatch[1], 10);
			if (topValue > 10000) {
				throw new Error(
					`TOP ${topValue} is too high. Maximum allowed is 10,000 rows for safety.`,
				);
			}
		}
	}

	/**
	 * Count the number of columns in a GROUP BY clause
	 * Handles nested functions and expressions
	 */
	/**
	 * Append LIMIT when missing, unless the query is a single-row aggregate (LIMIT doesn't reduce resource usage there).
	 * Returns the (possibly modified) SQL string.
	 */
	ensureLimit(sql: string, defaultLimit = 100): string {
		const trimmed = sql.trim().replace(/;$/, "");
		if (/LIMIT\s+(\d+|\{[^}]+\})/i.test(trimmed) || /TOP\s+\d+/i.test(trimmed)) {
			return sql;
		}
		if (this.isSingleRowAggregate(trimmed)) {
			return sql;
		}

		logger.warn("LIMIT clause missing from LLM output — appending LIMIT %d deterministically", defaultLimit);
		const hadSemicolon = sql.trimEnd().endsWith(";");
		return `${trimmed}\nLIMIT ${defaultLimit}${hadSemicolon ? ";" : ""}`;
	}

	/**
	 * True when the query is a single-row aggregate: no GROUP BY and SELECT uses aggregate(s) (SUM, COUNT, AVG, MIN, MAX).
	 * Such queries return one row; LIMIT does not bound resource usage — time range / filters do.
	 */
	private isSingleRowAggregate(trimmed: string): boolean {
		if (/\bGROUP\s+BY\b/i.test(trimmed)) return false;
		const aggregatePattern = /\b(SUM|COUNT|AVG|MIN|MAX)\s*\(/i;
		return aggregatePattern.test(trimmed);
	}

	private countGroupByColumns(groupByClause: string): number {
		let depth = 0;
		let columnCount = 1; // At least one column
		let inQuote = false;
		let quoteChar = "";

		for (let i = 0; i < groupByClause.length; i++) {
			const char = groupByClause[i];

			// Handle quoted identifiers
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

			// Track parentheses depth (for function calls)
			if (char === "(") {
				depth++;
			} else if (char === ")") {
				depth--;
			}
			// Count commas at depth 0 (not inside function calls)
			else if (char === "," && depth === 0) {
				columnCount++;
			}
		}

		return columnCount;
	}
}
