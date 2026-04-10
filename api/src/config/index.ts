import { z } from "zod";

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
		postgresPoolMax: z.number().int().positive().default(5),
		postgresIdleTimeoutMillis: z.number().int().positive().default(5000),
	}),
	models: z.object({
		sqlGenerator: z.string().default("gpt-4o-mini"),
		chartGenerator: z.string().default("gpt-4o-mini"),
		guardrail: z.string().default("gpt-4o-mini"),
		schemaLinker: z.string().default("gpt-4o"),
		moderation: z.string().default("omni-moderation-latest"),
		queryRewriter: z.string().default("gpt-4o-mini"),
	}),
	autoEval: z.object({
		enabled: z.boolean().default(false),
		sampleRate: z.number().min(0).max(1).default(0.05),
		judgeModel: z.string().default("gpt-4o-mini"),
		timeoutMs: z.number().int().positive().optional(),
	}),
	database: z.object({
		tableName: z.string().default("schema_chunks"),
		queryName: z.string().default("match_documents"),
	}),
	auth: z.object({
		serviceApiKey: z.string().optional(),
	}),
	cors: z.object({
		allowedOrigins: z.array(z.string()).default(["*"]),
	}),
	langfuse: z.object({
		publicKey: z.string().optional(),
		secretKey: z.string().optional(),
		host: z.string().url().optional(),
		enabled: z.boolean().default(false),
	}),
	nodeEnv: z.string().default("development"),
});

type Config = z.infer<typeof configSchema>;

function loadConfig(): Config {
	const rawConfig = {
		supabase: {
			url: process.env.SUPABASE_URL,
			serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
		},
		openai: {
			apiKey: process.env.OPENAI_API_KEY,
		},
		mastra: {
			databaseUrl: process.env.MASTRA_DATABASE_URL,
			postgresPoolMax: process.env.MASTRA_PG_POOL_MAX
				? Number(process.env.MASTRA_PG_POOL_MAX)
				: undefined,
			postgresIdleTimeoutMillis: process.env.MASTRA_PG_IDLE_TIMEOUT_MS
				? Number(process.env.MASTRA_PG_IDLE_TIMEOUT_MS)
				: undefined,
		},
		models: {
			sqlGenerator: process.env.MODEL_SQL_GENERATOR,
			chartGenerator: process.env.MODEL_CHART_GENERATOR,
			guardrail: process.env.MODEL_GUARDRAIL,
			schemaLinker: process.env.MODEL_SCHEMA_LINKER,
			moderation: process.env.MODEL_MODERATION,
			queryRewriter: process.env.MODEL_QUERY_REWRITER,
		},
		autoEval: {
			enabled: process.env.AUTO_EVAL_ENABLED === "true",
			sampleRate: process.env.AUTO_EVAL_SAMPLE_RATE
				? Number(process.env.AUTO_EVAL_SAMPLE_RATE)
				: undefined,
			judgeModel: process.env.AUTO_EVAL_JUDGE_MODEL,
			timeoutMs: process.env.AUTO_EVAL_TIMEOUT_MS
				? Number(process.env.AUTO_EVAL_TIMEOUT_MS)
				: undefined,
		},
		database: {
			tableName: process.env.DB_TABLE_NAME,
			queryName: process.env.DB_QUERY_NAME,
		},
		auth: {
			serviceApiKey: process.env.SERVICE_API_KEY,
		},
		cors: {
			allowedOrigins: process.env.CORS_ALLOWED_ORIGINS
				? process.env.CORS_ALLOWED_ORIGINS.split(",")
						.map((origin) => origin.trim())
						.filter(Boolean)
				: ["*"],
		},
		langfuse: {
			publicKey: process.env.LANGFUSE_PUBLIC_KEY,
			secretKey: process.env.LANGFUSE_SECRET_KEY,
			host: process.env.LANGFUSE_HOST,
			enabled: process.env.LANGFUSE_ENABLED === "true",
		},
		nodeEnv: process.env.NODE_ENV,
	};

	const result = configSchema.safeParse(rawConfig);

	if (!result.success) {
		const errors = result.error.issues.map(
			(err) => `${err.path.join(".")}: ${err.message}`,
		);
		throw new Error(`Configuration validation failed:\n${errors.join("\n")}`);
	}

	return result.data;
}

export const config: Config = loadConfig();
