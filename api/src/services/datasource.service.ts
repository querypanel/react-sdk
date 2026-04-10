import { BigQuery } from "@google-cloud/bigquery";
import type { BigQueryOptions } from "@google-cloud/bigquery";
import { OAuth2Client } from "google-auth-library";
import type { BigQueryClientFn } from "@querypanel/node-sdk";
import { createLogger } from "../lib/logger";
import { getVaultSecret } from "../lib/vault";
import { supabase } from "../lib/supabase";
import type { AuthContext } from "../types/auth";
import type { BigQueryMeta, DatasourceRow } from "../types/datasource";

const logger = createLogger("datasource-service");

export interface PostgresQueryResult {
	rows: Array<Record<string, unknown>>;
	fields: Array<{ name: string }>;
}

export type PostgresClientFn = (
	sql: string,
	params?: unknown[],
) => Promise<PostgresQueryResult>;

export interface AttachPostgresOptions {
	database?: string;
	name?: string;
	tenantFieldName?: string | null;
	tenantFieldType?: string | null;
	enforceTenantIsolation?: boolean;
}

export interface ClickHouseQueryParams {
	query: string;
	format?: string;
	query_params?: Record<string, unknown>;
}

export type ClickHouseClientFn = (
	params: ClickHouseQueryParams,
) => Promise<
	| Array<Record<string, unknown>>
	| Record<string, unknown>[]
	| { json: () => Promise<unknown> }
>;

export interface AttachClickHouseOptions {
	database?: string;
	name?: string;
	tenantFieldName?: string | null;
	tenantFieldType?: string | null;
	enforceTenantIsolation?: boolean;
}

export interface AttachBigQueryOptions {
	database?: string;
	name?: string;
	tenantFieldName?: string | null;
	tenantFieldType?: string | null;
	enforceTenantIsolation?: boolean;
	projectId: string;
	datasetProjectId?: string;
	dataset: string;
	location?: string;
}

const DATASOURCE_COLUMNS =
	"id,organization_id,name,dialect,host,port,database_name,username,password_secret_id,credentials_secret_id,ssl_mode,tenant_field_name,tenant_field_type,use_iam_auth,aws_region,aws_role_arn,bigquery_project_id,bigquery_dataset_project_id,bigquery_location,bigquery_meta";

const LIST_DATASOURCE_COLUMNS =
	"id,organization_id,name,dialect,host,port,database_name,username,ssl_mode,tenant_field_name,tenant_field_type,use_iam_auth,aws_region,aws_role_arn,bigquery_project_id,bigquery_dataset_project_id,bigquery_location,bigquery_meta,created_at,updated_at,created_by";

export type DatasourceListItem = Omit<DatasourceRow, "password_secret_id" | "credentials_secret_id">;

export async function listDatasourcesForOrg(
	organizationId: string,
): Promise<DatasourceListItem[]> {
	const { data, error } = await supabase
		.from("datasources")
		.select(LIST_DATASOURCE_COLUMNS)
		.eq("organization_id", organizationId)
		.order("created_at", { ascending: false });
	if (error) {
		logger.error({ error, organizationId }, "Failed to list datasources");
		throw new Error("Failed to list datasources");
	}
	return (data ?? []) as DatasourceListItem[];
}

export async function getDatasourceForOrg(
	organizationId: string,
	datasourceId?: string,
): Promise<DatasourceRow | null> {
	if (datasourceId) {
		const { data, error } = await supabase
			.from("datasources")
			.select(DATASOURCE_COLUMNS)
			.eq("organization_id", organizationId)
			.eq("id", datasourceId)
			.maybeSingle();
		if (error) {
			logger.error({ error, organizationId, datasourceId }, "Failed to fetch datasource");
			throw new Error("Failed to fetch datasource");
		}
		return data as DatasourceRow | null;
	}
	const { data, error } = await supabase
		.from("datasources")
		.select(DATASOURCE_COLUMNS)
		.eq("organization_id", organizationId)
		.order("created_at", { ascending: true })
		.limit(1)
		.maybeSingle();
	if (error) {
		logger.error({ error, organizationId }, "Failed to fetch datasource");
		throw new Error("Failed to fetch datasource");
	}
	return data as DatasourceRow | null;
}

