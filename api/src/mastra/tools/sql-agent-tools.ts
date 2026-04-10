import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { vizSpecSchema } from "../../schemas/vizspec.schema";
import { executeEmbeddedSql } from "../../services/embedded-querypanel-sdk.service";
import { createLogger } from "../../lib/logger";
import { SqlValidatorService } from "../../services/sql-validator.service";
import type { TenantSettings } from "../../services/schema-storage.service";
import { getMastraRuntime } from "../runtime";
import type { AuthContext } from "../../types/auth";
import type { ContextChunk } from "../../types/query";
import { SqlGeneratorV2Service } from "../../services/v2/sql-generator-v2.service";
import {
	ensureTenantParam,
	validateDialectCompatibility,
	verifyTenantIsolation,
} from "../../services/v2/tenant-verification.service";

const logger = createLogger("mastra:sql-tools");
const sqlGenerator = new SqlGeneratorV2Service();
const sqlValidator = new SqlValidatorService();

function qualifyBigQueryDatasetTables(
	sql: string,
	opts: { dataset: string; datasetProjectId?: string },
) {
	const dataset = opts.dataset?.trim();
	const datasetProjectId = opts.datasetProjectId?.trim();
	if (!dataset || !datasetProjectId) return sql;

	// Rewrite `dataset.table` -> `project.dataset.table` inside backticks only.
	// This avoids relying on BigQuery default project resolution, which can vary
	// by credentials and often causes "dataset not found" errors.
	const pattern = new RegExp(
		`\\\`${dataset.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\.([A-Za-z0-9_]+)\\\``,
		"g",
	);
	return sql.replace(
		pattern,
		(_match, table: string) => `\`${datasetProjectId}.${dataset}.${table}\``,
	);
}

function escapeRegex(str: string) {
	return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function ensureBigQueryTableAliases(sql: string) {
	const clausePattern =
		/\b(FROM|JOIN)\s+`([^`]+)`(?=\s+(?:WHERE|GROUP|ORDER|LIMIT|JOIN|LEFT|RIGHT|FULL|INNER|CROSS|ON|USING|HAVING|UNION|QUALIFY)\b|\s*$)/gi;

	return sql.replace(clausePattern, (match, clause: string, identifier: string) => {
		const tableName = identifier.split(".").pop()?.trim();
		if (!tableName) {
			return match;
		}

		const qualifiedColumnPattern = new RegExp(`\\b${escapeRegex(tableName)}\\.`, "i");
		if (!qualifiedColumnPattern.test(sql)) {
			return match;
		}

		return `${clause} \`${identifier}\` AS ${tableName}`;
	});
}

const jsonValueSchema: z.ZodType<unknown> = z.lazy(() =>
	z.union([
		z.string(),
		z.number(),
		z.boolean(),
		z.null(),
		z.array(jsonValueSchema),
		z.record(z.string(), jsonValueSchema),
	]),
);

const looseRecordSchema = z.record(z.string(), jsonValueSchema);

const optionalLooseStringSchema = z.preprocess((value) => {
	if (value == null) {
		return undefined;
	}

	if (typeof value !== "string") {
		return value;
	}

	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : undefined;
}, z.string().optional());

const optionalUuidSchema = z.string().uuid().optional();

const requestIdentitySchema = z.object({
	organizationId: optionalLooseStringSchema,
	tenantId: optionalLooseStringSchema,
	userId: optionalLooseStringSchema,
	datasourceId: optionalLooseStringSchema,
});

const tenantSettingsSchema = z.object({
	tenantFieldName: z.string(),
	tenantFieldType: z.string(),
	enforceTenantIsolation: z.boolean(),
});

const contextChunkSchema = z.object({
	source: z.string(),
	pageContent: z.string(),
	metadata: looseRecordSchema.default({}),
	score: z.number().nullable().optional(),
});

const generatedParamSchema = z.object({
	name: z.string(),
	value: z.union([
		z.string(),
		z.number(),
		z.boolean(),
		z.array(z.string()),
		z.array(z.number()),
	]),
	description: z.string().nullable().optional(),
});

