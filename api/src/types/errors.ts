/**
 * Error codes for the query pipeline
 * These are returned in API responses to allow SDK clients to handle specific errors
 */
export const QueryErrorCode = {
	// Moderation errors
	MODERATION_FAILED: "MODERATION_FAILED",

	// Guardrail errors
	RELEVANCE_CHECK_FAILED: "RELEVANCE_CHECK_FAILED", // Question not relevant to database
	SECURITY_CHECK_FAILED: "SECURITY_CHECK_FAILED", // SQL injection, prompt injection, malicious
	RESOURCE_LIMIT_EXCEEDED: "RESOURCE_LIMIT_EXCEEDED", // Excessive resource usage (too many columns, high cardinality)

	// SQL generation errors
	SQL_GENERATION_FAILED: "SQL_GENERATION_FAILED",

	// SQL validation errors
	SQL_VALIDATION_FAILED: "SQL_VALIDATION_FAILED",

	// Context retrieval errors
	CONTEXT_RETRIEVAL_FAILED: "CONTEXT_RETRIEVAL_FAILED",

	// General errors
	INTERNAL_ERROR: "INTERNAL_ERROR",
	AUTHENTICATION_REQUIRED: "AUTHENTICATION_REQUIRED",
	VALIDATION_ERROR: "VALIDATION_ERROR",
} as const;

export type QueryErrorCode =
	(typeof QueryErrorCode)[keyof typeof QueryErrorCode];

/**
 * Maps guardrail threat types to error codes
 */
export function guardrailThreatToErrorCode(
	threatType?:
		| "sql_injection"
		| "prompt_injection"
		| "irrelevant"
		| "malicious"
		| "excessive_resource",
): QueryErrorCode {
	if (threatType === "irrelevant") {
		return QueryErrorCode.RELEVANCE_CHECK_FAILED;
	}
	if (threatType === "excessive_resource") {
		return QueryErrorCode.RESOURCE_LIMIT_EXCEEDED;
	}
	// sql_injection, prompt_injection, malicious, or unknown
	return QueryErrorCode.SECURITY_CHECK_FAILED;
}

/**
 * Standard error response shape for query API
 */
export interface QueryErrorResponse {
	success: false;
	error: string;
	code: QueryErrorCode;
	details?: Record<string, unknown>;
}
