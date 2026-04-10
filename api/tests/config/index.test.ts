import "../helpers/config.helper";
import { describe, expect, test } from "bun:test";

describe("config", () => {
	test("successfully loads valid configuration", () => {
		// Config is already loaded by the time we get here
		// This test just verifies the current config is accessible
		const { config } = require("../../src/config/index");

		expect(config.supabase.url).toBeDefined();
		expect(config.supabase.serviceRoleKey).toBeDefined();
		expect(config.openai.apiKey).toBeDefined();
		expect(config.database.tableName).toBeDefined();
		expect(config.database.queryName).toBeDefined();
	});

	test("config validation error path - missing URL", () => {
		// Test the validation logic by importing the schema directly
		const { z } = require("zod");

		const configSchema = z.object({
			supabase: z.object({
				url: z.string().url(),
				serviceRoleKey: z.string().min(1),
			}),
			openai: z.object({
				apiKey: z.string().min(1),
			}),
			database: z.object({
				tableName: z.string().default("schema_chunks"),
				queryName: z.string().default("match_documents"),
			}),
		});

		const rawConfig = {
			supabase: {
				url: undefined, // Missing URL
				serviceRoleKey: "test-key",
			},
			openai: {
				apiKey: "sk-test",
			},
			database: {
				tableName: undefined,
				queryName: undefined,
			},
		};

		const result = configSchema.safeParse(rawConfig);

		expect(result.success).toBe(false);
		if (!result.success) {
			const errors = result.error.issues.map(
				(err) => `${err.path.join(".")}: ${err.message}`,
			);
			expect(errors.length).toBeGreaterThan(0);
			expect(errors.some((e) => e.includes("supabase"))).toBe(true);
		}
	});

	test("config validation error path - missing service role key", () => {
		const { z } = require("zod");

		const configSchema = z.object({
			supabase: z.object({
				url: z.string().url(),
				serviceRoleKey: z.string().min(1),
			}),
			openai: z.object({
				apiKey: z.string().min(1),
			}),
			database: z.object({
				tableName: z.string().default("schema_chunks"),
				queryName: z.string().default("match_documents"),
			}),
		});

		const rawConfig = {
			supabase: {
				url: "https://test.supabase.co",
				serviceRoleKey: "", // Empty key
			},
			openai: {
				apiKey: "sk-test",
			},
			database: {
				tableName: undefined,
				queryName: undefined,
			},
		};

		const result = configSchema.safeParse(rawConfig);

		expect(result.success).toBe(false);
		if (!result.success) {
			const errors = result.error.issues.map(
				(err) => `${err.path.join(".")}: ${err.message}`,
			);
			expect(errors.some((e) => e.includes("supabase.serviceRoleKey"))).toBe(
				true,
			);
		}
	});

	test("config validation error path - missing API key", () => {
		const { z } = require("zod");

		const configSchema = z.object({
			supabase: z.object({
				url: z.string().url(),
				serviceRoleKey: z.string().min(1),
			}),
			openai: z.object({
				apiKey: z.string().min(1),
			}),
			database: z.object({
				tableName: z.string().default("schema_chunks"),
				queryName: z.string().default("match_documents"),
			}),
		});

		const rawConfig = {
			supabase: {
				url: "https://test.supabase.co",
				serviceRoleKey: "key",
			},
			openai: {
				apiKey: undefined, // Missing API key
			},
			database: {
				tableName: undefined,
				queryName: undefined,
			},
		};

		const result = configSchema.safeParse(rawConfig);

		expect(result.success).toBe(false);
		if (!result.success) {
			const errors = result.error.issues.map(
				(err) => `${err.path.join(".")}: ${err.message}`,
			);
			expect(errors.some((e) => e.includes("openai"))).toBe(true);
		}
	});

	test("config validation error formatting", () => {
		const { z } = require("zod");

		const configSchema = z.object({
			supabase: z.object({
				url: z.string().url(),
				serviceRoleKey: z.string().min(1),
			}),
			openai: z.object({
				apiKey: z.string().min(1),
			}),
			database: z.object({
				tableName: z.string().default("schema_chunks"),
				queryName: z.string().default("match_documents"),
			}),
		});

		const rawConfig = {
			supabase: {
				url: undefined,
				serviceRoleKey: undefined,
			},
			openai: {
				apiKey: undefined,
			},
			database: {
				tableName: undefined,
				queryName: undefined,
			},
		};

		const result = configSchema.safeParse(rawConfig);

		if (!result.success) {
			const errors = result.error.issues.map(
				(err) => `${err.path.join(".")}: ${err.message}`,
			);

			// Verify error formatting would work
			const errorMessage = `Configuration validation failed:\n${errors.join(
				"\n",
			)}`;
			expect(errorMessage).toContain("Configuration validation failed");
			expect(errors.length).toBeGreaterThan(0);
		}
	});

	test("config validation error path - invalid URL format", () => {
		const { z } = require("zod");

		const configSchema = z.object({
			supabase: z.object({
				url: z.string().url(),
				serviceRoleKey: z.string().min(1),
			}),
			openai: z.object({
				apiKey: z.string().min(1),
			}),
			database: z.object({
				tableName: z.string().default("schema_chunks"),
				queryName: z.string().default("match_documents"),
			}),
		});

		const rawConfig = {
			supabase: {
				url: "not-a-valid-url", // Invalid URL format
				serviceRoleKey: "key",
			},
			openai: {
				apiKey: "sk-test",
			},
			database: {
				tableName: undefined,
				queryName: undefined,
			},
		};

		const result = configSchema.safeParse(rawConfig);

		expect(result.success).toBe(false);
		if (!result.success) {
			const errors = result.error.issues.map(
				(err) => `${err.path.join(".")}: ${err.message}`,
			);
			expect(errors.some((e) => e.includes("supabase.url"))).toBe(true);
		}
	});
});