const searchSchemaInputSchema = requestIdentitySchema.extend({
	question: z.string().min(1),
	database: optionalLooseStringSchema,
	dialect: optionalLooseStringSchema,
});

const searchSchemaOutputSchema = z.object({
	chunks: z.array(contextChunkSchema),
	primaryTable: z.string().nullable(),
	database: z.string().nullable(),
	dialect: z.string().nullable(),
	tenantSettings: tenantSettingsSchema.nullable(),
});

const generateSqlInputSchema = requestIdentitySchema.extend({
	question: z.string().min(1),
	database: optionalLooseStringSchema,
	dialect: optionalLooseStringSchema,
	contextChunks: z
		.array(contextChunkSchema)
		.min(1, "At least one schema context chunk is required"),
	primaryTable: z.string().nullable().optional(),
	tenantSettings: tenantSettingsSchema.nullable().optional(),
});

const generateSqlOutputSchema = z.object({
	sql: z.string(),
	params: z.array(generatedParamSchema),
	dialect: z.string(),
	database: z.string().nullable(),
	rationale: z.string().nullable(),
});

const executeSqlInputSchema = requestIdentitySchema.extend({
	sql: z.string().min(1),
	database: optionalLooseStringSchema,
	params: z
		.union([
			z.array(looseRecordSchema),
			looseRecordSchema,
		])
		.optional(),
});

const executeSqlOutputSchema = z.object({
	rows: z.array(looseRecordSchema),
	fields: z.array(z.string()),
	rowCount: z.number(),
	database: z.string(),
	dialect: z.string(),
	datasource: z.object({
		id: z.string(),
		name: z.string(),
		dialect: z.string(),
	}),
});

const generateVisualizationInputSchema = requestIdentitySchema.extend({
	question: z.string().min(1),
	sql: z.string().min(1),
	rationale: optionalLooseStringSchema,
	database: optionalLooseStringSchema,
	fields: z
		.preprocess((value) => {
			// Some agent steps pass `fields: []`; treat that as "not provided"
			// so the tool can re-execute SQL and infer fields from the result.
			return Array.isArray(value) && value.length === 0 ? undefined : value;
		}, z.array(z.string()).min(1).optional()),
	rows: z
		.preprocess((value) => {
			// Some agent steps pass `rows: []`; treat that as "not provided"
			// so the tool can re-execute SQL and populate rows.
			return Array.isArray(value) && value.length === 0 ? undefined : value;
		}, z.array(looseRecordSchema).min(1).optional()),
	params: z
		.union([
			z.array(looseRecordSchema),
			looseRecordSchema,
		])
		.optional(),
	maxRetries: z.number().int().min(1).max(5).optional(),
});

const generateVisualizationOutputSchema = z.object({
	spec: vizSpecSchema,
	notes: z.string().nullable(),
});

function parseToolInput<TSchema extends z.ZodType>(schema: TSchema, input: unknown) {
	return schema.parse(input) as z.output<TSchema>;
}

function readRequestValue(
	requestContext: { get: (key: string) => unknown } | undefined,
	key: string,
) {
	const value = requestContext?.get(key);
	if (typeof value !== "string") {
		return undefined;
	}

	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : undefined;
}

function resolveTrustedRequestValue(
	inputValue: string | undefined,
	requestContext: { get: (key: string) => unknown } | undefined,
	key: "organizationId" | "tenantId" | "userId" | "datasourceId",
) {
	const requestValue = readRequestValue(requestContext, key);
	if (requestValue) {
		if (inputValue && inputValue !== requestValue) {
			logger.warn(
				{ key, inputValue, requestValue },
				"Mastra tool input conflicted with requestContext; using requestContext value",
			);
		}
		return requestValue;
	}
	return inputValue;
}

