import { CallbackHandler } from "@langfuse/langchain";
import { trace } from "@opentelemetry/api";
import { config } from "../config";

export interface LangfuseMetadata {
	organizationId: string;
	tenantId?: string;
	userId?: string;
	sessionId?: string;
	operation?: string;
	tags?: string[];
	metadata?: Record<string, any>;
}

/**
 * Create a Langfuse CallbackHandler for LangChain with metadata
 * This allows tracing individual LLM calls with organization and tenant context
 *
 * @param metadata - Context metadata including organizationId, tenantId, operation, etc.
 * @returns CallbackHandler instance or undefined if Langfuse is not configured
 */
export function createLangfuseCallback(
	metadata: LangfuseMetadata,
): CallbackHandler | undefined {
	// Only create callbacks if Langfuse is enabled
	if (
		!config.langfuse.enabled ||
		!config.langfuse.publicKey ||
		!config.langfuse.secretKey
	) {
		return undefined;
	}

	try {
		// Get current OpenTelemetry trace context
		const currentSpan = trace.getActiveSpan();
		const traceId = currentSpan?.spanContext().traceId;

		// Build tags array
		const tags: string[] = [
			...(metadata.tags || []),
			...(metadata.operation ? [metadata.operation] : []),
		];

		// Build trace metadata
		const traceMetadata: Record<string, any> = {
			tenant_id: metadata.tenantId,
			organization_id: metadata.organizationId,
			session_id: metadata.sessionId,
			...(traceId && { otel_trace_id: traceId }),
			...(metadata.metadata || {}),
		};

		// Create the callback handler
		const callbackHandler = new CallbackHandler({
			// Use organization_id as userId for cost tracking
			userId: metadata.organizationId,
			// Use explicit sessionId when provided to group all spans for a logical request
			sessionId: metadata.sessionId,
			tags,
			traceMetadata,
		});

		return callbackHandler;
	} catch (error) {
		console.error("Failed to create Langfuse callback:", error);
		return undefined;
	}
}

/**
 * Helper to get trace ID from current OpenTelemetry context
 * Useful for correlating logs with traces
 */
export function getCurrentTraceId(): string | undefined {
	try {
		const currentSpan = trace.getActiveSpan();
		return currentSpan?.spanContext().traceId;
	} catch {
		return undefined;
	}
}
