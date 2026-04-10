import { LangfuseSpanProcessor } from "@langfuse/otel";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { config } from "../config";

let sdk: NodeSDK | undefined;

/**
 * Initialize OpenTelemetry instrumentation with Langfuse
 * Must be called before any other imports to ensure proper instrumentation
 *
 * Uses the official @langfuse/otel integration for comprehensive tracing
 */
export function initializeInstrumentation(): void {
	// Only initialize if Langfuse is enabled
	if (!config.langfuse.enabled) {
		console.log("Instrumentation disabled (LANGFUSE_ENABLED=false)");
		return;
	}

	if (!config.langfuse.publicKey || !config.langfuse.secretKey) {
		console.warn(
			"Langfuse credentials not provided. Skipping instrumentation.",
		);
		return;
	}

	try {
		// Create Langfuse span processor with credentials
		const langfuseProcessor = new LangfuseSpanProcessor({
			publicKey: config.langfuse.publicKey,
			secretKey: config.langfuse.secretKey,
			baseUrl: config.langfuse.host,
		});

		// Initialize OpenTelemetry SDK with Langfuse processor
		sdk = new NodeSDK({
			serviceName: "sql-agent-api",
			spanProcessor: langfuseProcessor,
			instrumentations: [
				getNodeAutoInstrumentations({
					// Disable instrumentation for specific modules if needed
					"@opentelemetry/instrumentation-fs": {
						enabled: false, // Disable filesystem instrumentation for less noise
					},
				}),
			],
		});

		// Start the SDK
		sdk.start();

		console.log("Langfuse instrumentation initialized successfully");
	} catch (error) {
		console.error("Failed to initialize Langfuse instrumentation:", error);
	}
}

/**
 * Flush traces to Langfuse (useful for serverless environments)
 * Call this at the end of your serverless function to ensure all traces are sent
 */
export async function flushInstrumentation(): Promise<void> {
	if (sdk) {
		await sdk.shutdown();
	}
}