export function buildAuthContext(
	input: z.infer<typeof requestIdentitySchema>,
	requestContext?: { get: (key: string) => unknown },
): AuthContext {
	return {
		method: "jwt",
		organizationId: resolveTrustedRequestValue(
			input.organizationId,
			requestContext,
			"organizationId",
		),
		tenantId: resolveTrustedRequestValue(
			input.tenantId,
			requestContext,
			"tenantId",
		),
		userId: resolveTrustedRequestValue(input.userId, requestContext, "userId"),
		scopes: [],
		roles: [],
	};
}

export function resolveDatasourceId(
	input: z.infer<typeof requestIdentitySchema>,
	requestContext?: { get: (key: string) => unknown },
) {
	const datasourceId = resolveTrustedRequestValue(
		input.datasourceId,
		requestContext,
		"datasourceId",
	);

	if (!datasourceId) {
		throw new Error(
			"datasourceId is required in tool input or requestContext. Refusing to fall back to the first organization datasource.",
		);
	}

	const parsedDatasourceId = optionalUuidSchema.safeParse(datasourceId);
	if (!parsedDatasourceId.success) {
		throw new Error(
			"datasourceId must be a valid UUID when provided in tool input or requestContext.",
		);
	}

	return parsedDatasourceId.data;
}

function requireOrganizationId(auth: AuthContext) {
	if (!auth.organizationId) {
		throw new Error(
			"organizationId is required. Provide it in tool input or requestContext.",
		);
	}
	return auth.organizationId;
}

async function resolveDatasourceDefaults(
	organizationId: string,
	datasourceId: string,
) {
	const datasource = await getMastraRuntime().datasourceService.getDatasourceForOrg(
		organizationId,
		datasourceId,
	);
	if (!datasource) {
		throw new Error(
			`Datasource not found for organization ${organizationId} and datasourceId ${datasourceId}.`,
		);
	}
	const dialect = datasource?.dialect?.toLowerCase();
	return {
		datasource,
		database: datasource?.database_name,
		dialect,
	};
}

function logResolvedDatasource(
	toolName: string,
	organizationId: string,
	datasourceId: string,
	defaults: Awaited<ReturnType<typeof resolveDatasourceDefaults>>,
) {
	logger.info(
		{
			toolName,
			organizationId,
			datasourceId,
			resolvedDatasourceId: defaults.datasource.id,
			resolvedDatasourceName: defaults.datasource.name,
			resolvedDatabase: defaults.database,
			resolvedDialect: defaults.dialect,
		},
		"Resolved datasource defaults for Mastra tool",
	);
}

function resolveDatasourceBoundValue(
	toolName: string,
	field: "database" | "dialect",
	inputValue: string | undefined,
	defaultValue: string | undefined | null,
) {
	const normalizedDefault =
		typeof defaultValue === "string" && defaultValue.trim().length > 0
			? defaultValue.trim()
			: undefined;
	const normalizedInput =
		typeof inputValue === "string" && inputValue.trim().length > 0
			? inputValue.trim()
			: undefined;

	if (!normalizedDefault) {
		return normalizedInput;
	}

	if (
		normalizedInput &&
		normalizedInput.toLowerCase() !== normalizedDefault.toLowerCase()
	) {
		logger.warn(
			{
				toolName,
				field,
				inputValue: normalizedInput,
				resolvedValue: normalizedDefault,
			},
			"Mastra tool input conflicted with datasource defaults; using datasource value",
		);
	}

	return normalizedDefault;
}

function assertSupportedSqlDialect(dialect?: string) {
	if (!dialect) {
		return;
	}

	if (
		dialect !== "postgres" &&
		dialect !== "clickhouse" &&
		dialect !== "bigquery"
	) {
		throw new Error(
			`SQL agent only supports postgres, clickhouse, and bigquery generation/execution. Received: ${dialect}`,
		);
	}
}

