import { createLogger } from "../../lib/logger";
import type { TenantSettings } from "../schema-storage.service";
import type { GeneratedQuery } from "../../types/query";

const logger = createLogger("v2:tenant-verification");

export class TenantVerificationError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "TenantVerificationError";
	}
}

export class DialectCompatibilityError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "DialectCompatibilityError";
	}
}

/**
 * Post-generation verification that tenant isolation filters are present
 * in the generated SQL when enforcement is required.
 *
 * This is a security-critical check. The SQL generator is prompted to
 * add tenant filters, but LLMs can ignore instructions. This function
 * provides a deterministic safety net.
 */
export function verifyTenantIsolation(
	sql: string,
	tenantId: string | undefined,
	tenantSettings: TenantSettings | undefined,
	dialect?: string,
): void {
	if (!tenantSettings?.enforceTenantIsolation) return;
	if (!tenantId) return;

	const fieldName = tenantSettings.tenantFieldName;
	if (!fieldName) return;

	if (
		dialect?.toLowerCase() === "bigquery" &&
		hasBigQueryPositionalTenantFilter(sql, fieldName)
	) {
		throw new TenantVerificationError(
			`Tenant isolation for BigQuery field "${fieldName}" cannot use positional placeholders like $1. Use a named parameter such as @${fieldName}.`,
		);
	}

	// Normalize SQL for matching (collapse whitespace, case-insensitive, and
	// remove identifier quotes so BigQuery backtick-quoted paths still match).
	const normalizedSql = sql
		.replace(/[`"]/g, "")
		.replace(/\s+/g, " ")
		.toLowerCase();

	// The field name must appear in a WHERE/AND/OR clause as a filter.
	// We check for the field name appearing after WHERE, AND, or OR.
	const fieldNameLower = fieldName.toLowerCase();

	// Check various patterns:
	// 1. field_name = value
	// 2. field_name IN (...)
	// 3. "field_name" = value (quoted identifier)
	// 4. table.field_name = value
	const patterns = [
		// Simple: WHERE field_name = ...
		new RegExp(`\\b${escapeRegex(fieldNameLower)}\\s*=`, "i"),
		// Qualified: WHERE table.field_name = ...
		new RegExp(`\\.${escapeRegex(fieldNameLower)}\\s*=`, "i"),
		// IN clause: WHERE field_name IN (...)
		new RegExp(`\\b${escapeRegex(fieldNameLower)}\\s+in\\s*\\(`, "i"),
		// Quoted: WHERE "field_name" = ...
		new RegExp(`"${escapeRegex(fieldNameLower)}"\\s*=`, "i"),
		// ClickHouse placeholder: {field_name:Type}
		new RegExp(`\\{${escapeRegex(fieldNameLower)}:`, "i"),
	];

	const hasFilter = patterns.some((p) => p.test(normalizedSql));

	if (!hasFilter) {
		logger.error(
			{
				fieldName,
				sql: sql.slice(0, 200),
			},
			"Tenant isolation filter missing from generated SQL",
		);
		throw new TenantVerificationError(
			`Tenant isolation enforcement failed: generated SQL does not filter on "${fieldName}". ` +
				"This is a security requirement. The query will not be executed.",
		);
	}

	logger.debug(
		{ fieldName },
		"Tenant isolation filter verified",
	);
}

/**
 * Deterministically ensure the tenant param exists in the params array
 * when the SQL uses a ClickHouse placeholder for it.
 *
 * The LLM sometimes generates `{customer_id:Int32}` in the SQL but
 * omits the matching param entry. This function fixes that gap using
 * the known tenantId value.
 */
export function ensureTenantParam(
	generated: GeneratedQuery,
	tenantId: string | undefined,
	tenantSettings: TenantSettings | undefined,
): GeneratedQuery {
	if (!tenantSettings?.enforceTenantIsolation) return generated;
	if (!tenantId) return generated;

	const fieldName = tenantSettings.tenantFieldName;
	if (!fieldName) return generated;

	// Check if param already exists
	const hasParam = generated.params.some(
		(p) => (p as Record<string, unknown>).name === fieldName,
	);
	if (hasParam) return generated;

	// BigQuery uses named parameters like @tenant_id.
	const bigQueryPlaceholderRegex = new RegExp(
		`@${escapeRegex(fieldName)}\\b`,
		"i",
	);
	if (bigQueryPlaceholderRegex.test(generated.sql)) {
		logger.warn(
			{ fieldName, tenantId },
			"Tenant param missing from BigQuery SQL output — adding deterministically",
		);
		return {
			...generated,
			params: [
				...generated.params,
				{ name: fieldName, value: tenantId, description: "Tenant isolation filter" },
			],
		};
	}

	// Check if SQL uses a ClickHouse placeholder for the tenant field
	const placeholderRegex = new RegExp(
		`\\{${escapeRegex(fieldName)}:(\\w+)\\}`,
		"i",
	);
	const match = placeholderRegex.exec(generated.sql);
	if (!match) return generated;

	// Add the missing tenant param
	const fieldType = match[1] ?? "String"; // e.g. "Int32"
	const value = coerceTenantValue(tenantId, fieldType);

	logger.warn(
		{ fieldName, fieldType, tenantId },
		"Tenant param missing from LLM output — adding deterministically",
	);

	return {
		...generated,
		params: [
			...generated.params,
			{ name: fieldName, value, description: "Tenant isolation filter" },
		],
	};
}

export function validateDialectCompatibility(
	generated: GeneratedQuery,
): void {
	const dialect = generated.dialect?.toLowerCase();
	if (dialect !== "bigquery") return;

	const violations: string[] = [];
	if (/\$\d+\b/.test(generated.sql)) {
		violations.push(
			"BigQuery SQL cannot use positional placeholders like $1; use named parameters such as @tenant_id.",
		);
	}
	if (/\{[A-Za-z_][\w]*:[^}]+\}/.test(generated.sql)) {
		violations.push(
			"BigQuery SQL cannot use ClickHouse-style placeholders like {name:Type}.",
		);
	}
	if (/\bfrom_unixtime\s*\(/i.test(generated.sql)) {
		violations.push(
			"BigQuery SQL cannot use FROM_UNIXTIME(); use BigQuery timestamp functions such as TIMESTAMP_SECONDS, TIMESTAMP_MILLIS, TIMESTAMP, or PARSE_TIMESTAMP.",
		);
	}
	if (/::\s*[A-Za-z_][A-Za-z0-9_]*/.test(generated.sql)) {
		violations.push(
			"BigQuery SQL cannot use PostgreSQL :: type casts; use CAST(...) or SAFE_CAST(...).",
		);
	}
	if (/\bilike\b/i.test(generated.sql)) {
		violations.push(
			"BigQuery SQL cannot use ILIKE; use LOWER(column) LIKE LOWER(pattern) instead.",
		);
	}

	if (violations.length > 0) {
		throw new DialectCompatibilityError(violations.join(" "));
	}
}

function coerceTenantValue(
	value: string,
	clickhouseType: string,
): string | number {
	if (/^u?int\d+$/i.test(clickhouseType) || /^float\d+$/i.test(clickhouseType)) {
		const num = Number(value);
		return Number.isFinite(num) ? num : value;
	}
	return value;
}

function escapeRegex(str: string): string {
	return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hasBigQueryPositionalTenantFilter(
	sql: string,
	fieldName: string,
): boolean {
	const field = escapeRegex(fieldName);
	const patterns = [
		new RegExp(`\\b${field}\\s*=\\s*\\$\\d+`, "i"),
		new RegExp(`\\.${field}\\s*=\\s*\\$\\d+`, "i"),
		new RegExp(`"${field}"\\s*=\\s*\\$\\d+`, "i"),
	];
	return patterns.some((pattern) => pattern.test(sql));
}
