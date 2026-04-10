/**
 * Centralized test configuration setup
 *
 * This file ensures all required environment variables are set before
 * any config or service modules are imported. This prevents the error:
 * "TypeError: undefined is not an object (evaluating 'config.models.chartGenerator')"
 *
 * IMPORTANT: This file should be imported BEFORE any service imports in tests.
 * Or better yet, use Bun's preload feature to load this automatically.
 */

/**
 * Default test environment variables
 * These match production env var names and provide sensible defaults for testing
 */
export const DEFAULT_TEST_ENV = {
	// OpenAI API
	OPENAI_API_KEY: "sk-test-mock-key-12345",

	// Supabase
	SUPABASE_URL: "https://example.supabase.co",
	SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
	MASTRA_DATABASE_URL:
		"postgresql://postgres:postgres@127.0.0.1:5432/querypanel_test",

	// AI Models
	MODEL_SQL_GENERATOR: "gpt-4o-mini",
	MODEL_CHART_GENERATOR: "gpt-4o-mini",
	MODEL_GUARDRAIL: "gpt-4o-mini",
	MODEL_MODERATION: "omni-moderation-latest",

	// Database
	DB_TABLE_NAME: "schema_chunks",
	DB_QUERY_NAME: "match_documents",

	// Auth (optional)
	SERVICE_API_KEY: "test-service-api-key",

	// Langfuse (optional)
	LANGFUSE_ENABLED: "false",

	// Node environment
	NODE_ENV: "test",
} as const;

/**
 * Sets up test environment variables
 * Only sets variables that are not already defined
 *
 * @param overrides - Optional overrides for specific env vars
 */
export function setupTestEnv(overrides: Record<string, string> = {}): void {
	const envVars = { ...DEFAULT_TEST_ENV, ...overrides };

	for (const [key, value] of Object.entries(envVars)) {
		if (!process.env[key]) {
			process.env[key] = value;
		}
	}
}

/**
 * Resets specific test environment variables
 * Useful for cleanup between tests
 *
 * @param keys - Optional array of specific keys to reset. If not provided, resets all DEFAULT_TEST_ENV keys
 */
export function resetTestEnv(keys?: string[]): void {
	const keysToReset = keys ?? Object.keys(DEFAULT_TEST_ENV);

	for (const key of keysToReset) {
		delete process.env[key];
	}
}

// Auto-setup: Set env vars when this module is imported
// This ensures env vars are available before config is loaded
setupTestEnv();