function mapGeneratedParams(params: Array<Record<string, unknown>>) {
	const record: Record<string, unknown> = {};

	params.forEach((param, index) => {
		const value = param.value;
		if (value === undefined) {
			return;
		}

		const nameCandidate =
			(typeof param.name === "string" && param.name.trim()) ||
			(typeof param.placeholder === "string" && param.placeholder.trim()) ||
			(typeof param.position === "number" && String(param.position)) ||
			String(index + 1);

		const key = nameCandidate
			.replace(/[{}]/g, "")
			.replace(/(.+):.*$/, "$1")
			.replace(/^[:$]/, "")
			.trim();

		record[key] = value;
	});

	return record;
}

function normalizeContextChunks(chunks: ContextChunk[]) {
	return chunks.map((chunk) => ({
		source: chunk.source,
		pageContent: chunk.pageContent,
		metadata:
			chunk.metadata && typeof chunk.metadata === "object"
				? chunk.metadata
				: {},
		score: chunk.score ?? null,
	}));
}

function resolveTenantSettings(
	inputTenantSettings: z.infer<typeof tenantSettingsSchema> | null | undefined,
	datasource?: {
		tenant_field_name?: string | null;
		tenant_field_type?: string | null;
	} | null,
): TenantSettings | undefined {
	if (inputTenantSettings?.tenantFieldName) {
		return inputTenantSettings;
	}

	const tenantFieldName = datasource?.tenant_field_name?.trim();
	if (!tenantFieldName) {
		return undefined;
	}

	return {
		tenantFieldName,
		tenantFieldType: datasource?.tenant_field_type ?? "String",
		enforceTenantIsolation: true,
	};
}

export const searchSchemaTool = createTool({
	id: "search_schema",
	description:
		"Search the indexed schema context for relevant tables, columns, glossary terms, and gold SQL examples.",
	inputSchema: searchSchemaInputSchema,
	outputSchema: searchSchemaOutputSchema,
	execute: async (rawInput, context) => {
		const input = parseToolInput(searchSchemaInputSchema, rawInput);
		const auth = buildAuthContext(input, context.requestContext);
		const organizationId = requireOrganizationId(auth);
		const datasourceId = resolveDatasourceId(input, context.requestContext);
		if (!datasourceId) {
			throw new Error("Missing datasourceId for execute_sql tool execution.");
		}
		const defaults = await resolveDatasourceDefaults(organizationId, datasourceId);
		logResolvedDatasource(
			"search_schema",
			organizationId,
			datasourceId,
			defaults,
		);
		const dialect = resolveDatasourceBoundValue(
			"search_schema",
			"dialect",
			input.dialect,
			defaults.dialect,
		);
		const database = resolveDatasourceBoundValue(
			"search_schema",
			"database",
			input.database,
			defaults.database,
		);

		assertSupportedSqlDialect(dialect);

		const result = await getMastraRuntime().hybridRetriever.retrieveTwoPass(
			input.question,
			organizationId,
			database,
			dialect,
		);

		return {
			chunks: normalizeContextChunks(result.chunks),
			primaryTable: result.primaryTable ?? null,
			database: result.database ?? null,
			dialect: result.dialect ?? null,
			tenantSettings: result.tenantSettings ?? null,
		};
	},
});

