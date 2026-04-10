import { config } from "../config";

export interface TelemetryContext {
	organizationId: string;
	tenantId?: string;
	sessionId?: string;
	userId?: string;
}

/**
 * Build experimental_telemetry config for AI SDK generateObject/generateText calls.
 * Mimics the v1 createLangfuseCallback metadata structure:
 * - organizationId as userId (for cost tracking)
 * - sessionId for grouping logical requests
 * - tags array for filtering in Langfuse
 * - tenant/organization IDs in trace metadata
 */
export function buildTelemetry(
	functionId: string,
	ctx?: TelemetryContext,
	tags?: string[],
) {
	if (!config.langfuse.enabled || !ctx) {
		return { isEnabled: false as const };
	}

	const metadata: Record<string, string | string[]> = {
		userId: ctx.organizationId,
		tags: [...(tags ?? []), functionId],
		organization_id: ctx.organizationId,
	};
	if (ctx.sessionId != null) metadata.sessionId = ctx.sessionId;
	if (ctx.tenantId != null) metadata.tenant_id = ctx.tenantId;

	return {
		isEnabled: true as const,
		functionId,
		metadata,
	};
}
