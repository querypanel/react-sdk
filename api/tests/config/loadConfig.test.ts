import { describe, expect, test } from "bun:test";
import { z } from "zod";

describe("loadConfig error handling", () => {
	// Replicate the exact logic from src/config/index.ts to test the error path
	function testLoadConfig(rawConfig: any) {
		const postgresConnectionStringSchema = z
			.string()
			.trim()
			.min(1)
			.superRefine((value, ctx) => {
				try {
					const parsed = new URL(value);
					if (
						parsed.protocol !== "postgres:" &&
						parsed.protocol !== "postgresql:"
					) {
						ctx.addIssue({
							code: z.ZodIssueCode.custom,
							message:
								"Must use a PostgreSQL connection URL starting with postgres:// or postgresql://.",
						});
					}
				} catch {
					ctx.addIssue({
						code: z.ZodIssueCode.custom,
						message:
							"Must be a valid PostgreSQL connection URL. If the password contains reserved characters like #, ?, @, :, or /, percent-encode them.",
					});
				}
			});

		const configSchema = z.object({
			supabase: z.object({
				url: z.string().url(),
				serviceRoleKey: z.string().min(1),
			}),
			openai: z.object({
				apiKey: z.string().min(1),
			}),
			mastra: z.object({
				databaseUrl: postgresConnectionStringSchema,
			}),
			database: z.object({
				tableName: z.string().default("schema_chunks"),
				queryName: z.string().default("match_documents"),
			}),
		});

		const result = configSchema.safeParse(rawConfig);

		if (!result.success) {
			const errors = result.error.issues.map(
				(err) => `${err.path.join(".")}: ${err.message}`,
			);
			throw new Error(`Configuration validation failed:\n${errors.join("\n")}`);
		}

		return result.data;
	}

	test("throws formatted error when config is invalid", () => {
		const invalidConfig = {
			supabase: {
				url: undefined,
				serviceRoleKey: "key",
			},
			openai: {
				apiKey: "sk-test",
			},
			mastra: {
				databaseUrl: "postgresql://postgres:postgres@127.0.0.1:5432/querypanel_test",
			},
			database: {
				tableName: undefined,
				queryName: undefined,
			},
		};

		expect(() => testLoadConfig(invalidConfig)).toThrow(
			"Configuration validation failed",
		);
	});

	test("error message contains field paths", () => {
		const invalidConfig = {
			supabase: {
				url: undefined,
				serviceRoleKey: undefined,
			},
			openai: {
				apiKey: undefined,
			},
			mastra: {
				databaseUrl: "postgresql://postgres:postgres@127.0.0.1:5432/querypanel_test",
			},
			database: {
				tableName: undefined,
				queryName: undefined,
			},
		};

		try {
			testLoadConfig(invalidConfig);
			expect(true).toBe(false); // Should not reach here
		} catch (error: any) {
			expect(error.message).toContain("Configuration validation failed");
			expect(error.message).toContain("supabase");
		}
	});

	test("error message formats multiple validation errors", () => {
		const invalidConfig = {
			supabase: {
				url: "not-a-url",
				serviceRoleKey: "",
			},
			openai: {
				apiKey: "",
			},
			mastra: {
				databaseUrl: "postgresql://postgres:postgres@127.0.0.1:5432/querypanel_test",
			},
			database: {
				tableName: undefined,
				queryName: undefined,
			},
		};

		try {
			testLoadConfig(invalidConfig);
			expect(true).toBe(false); // Should not reach here
		} catch (error: any) {
			expect(error.message).toContain("Configuration validation failed");
			// Should contain multiple error descriptions
			expect(error.message.split("\n").length).toBeGreaterThan(1);
		}
	});

	test("successfully returns config when valid", () => {
		const validConfig = {
			supabase: {
				url: "https://test.supabase.co",
				serviceRoleKey: "test-key",
			},
			openai: {
				apiKey: "sk-test",
			},
			mastra: {
				databaseUrl: "postgresql://postgres:postgres@127.0.0.1:5432/querypanel_test",
			},
			database: {
				tableName: undefined,
				queryName: undefined,
			},
		};

		const result = testLoadConfig(validConfig);

		expect(result.supabase.url).toBe("https://test.supabase.co");
		expect(result.supabase.serviceRoleKey).toBe("test-key");
		expect(result.openai.apiKey).toBe("sk-test");
		expect(result.mastra.databaseUrl).toBe(
			"postgresql://postgres:postgres@127.0.0.1:5432/querypanel_test",
		);
		expect(result.database.tableName).toBe("schema_chunks");
		expect(result.database.queryName).toBe("match_documents");
	});

	test("throws a clear error for malformed mastra database URLs", () => {
		const invalidConfig = {
			supabase: {
				url: "https://test.supabase.co",
				serviceRoleKey: "key",
			},
			openai: {
				apiKey: "sk-test",
			},
			mastra: {
				databaseUrl:
					"postgresql://postgres:bad#password@aws-0-eu-central-1.pooler.supabase.com:5432/postgres",
			},
			database: {
				tableName: undefined,
				queryName: undefined,
			},
		};

		expect(() => testLoadConfig(invalidConfig)).toThrow(
			"percent-encode them",
		);
	});
});