export const generateSqlTool = createTool({
	id: "generate_sql",
	description:
		"Generate SQL for a natural-language question using schema chunks returned by search_schema. Pass the chunks through unchanged, including each chunk's metadata.",
	inputSchema: generateSqlInputSchema,
	outputSchema: generateSqlOutputSchema,
	execute: async (rawInput, context) => {
		const input = parseToolInput(generateSqlInputSchema, rawInput);
		const auth = buildAuthContext(input, context.requestContext);
		const organizationId = requireOrganizationId(auth);
		const tenantId = auth.tenantId;
		const datasourceId = resolveDatasourceId(input, context.requestContext);
		if (!datasourceId) {
			throw new Error("Missing datasourceId for generate_sql tool execution.");
		}
		const defaults = await resolveDatasourceDefaults(organizationId, datasourceId);
		logResolvedDatasource(
			"generate_sql",
			organizationId,
			datasourceId,
			defaults,
		);
		const dialect = resolveDatasourceBoundValue(
			"generate_sql",
			"dialect",
			input.dialect,
			defaults.dialect,
		)?.toLowerCase();
		const database = resolveDatasourceBoundValue(
			"generate_sql",
			"database",
			input.database,
			defaults.database,
		);

		assertSupportedSqlDialect(dialect);

		const tenantSettings = resolveTenantSettings(
			input.tenantSettings,
			defaults.datasource,
		);

		logger.info(
			{
				organizationId,
				tenantId,
				datasourceId,
				database,
				dialect,
				contextChunkCount: input.contextChunks.length,
				primaryTable: input.primaryTable ?? null,
			},
			"Generating SQL from Mastra tool",
		);

		let result = await sqlGenerator.generate({
			question: input.question,
			contextChunks: normalizeContextChunks(
				input.contextChunks as ContextChunk[],
			) as ContextChunk[],
			primaryTable: input.primaryTable ?? undefined,
			dialect,
			tenantId,
			tenantSettings,
		});

		result = ensureTenantParam(result, tenantId, tenantSettings);
		validateDialectCompatibility(result);

		const sqlWithLimit = sqlValidator.ensureLimit(result.sql);
		if (sqlWithLimit !== result.sql) {
			result = { ...result, sql: sqlWithLimit };
		}

		sqlValidator.validate(result.sql);
		verifyTenantIsolation(result.sql, tenantId, tenantSettings, result.dialect);

		return {
			sql: result.sql,
			params: result.params as Array<z.infer<typeof generatedParamSchema>>,
			dialect: result.dialect,
			database: database ?? null,
			rationale: result.rationale ?? null,
		};
	},
});

export const executeSqlTool = createTool({
	id: "execute_sql",
	description:
		"Execute SQL against the organization datasource resolved from public.datasources using the QueryPanel SDK execution path.",
	inputSchema: executeSqlInputSchema,
	outputSchema: executeSqlOutputSchema,
	execute: async (rawInput, context) => {
		const normalizeBigQueryParamValue = (value: unknown) => {
			if (typeof value !== "string") return value;
			const v = value.trim();

			// BigQuery DATE parameters should be "YYYY-MM-DD" (not "YYYY-MM-DD HH:MM:SS").
			// The model sometimes produces datetime-like strings for DATE comparisons which BigQuery rejects.
			// We normalize these to date-only to keep execution stable without touching SQL text.
			const dateTimePrefix = v.match(
				/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})(\.\d+)?(Z|[+-]\d{2}:\d{2})?$/,
			);
			if (dateTimePrefix) {
				return dateTimePrefix[1];
			}

			return value;
		};

		const normalizeBigQueryParamsObject = (raw: Record<string, unknown>) => {
			const out: Record<string, unknown> = {};
			for (const [key, value] of Object.entries(raw)) {
				out[key] = normalizeBigQueryParamValue(value);
			}
			return out;
		};

		const input = parseToolInput(executeSqlInputSchema, rawInput);
		const auth = buildAuthContext(input, context.requestContext);
		const organizationId = requireOrganizationId(auth);

		const datasourceId = resolveDatasourceId(input, context.requestContext);
		if (!datasourceId) {
			throw new Error("Missing datasourceId for execute_sql tool execution.");
		}
		const defaults = await resolveDatasourceDefaults(organizationId, datasourceId);
		logResolvedDatasource(
			"execute_sql",
			organizationId,
			datasourceId,
			defaults,
		);
		const dialect = resolveDatasourceBoundValue(
			"execute_sql",
			"dialect",
			undefined,
			defaults.dialect,
		);
		assertSupportedSqlDialect(dialect);

		if (!defaults.datasource) {
			throw new Error(
				"No datasource available. Add a Postgres, ClickHouse, or BigQuery datasource for this organization.",
			);
		}

		const params = Array.isArray(input.params)
			? mapGeneratedParams(input.params)
			: (input.params ?? {});

		const normalizedParams =
			dialect === "bigquery"
				? normalizeBigQueryParamsObject(params as Record<string, unknown>)
				: params;

		const sql =
			dialect === "bigquery"
				? ensureBigQueryTableAliases(
						qualifyBigQueryDatasetTables(input.sql, {
							dataset: defaults.database ?? defaults.datasource.database_name,
							datasetProjectId:
								(defaults.datasource as { bigquery_dataset_project_id?: string | null })
									.bigquery_dataset_project_id ?? undefined,
						}),
					)
				: input.sql;

		const { execution, databaseName } = await executeEmbeddedSql(
			auth,
			getMastraRuntime(),
			{
				sql,
				params: normalizedParams,
				database: input.database ?? defaults.database ?? undefined,
				datasourceId,
			},
		);

		return {
			rows: execution.rows as Array<Record<string, unknown>>,
			fields: execution.fields,
			rowCount: execution.rows.length,
			database: input.database ?? defaults.database ?? databaseName,
			dialect: dialect ?? defaults.datasource.dialect,
			datasource: {
				id: defaults.datasource.id,
				name: defaults.datasource.name,
				dialect: defaults.datasource.dialect,
			},
		};
	},
});