async function resolveDatasourcePassword(row: DatasourceRow): Promise<string> {
	if (row.use_iam_auth) {
		logger.warn(
			{ datasourceId: row.id },
			"IAM auth not implemented in embed flow; add @aws-sdk/rds-signer to support",
		);
		throw new Error("IAM authentication for datasources is not yet supported in embed routes");
	}
	if (!row.password_secret_id) {
		throw new Error("Datasource has no password configured");
	}
	return getVaultSecret(row.password_secret_id);
}

async function resolveDatasourceCredentials(row: DatasourceRow): Promise<string> {
	if (!row.credentials_secret_id) {
		return "";
	}
	return getVaultSecret(row.credentials_secret_id);
}

function ensureSqlConnectionFields(row: DatasourceRow): {
	host: string;
	port: number;
	username: string;
} {
	if (!row.host || !row.port || !row.username) {
		throw new Error(`Datasource ${row.name} is missing host, port, or username`);
	}
	return {
		host: row.host,
		port: row.port,
		username: row.username,
	};
}

function buildConnectionConfig(
	row: DatasourceRow,
	password: string,
): { connectionString: string; ssl: boolean | object } {
	const { host, port, username } = ensureSqlConnectionFields(row);
	const ssl = row.ssl_mode === "disable" ? false : { rejectUnauthorized: false };
	const protocol = "postgresql";
	const user = encodeURIComponent(username);
	const pass = encodeURIComponent(password);
	const db = encodeURIComponent(row.database_name);
	const connectionString = `${protocol}://${user}:${pass}@${host}:${port}/${db}`;
	return { connectionString, ssl };
}

function buildClickHouseClientFn(
	row: DatasourceRow,
	password: string,
): ClickHouseClientFn {
	const { host, port, username } = ensureSqlConnectionFields(row);
	const protocol = row.ssl_mode === "require" || row.ssl_mode === "verify-full" ? "https" : "http";
	const url = `${protocol}://${host}:${port}`;
	let client: import("@clickhouse/client").ClickHouseClient | null = null;
	const getClient = async () => {
		if (client) return client;
		const { createClient } = await import("@clickhouse/client");
		client = createClient({
			url,
			username,
			password,
			database: row.database_name,
		});
		return client;
	};
	return async (params: ClickHouseQueryParams) => {
		const c = await getClient();
		const result = await c.query({
			query: params.query,
			format: (params.format as "JSONEachRow") ?? "JSONEachRow",
			query_params: params.query_params,
		});
		return result as { json: () => Promise<unknown> };
	};
}

function parseBigQueryCredentials(raw: string): BigQueryOptions["credentials"] {
	try {
		const parsed = JSON.parse(raw) as BigQueryOptions["credentials"];
		if (!parsed || typeof parsed !== "object") {
			throw new Error("BigQuery credentials must be a JSON object");
		}
		return parsed;
	} catch (error) {
		throw new Error(
			error instanceof Error
				? `Invalid BigQuery credentials JSON: ${error.message}`
				: "Invalid BigQuery credentials JSON",
		);
	}
}

