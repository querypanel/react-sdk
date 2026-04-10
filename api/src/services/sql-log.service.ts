import { getCurrentTraceId } from "../lib/langfuse-callback";
import { createLogger } from "../lib/logger";
import { supabase } from "../lib/supabase";
import type { AuthContext } from "../types/auth";

const logger = createLogger("sql-log");

export interface CreateDraftLogInput {
	sql: string;
	params: Array<Record<string, unknown>>;
	question: string;
	dialect: string;
	rationale?: string;
	parentLogId?: string;
	contextTargetIdentifiers?: string[];
}

export interface CreateFailedLogInput {
	sql?: string;
	params?: Array<Record<string, unknown>>;
	question: string;
	dialect?: string;
	rationale?: string;
	error: string;
	contextTargetIdentifiers?: string[];
}

export class SqlLogService {
	/**
	 * Create a DRAFT log entry when SQL is successfully generated
	 * @returns queryId (UUID)
	 */
	async createDraftLog(
		auth: AuthContext,
		input: CreateDraftLogInput,
	): Promise<string> {
		if (!auth.organizationId || !auth.tenantId) {
			throw new Error(
				"organizationId and tenantId are required in auth context",
			);
		}

		try {
			// Capture current OpenTelemetry trace ID for correlation
			const traceId = getCurrentTraceId();

			const { data, error } = await supabase
				.from("sql_logs")
				.insert({
					sql: input.sql,
					params: input.params,
					state: "DRAFT",
					question: input.question,
					organization_id: auth.organizationId,
					tenant_id: auth.tenantId,
					dialect: input.dialect,
					rationale: input.rationale,
					parent_log_id: input.parentLogId,
					context_target_identifiers: input.contextTargetIdentifiers || [],
					trace_id: traceId,
				})
				.select("id")
				.single();

			if (error) {
				logger.error(
					{ error, input: { ...input, sql: input.sql.substring(0, 100) } },
					"Failed to create draft log",
				);
				throw new Error(`Failed to create draft log: ${error.message}`);
			}

			logger.info(
				{ queryId: data.id, organizationId: auth.organizationId },
				"Created draft SQL log",
			);
			return data.id;
		} catch (error) {
			logger.error({ error }, "Exception creating draft log");
			throw error;
		}
	}

	/**
	 * Create a FAILED log entry when SQL generation fails
	 * @returns queryId (UUID)
	 */
	async createFailedLog(
		auth: AuthContext,
		input: CreateFailedLogInput,
	): Promise<string> {
		if (!auth.organizationId || !auth.tenantId) {
			throw new Error(
				"organizationId and tenantId are required in auth context",
			);
		}

		try {
			// Capture current OpenTelemetry trace ID for correlation
			const traceId = getCurrentTraceId();

			const { data, error } = await supabase
				.from("sql_logs")
				.insert({
					sql: input.sql || `-- Generation failed: ${input.error}`,
					params: input.params || [],
					state: "FAILED",
					question: input.question,
					organization_id: auth.organizationId,
					tenant_id: auth.tenantId,
					dialect: input.dialect || "unknown",
					rationale: input.rationale || input.error,
					context_target_identifiers: input.contextTargetIdentifiers || [],
					trace_id: traceId,
				})
				.select("id")
				.single();

			if (error) {
				logger.error(
					{ error, input: { ...input } },
					"Failed to create failed log",
				);
				throw new Error(`Failed to create failed log: ${error.message}`);
			}

			logger.info(
				{ queryId: data.id, organizationId: auth.organizationId },
				"Created failed SQL log",
			);
			return data.id;
		} catch (error) {
			logger.error({ error }, "Exception creating failed log");
			throw error;
		}
	}

	/**
	 * Update log state to SUCCESS and set executed_at timestamp
	 */
	async updateToSuccess(queryId: string): Promise<void> {
		try {
			const { error } = await supabase
				.from("sql_logs")
				.update({
					state: "SUCCESS",
					executed_at: new Date().toISOString(),
				})
				.eq("id", queryId);

			if (error) {
				logger.error({ error, queryId }, "Failed to update log to SUCCESS");
				throw new Error(`Failed to update log to SUCCESS: ${error.message}`);
			}

			logger.info({ queryId }, "Updated SQL log to SUCCESS");
		} catch (error) {
			logger.error({ error, queryId }, "Exception updating log to SUCCESS");
			throw error;
		}
	}

	/**
	 * Get a log by ID (optional utility method)
	 */
	async getLog(queryId: string): Promise<any> {
		try {
			const { data, error } = await supabase
				.from("sql_logs")
				.select("*")
				.eq("id", queryId)
				.single();

			if (error) {
				logger.error({ error, queryId }, "Failed to get log");
				throw new Error(`Failed to get log: ${error.message}`);
			}

			return data;
		} catch (error) {
			logger.error({ error, queryId }, "Exception getting log");
			throw error;
		}
	}
}