export const generateVisualizationTool = createTool({
	id: "generate_visualization",
	description:
		"Generate a VizSpec visualization from executed SQL results. Prefer passing execute_sql.rows and execute_sql.fields directly; if rows are omitted, the tool can re-execute the SQL from requestContext.",
	inputSchema: generateVisualizationInputSchema,
	outputSchema: generateVisualizationOutputSchema,
	execute: async (rawInput, context) => {
		const input = parseToolInput(generateVisualizationInputSchema, rawInput);
		let rows = input.rows ?? [];
		let fields = input.fields ?? [];

		if (!rows?.length) {
			const auth = buildAuthContext(input, context.requestContext);
			const organizationId = requireOrganizationId(auth);
			const datasourceId = resolveDatasourceId(input, context.requestContext);
			if (!datasourceId) {
				throw new Error(
					"Missing datasourceId for generate_visualization tool execution.",
				);
			}
			const defaults = await resolveDatasourceDefaults(organizationId, datasourceId);
			logResolvedDatasource(
				"generate_visualization",
				organizationId,
				datasourceId,
				defaults,
			);
			const dialect = resolveDatasourceBoundValue(
				"generate_visualization",
				"dialect",
				undefined,
				defaults.dialect,
			);

			assertSupportedSqlDialect(dialect);

			if (!defaults.datasource) {
				throw new Error(
					"No datasource available. Add a Postgres, ClickHouse, or BigQuery datasource for this organization.",
				);
			}

			const params = Array.isArray(input.params)
				? mapGeneratedParams(input.params)
				: (input.params ?? {});

			const sql =
				dialect === "bigquery"
					? ensureBigQueryTableAliases(
							qualifyBigQueryDatasetTables(input.sql, {
								dataset: defaults.database ?? defaults.datasource.database_name,
								datasetProjectId:
									(defaults.datasource as { bigquery_dataset_project_id?: string | null })
										.bigquery_dataset_project_id ?? undefined,
							}),
						)
					: input.sql;

			const { execution } = await executeEmbeddedSql(auth, getMastraRuntime(), {
				sql,
				params,
				database: input.database ?? defaults.database ?? undefined,
				datasourceId,
			});

			rows = execution.rows as Array<Record<string, unknown>>;
			fields = execution.fields;
		}

		if (!fields.length && rows.length > 0) {
			fields = Object.keys(rows[0] ?? {});
		}

		if (!rows.length) {
			throw new Error(
				"generate_visualization requires at least one result row. Pass execute_sql.rows or provide a SQL query that returns data.",
			);
		}

		if (!fields.length) {
			throw new Error(
				"generate_visualization requires fields. Pass execute_sql.fields or use a query whose result columns can be inferred.",
			);
		}

		const result = await getMastraRuntime().vizspecGenerator.generateWithRetry({
			question: input.question,
			sql: input.sql,
			rationale: input.rationale,
			fields,
			rows,
			maxRetries: input.maxRetries ?? 3,
		});

		return result;
	},
});