function normalizeBigQueryMeta(value: unknown): BigQueryMeta | null {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		return null;
	}
	const meta = value as Record<string, unknown>;
	const oauthRaw = meta.oauth;
	const oauth =
		oauthRaw && typeof oauthRaw === "object" && !Array.isArray(oauthRaw)
			? {
					refreshTokenSecretId:
						typeof (oauthRaw as Record<string, unknown>).refreshTokenSecretId === "string"
							? (oauthRaw as Record<string, unknown>).refreshTokenSecretId
							: undefined,
					accessTokenSecretId:
						typeof (oauthRaw as Record<string, unknown>).accessTokenSecretId === "string"
							? (oauthRaw as Record<string, unknown>).accessTokenSecretId
							: undefined,
					expiresAt:
						typeof (oauthRaw as Record<string, unknown>).expiresAt === "string"
							? (oauthRaw as Record<string, unknown>).expiresAt
							: undefined,
					subjectEmail:
						typeof (oauthRaw as Record<string, unknown>).subjectEmail === "string"
							? (oauthRaw as Record<string, unknown>).subjectEmail
							: undefined,
					scopes: Array.isArray((oauthRaw as Record<string, unknown>).scopes)
						? ((oauthRaw as Record<string, unknown>).scopes as unknown[]).filter(
								(scope): scope is string => typeof scope === "string",
							)
						: undefined,
					tokenUri:
						typeof (oauthRaw as Record<string, unknown>).tokenUri === "string"
							? (oauthRaw as Record<string, unknown>).tokenUri
							: undefined,
				}
			: undefined;

	const authMode = meta.authMode;
	return {
		authMode:
			authMode === "service_account_json" || authMode === "google_oauth"
				? authMode
				: undefined,
		projectId: typeof meta.projectId === "string" ? meta.projectId : undefined,
		datasetProjectId:
			typeof meta.datasetProjectId === "string" ? meta.datasetProjectId : undefined,
		location: typeof meta.location === "string" ? meta.location : undefined,
		credentialsSecretId:
			typeof meta.credentialsSecretId === "string"
				? meta.credentialsSecretId
				: undefined,
		oauth,
	};
}

async function resolveBigQueryConfig(row: DatasourceRow): Promise<AttachBigQueryOptions & {
	credentials?: BigQueryOptions["credentials"];
	oauth?: {
		refreshToken: string;
		tokenUri?: string;
	};
}> {
	const bigQueryMeta = normalizeBigQueryMeta(row.bigquery_meta);
	const authMode = bigQueryMeta?.authMode ?? "service_account_json";
	const credentialsRaw = await resolveDatasourceCredentials(row);
	const credentials = credentialsRaw ? parseBigQueryCredentials(credentialsRaw) : undefined;
	const projectId =
		bigQueryMeta?.projectId?.trim() ||
		row.bigquery_project_id?.trim() ||
		(typeof credentials?.project_id === "string" ? credentials.project_id : "");

	if (!projectId) {
		throw new Error("BigQuery project ID is required");
	}
	if (!row.database_name?.trim()) {
		throw new Error("BigQuery dataset is required");
	}
	const datasetProjectId =
		bigQueryMeta?.datasetProjectId?.trim() ||
		row.bigquery_dataset_project_id?.trim() ||
		projectId;

	const tenantFieldName = row.tenant_field_name ?? undefined;
	let oauth:
		| {
				refreshToken: string;
				tokenUri?: string;
		  }
		| undefined;
	if (authMode === "google_oauth") {
		const refreshTokenSecretId = bigQueryMeta?.oauth?.refreshTokenSecretId;
		if (!refreshTokenSecretId) {
			throw new Error("BigQuery Google OAuth is not connected (missing refresh token secret)");
		}
		const refreshToken = await getVaultSecret(refreshTokenSecretId);
		if (!refreshToken) {
			throw new Error("BigQuery Google OAuth refresh token is empty");
		}
		oauth = {
			refreshToken,
			tokenUri: bigQueryMeta?.oauth?.tokenUri,
		};
	}
	return {
		database: row.database_name,
		name: row.name,
		projectId,
		datasetProjectId,
		dataset: row.database_name.trim(),
		location: bigQueryMeta?.location?.trim() || row.bigquery_location?.trim() || undefined,
		tenantFieldName,
		tenantFieldType: row.tenant_field_type ?? "String",
		enforceTenantIsolation: Boolean(tenantFieldName),
		credentials: authMode === "service_account_json" ? credentials : undefined,
		oauth,
	};
}

/** OAuth refresh uses client_id + client_secret only; missing env on Vercel yields Google's `invalid_request`. */
function assertGoogleOAuthEnvForBigQuery(): void {
	const id = process.env.GOOGLE_OAUTH_CLIENT_ID?.trim();
	const secret = process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim();
	if (!id || !secret) {
		throw new Error(
			"BigQuery OAuth requires GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET on this server (set them on the querypanel-sdk Vercel project). Without them, token refresh fails with invalid_request.",
		);
	}
}

function extractGoogleApiErrorDetail(err: unknown): string | undefined {
	if (!err || typeof err !== "object") return undefined;
	const e = err as Record<string, unknown>;
	const response = e.response as Record<string, unknown> | undefined;
	const data = response?.data;
	if (data === undefined) return undefined;
	if (typeof data === "string") {
		const t = data.trim();
		return t.length > 0 ? t : undefined;
	}
	if (typeof data === "object" && data !== null) {
		const o = data as Record<string, unknown>;
		if (typeof o.error === "string") {
			const desc =
				typeof o.error_description === "string" ? o.error_description : "";
			return desc ? `${o.error}: ${desc}` : o.error;
		}
		const inner = o.error;
		if (inner && typeof inner === "object") {
			const msg = (inner as { message?: string }).message;
			if (typeof msg === "string" && msg.trim()) return msg.trim();
		}
		try {
			return JSON.stringify(data);
		} catch {
			return String(data);
		}
	}
	return undefined;
}

function wrapBigQueryClientError(err: unknown): never {
	const detail = extractGoogleApiErrorDetail(err);
	if (detail) {
		throw new Error(`BigQuery/Google client: ${detail}`, {
			cause: err instanceof Error ? err : undefined,
		});
	}
	throw err instanceof Error ? err : new Error(String(err));
}

function buildBigQueryClientFn(config: {
	projectId: string;
	datasetProjectId?: string;
	dataset?: string;
	location?: string;
	credentials?: BigQueryOptions["credentials"];
	oauth?: {
		refreshToken: string;
	};
}): BigQueryClientFn {
	let bigqueryPromise: Promise<BigQuery> | null = null;
	const getBigQuery = async () => {
		if (bigqueryPromise) return bigqueryPromise;
		bigqueryPromise = (async () => {
			if (config.oauth?.refreshToken) {
				assertGoogleOAuthEnvForBigQuery();
				const oauthClient = new OAuth2Client(
					process.env.GOOGLE_OAUTH_CLIENT_ID,
					process.env.GOOGLE_OAUTH_CLIENT_SECRET,
					process.env.GOOGLE_OAUTH_REDIRECT_URI,
				);
				oauthClient.setCredentials({
					refresh_token: config.oauth.refreshToken,
				});
				return new BigQuery({
					projectId: config.projectId,
					authClient: oauthClient,
				});
			}

			return new BigQuery({
				projectId: config.projectId,
				...(config.credentials ? { credentials: config.credentials } : {}),
			});
		})();
		return bigqueryPromise;
	};

	return async (request) => {
		try {
			const bigquery = await getBigQuery();
			const options: Parameters<typeof bigquery.createQueryJob>[0] = {
				query: request.query,
				...(config.dataset
					? {
							defaultDataset: {
								projectId: config.datasetProjectId ?? config.projectId,
								datasetId: config.dataset,
							},
						}
					: {}),
				...(config.location ? { location: config.location } : {}),
			};
			if (request.params && Object.keys(request.params).length > 0) {
				options.params = request.params as Record<string, unknown>;
			}
			if (request.dryRun) {
				options.dryRun = true;
			}

			const [job] = await bigquery.createQueryJob(options);
			if (request.dryRun) {
				return { rows: [], fields: [] };
			}

			const [rows] = await job.getQueryResults();
			const fields = rows.length > 0
				? Object.keys(rows[0] as Record<string, unknown>)
				: [];
			const normalizedRows = rows.map((row) => {
				const record: Record<string, unknown> = {};
				for (const [key, value] of Object.entries(row as Record<string, unknown>)) {
					if (typeof value === "object" && value !== null && "value" in value) {
						record[key] = (value as { value: unknown }).value;
					} else {
						record[key] = value;
					}
				}
				return record;
			});

			return { rows: normalizedRows, fields };
		} catch (err) {
			wrapBigQueryClientError(err);
		}
	};
}

export class DatasourceService {
	/**
	 * Convenience wrapper for consumers (e.g. Mastra tools) that need the raw
	 * datasource row without constructing a client fn.
	 */
	async getDatasourceForOrg(
		organizationId: string,
		datasourceId?: string,
	): Promise<DatasourceRow | null> {
		return getDatasourceForOrg(organizationId, datasourceId);
	}

	async getPostgresClientFn(
		auth: AuthContext,
		options?: { datasourceId?: string },
	): Promise<{
		clientFn: PostgresClientFn;
		metadata: AttachPostgresOptions;
	} | null> {
		const organizationId = auth.organizationId ?? "";
		if (!organizationId) {
			return null;
		}

		const row = await getDatasourceForOrg(organizationId, options?.datasourceId);
		if (row) {
			if (row.dialect !== "postgres") {
				logger.warn({ datasourceId: row.id, dialect: row.dialect }, "Embed only supports Postgres datasources");
				return null;
			}
			const password = await resolveDatasourcePassword(row);
			const { connectionString, ssl } = buildConnectionConfig(row, password);
			const tenantFieldName = row.tenant_field_name ?? undefined;
			const tenantFieldType = row.tenant_field_type ?? "String";

			const clientFn: PostgresClientFn = async (sql: string, params?: unknown[]) => {
				const pg = await import("pg");
				const client = new pg.Client({
					connectionString,
					ssl: ssl as import("pg").ClientConfig["ssl"],
				});
				try {
					await client.connect();
					const result = await client.query(sql, (params ?? []) as unknown[]);
					const rows = (result.rows ?? []) as Array<Record<string, unknown>>;
					const fields = (result.fields ?? []).map((f: { name: string }) => ({
						name: f.name,
					}));
					return { rows, fields };
				} finally {
					await client.end();
				}
			};

			return {
				clientFn,
				metadata: {
					database: row.database_name,
					name: row.name,
					tenantFieldName: tenantFieldName ?? undefined,
					tenantFieldType,
					enforceTenantIsolation: Boolean(tenantFieldName),
				},
			};
		}

		logger.debug("No datasource found for organization");
		return null;
	}

	async getClickHouseClientFn(
		auth: AuthContext,
		options?: { datasourceId?: string },
	): Promise<{
		clientFn: ClickHouseClientFn;
		metadata: AttachClickHouseOptions;
	} | null> {
		const organizationId = auth.organizationId ?? "";
		if (!organizationId) return null;

		const row = await getDatasourceForOrg(organizationId, options?.datasourceId);
		if (!row || row.dialect !== "clickhouse") {
			if (row && row.dialect !== "clickhouse") {
				logger.debug({ datasourceId: row.id, dialect: row.dialect }, "Datasource is not ClickHouse");
			}
			return null;
		}

		const password = await resolveDatasourcePassword(row);
		const clientFn = buildClickHouseClientFn(row, password);
		const tenantFieldName = row.tenant_field_name ?? undefined;
		const tenantFieldType = row.tenant_field_type ?? "String";

		return {
			clientFn,
			metadata: {
				database: row.database_name,
				name: row.name,
				tenantFieldName: tenantFieldName ?? undefined,
				tenantFieldType,
				enforceTenantIsolation: Boolean(tenantFieldName),
			},
		};
	}

	async getBigQueryClientFn(
		auth: AuthContext,
		options?: { datasourceId?: string },
	): Promise<{
		clientFn: BigQueryClientFn;
		metadata: AttachBigQueryOptions;
	} | null> {
		const organizationId = auth.organizationId ?? "";
		if (!organizationId) return null;

		const row = await getDatasourceForOrg(organizationId, options?.datasourceId);
		if (!row || row.dialect !== "bigquery") {
			if (row && row.dialect !== "bigquery") {
				logger.debug({ datasourceId: row.id, dialect: row.dialect }, "Datasource is not BigQuery");
			}
			return null;
		}

		const config = await resolveBigQueryConfig(row);
		return {
			clientFn: buildBigQueryClientFn(config),
			metadata: config,
		};
	}

	async getEmbedClient(
		auth: AuthContext,
		options?: { datasourceId?: string },
	): Promise<
		| {
				dialect: "postgres";
				clientFn: PostgresClientFn;
				metadata: AttachPostgresOptions;
		  }
		| {
				dialect: "clickhouse";
				clientFn: ClickHouseClientFn;
				metadata: AttachClickHouseOptions;
		  }
		| {
				dialect: "bigquery";
				clientFn: BigQueryClientFn;
				metadata: AttachBigQueryOptions;
		  }
		| null
	> {
		const organizationId = auth.organizationId ?? "";
		if (!organizationId) return null;

		const row = await getDatasourceForOrg(organizationId, options?.datasourceId);
		if (!row) {
			logger.debug("No datasource found for organization");
			return null;
		}

		const dialect = row.dialect.toLowerCase();
		if (dialect !== "postgres" && dialect !== "clickhouse" && dialect !== "bigquery") {
			logger.warn({ datasourceId: row.id, dialect: row.dialect }, "Embed does not support this datasource dialect");
			return null;
		}

		if (dialect === "postgres") {
			const password = await resolveDatasourcePassword(row);
			const { connectionString, ssl } = buildConnectionConfig(row, password);
			const tenantFieldName = row.tenant_field_name ?? undefined;
			const tenantFieldType = row.tenant_field_type ?? "String";
			const clientFn: PostgresClientFn = async (sql: string, params?: unknown[]) => {
				const pg = await import("pg");
				const client = new pg.Client({
					connectionString,
					ssl: ssl as import("pg").ClientConfig["ssl"],
				});
				try {
					await client.connect();
					const result = await client.query(sql, (params ?? []) as unknown[]);
					const rows = (result.rows ?? []) as Array<Record<string, unknown>>;
					const fields = (result.fields ?? []).map((f: { name: string }) => ({ name: f.name }));
					return { rows, fields };
				} finally {
					await client.end();
				}
			};
			return {
				dialect: "postgres",
				clientFn,
				metadata: {
					database: row.database_name,
					name: row.name,
					tenantFieldName: tenantFieldName ?? undefined,
					tenantFieldType,
					enforceTenantIsolation: Boolean(tenantFieldName),
				},
			};
		}

		if (dialect === "clickhouse") {
			const password = await resolveDatasourcePassword(row);
			const clientFn = buildClickHouseClientFn(row, password);
			const tenantFieldName = row.tenant_field_name ?? undefined;
			const tenantFieldType = row.tenant_field_type ?? "String";
			return {
				dialect: "clickhouse",
				clientFn,
				metadata: {
					database: row.database_name,
					name: row.name,
					tenantFieldName: tenantFieldName ?? undefined,
					tenantFieldType,
					enforceTenantIsolation: Boolean(tenantFieldName),
				},
			};
		}

		const config = await resolveBigQueryConfig(row);
		return {
			dialect: "bigquery",
			clientFn: buildBigQueryClientFn(config),
			metadata: config,
		};
	}

	async isEmbedDatabaseAvailable(auth: AuthContext, datasourceId?: string): Promise<boolean> {
		const orgId = auth.organizationId ?? "";
		if (!orgId) return false;
		const row = await getDatasourceForOrg(orgId, datasourceId);
		if (!row) return false;
		const d = row.dialect?.toLowerCase();
		return d === "postgres" || d === "clickhouse" || d === "bigquery";
	}
}
