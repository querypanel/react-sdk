import { Client } from 'pg';
import { BigQuery } from '@google-cloud/bigquery';
import { Signer } from '@aws-sdk/rds-signer';
import { defaultProvider } from '@aws-sdk/credential-provider-node';
import { createAdminClient } from '@/lib/supabase/admin';

export type DatasourceDialect = 'postgres' | 'clickhouse' | 'bigquery';

export type BigQueryAuthMode = 'google_oauth';

export type BigQueryMeta = {
  authMode?: BigQueryAuthMode;
  projectId?: string;
  datasetProjectId?: string;
  location?: string;
  credentialsSecretId?: string;
  oauth?: {
    refreshTokenSecretId?: string;
    accessTokenSecretId?: string;
    expiresAt?: string;
    subjectEmail?: string;
    scopes?: string[];
    tokenUri?: string;
  };
};

export type DatasourceRow = {
  id: string;
  organization_id: string;
  name: string;
  dialect: DatasourceDialect;
  host: string | null;
  port: number | null;
  database_name: string;
  username: string | null;
  password_secret_id: string | null;
  credentials_secret_id: string | null;
  ssl_mode: string | null;
  use_iam_auth: boolean | null;
  aws_region: string | null;
  aws_role_arn: string | null;
  bigquery_project_id: string | null;
  bigquery_dataset_project_id: string | null;
  bigquery_location: string | null;
  bigquery_meta: BigQueryMeta | null;
  tenant_field_name: string | null;
  tenant_field_type: string | null;
  created_by: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export type DatasourceInput = {
  name: string;
  dialect: DatasourceDialect;
  host?: string | null;
  port?: number | null;
  database_name: string;
  username?: string | null;
  password?: string;
  ssl_mode?: string | null;
  use_iam_auth?: boolean | null;
  aws_region?: string | null;
  aws_role_arn?: string | null;
  bigquery_project_id?: string | null;
  bigquery_dataset_project_id?: string | null;
  bigquery_location?: string | null;
  bigquery_meta?: BigQueryMeta | null;
  tenant_field_name?: string | null;
  tenant_field_type?: string | null;
  created_by?: string | null;
};

export type DatasourceListItem = Omit<DatasourceRow, 'password_secret_id' | 'credentials_secret_id'> & {
  has_password: boolean;
  has_credentials: boolean;
};

export function toDatasourceListItem(row: DatasourceRow): DatasourceListItem {
  const { password_secret_id, credentials_secret_id, ...rest } = row;
  return {
    ...rest,
    has_password: Boolean(password_secret_id?.length),
    has_credentials: Boolean(password_secret_id?.length || credentials_secret_id?.length),
  };
}

function normalizeBigQueryMeta(value: unknown): BigQueryMeta | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const meta = value as Record<string, unknown>;
  const oauthRaw = meta.oauth;
  const oauthRecord =
    oauthRaw && typeof oauthRaw === 'object' && !Array.isArray(oauthRaw)
      ? (oauthRaw as Record<string, unknown>)
      : null;
  const oauth =
    oauthRecord
      ? {
          refreshTokenSecretId:
            typeof oauthRecord.refreshTokenSecretId === 'string'
              ? oauthRecord.refreshTokenSecretId
              : undefined,
          accessTokenSecretId:
            typeof oauthRecord.accessTokenSecretId === 'string'
              ? oauthRecord.accessTokenSecretId
              : undefined,
          expiresAt:
            typeof oauthRecord.expiresAt === 'string'
              ? oauthRecord.expiresAt
              : undefined,
          subjectEmail:
            typeof oauthRecord.subjectEmail === 'string'
              ? oauthRecord.subjectEmail
              : undefined,
          scopes: Array.isArray(oauthRecord.scopes)
            ? (oauthRecord.scopes as unknown[]).filter(
                (scope): scope is string => typeof scope === 'string'
              )
            : undefined,
          tokenUri:
            typeof oauthRecord.tokenUri === 'string'
              ? oauthRecord.tokenUri
              : undefined,
        }
      : undefined;

  const authMode = meta.authMode;
  return {
    authMode: authMode === 'google_oauth' ? authMode : undefined,
    projectId: typeof meta.projectId === 'string' ? meta.projectId : undefined,
    datasetProjectId:
      typeof meta.datasetProjectId === 'string' ? meta.datasetProjectId : undefined,
    location: typeof meta.location === 'string' ? meta.location : undefined,
    credentialsSecretId:
      typeof meta.credentialsSecretId === 'string' ? meta.credentialsSecretId : undefined,
    oauth,
  };
}

function buildBigQueryMeta(
  input: Partial<DatasourceInput>,
  credentialsSecretId: string | null
): BigQueryMeta {
  const provided = normalizeBigQueryMeta(input.bigquery_meta);
  return {
    authMode: 'google_oauth',
    projectId: provided?.projectId ?? input.bigquery_project_id ?? undefined,
    datasetProjectId:
      provided?.datasetProjectId ?? input.bigquery_dataset_project_id ?? undefined,
    location: provided?.location ?? input.bigquery_location ?? undefined,
    credentialsSecretId: credentialsSecretId ?? provided?.credentialsSecretId,
    oauth: provided?.oauth,
  };
}

export async function createVaultSecret(secret: string, name: string, description?: string): Promise<string> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc('create_secret', {
    secret,
    name: `datasource-${name}`,
    description: description ?? `Credential for datasource ${name}`,
  });

  if (error) {
    console.error('Failed to create vault secret:', {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
      vaultName: `datasource-${name}`,
    });
    throw new Error('Failed to store datasource credentials securely');
  }

  return data as string;
}

export async function buildDatasourceInsert(
  input: DatasourceInput,
  organizationId: string,
  createdBy: string
): Promise<Omit<DatasourceRow, 'id' | 'created_at' | 'updated_at'>> {
  const isBigQuery = input.dialect === 'bigquery';
  const passwordSecretId =
    !isBigQuery && input.password
      ? await createVaultSecret(input.password, input.name, `Password for datasource ${input.name}`)
      : null;
  const credentialsSecretId = null;
  const bigqueryMeta = isBigQuery ? buildBigQueryMeta(input, credentialsSecretId) : null;

  return {
    organization_id: organizationId,
    name: input.name,
    dialect: input.dialect,
    host: isBigQuery ? null : (input.host ?? null),
    port: isBigQuery ? null : (input.port ?? null),
    database_name: input.database_name,
    username: isBigQuery ? null : (input.username ?? null),
    password_secret_id: passwordSecretId,
    credentials_secret_id: credentialsSecretId,
    ssl_mode: isBigQuery ? null : (input.ssl_mode ?? 'require'),
    use_iam_auth: isBigQuery ? false : (input.use_iam_auth ?? false),
    aws_region: isBigQuery ? null : (input.aws_region ?? null),
    aws_role_arn: isBigQuery ? null : (input.aws_role_arn ?? null),
    bigquery_project_id: isBigQuery ? (input.bigquery_project_id ?? null) : null,
    bigquery_dataset_project_id: isBigQuery ? (input.bigquery_dataset_project_id ?? null) : null,
    bigquery_location: isBigQuery ? (input.bigquery_location ?? null) : null,
    bigquery_meta: bigqueryMeta,
    tenant_field_name: input.tenant_field_name ?? null,
    tenant_field_type: input.tenant_field_type ?? 'String',
    created_by: createdBy,
  };
}

export async function buildDatasourceUpdate(
  input: Partial<DatasourceInput> & { currentName?: string }
): Promise<Partial<DatasourceRow>> {
  const update: Partial<DatasourceRow> = {};
  const shouldUpdateBigQueryMeta =
    input.bigquery_meta !== undefined ||
    input.bigquery_project_id !== undefined ||
    input.bigquery_dataset_project_id !== undefined ||
    input.bigquery_location !== undefined;

  if (input.name !== undefined) update.name = input.name;
  if (input.dialect !== undefined) {
    update.dialect = input.dialect;

    if (input.dialect === 'bigquery') {
      update.host = null;
      update.port = null;
      update.username = null;
      update.password_secret_id = null;
      update.ssl_mode = null;
      update.use_iam_auth = false;
      update.aws_region = null;
      update.aws_role_arn = null;
    } else {
      update.bigquery_project_id = null;
      update.bigquery_dataset_project_id = null;
      update.bigquery_location = null;
      update.bigquery_meta = null;
      update.credentials_secret_id = null;
    }
  }

  if (input.host !== undefined) update.host = input.host ?? null;
  if (input.port !== undefined) update.port = input.port ?? null;
  if (input.database_name !== undefined) update.database_name = input.database_name;
  if (input.username !== undefined) update.username = input.username ?? null;
  if (input.ssl_mode !== undefined) update.ssl_mode = input.ssl_mode ?? null;
  if (input.use_iam_auth !== undefined) update.use_iam_auth = input.use_iam_auth;
  if (input.aws_region !== undefined) update.aws_region = input.aws_region ?? null;
  if (input.aws_role_arn !== undefined) update.aws_role_arn = input.aws_role_arn ?? null;
  if (input.bigquery_project_id !== undefined) update.bigquery_project_id = input.bigquery_project_id ?? null;
  if (input.bigquery_dataset_project_id !== undefined) update.bigquery_dataset_project_id = input.bigquery_dataset_project_id ?? null;
  if (input.bigquery_location !== undefined) update.bigquery_location = input.bigquery_location ?? null;
  if (shouldUpdateBigQueryMeta) {
    const existingMeta = normalizeBigQueryMeta(input.bigquery_meta);
    update.bigquery_meta = buildBigQueryMeta(
      {
        ...input,
        bigquery_meta: existingMeta,
      },
      null
    );
  }
  if (input.tenant_field_name !== undefined) update.tenant_field_name = input.tenant_field_name ?? null;
  if (input.tenant_field_type !== undefined) update.tenant_field_type = input.tenant_field_type ?? null;

  if (input.password !== undefined && input.password !== '') {
    const secretName = input.currentName || input.name || 'datasource';
    update.password_secret_id = await createVaultSecret(input.password, secretName, `Password for datasource ${secretName}`);
  }
  return update;
}

export async function getVaultSecret(secretId: string): Promise<string> {
  if (!secretId) return '';

  const admin = createAdminClient();
  const { data, error } = await admin.rpc('get_secret', {
    secret_id: secretId,
  });

  if (error) {
    console.error('Failed to retrieve vault secret:', error);
    throw new Error('Failed to retrieve datasource credentials from vault');
  }

  return (data as string) || '';
}

export async function getDatasourcePassword(row: DatasourceRow): Promise<string> {
  if (!row.password_secret_id) return '';
  return getVaultSecret(row.password_secret_id);
}

export async function resolveBigQueryDatasourceConfig(row: DatasourceRow): Promise<{
  projectId: string;
  datasetProjectId: string;
  dataset: string;
  location?: string;
  authMode: BigQueryAuthMode;
  oauth?: {
    refreshToken: string;
    tokenUri?: string;
  };
}> {
  const bigQueryMeta = normalizeBigQueryMeta(row.bigquery_meta);
  const authMode = 'google_oauth';
  const projectId =
    bigQueryMeta?.projectId?.trim() ||
    row.bigquery_project_id?.trim() ||
    '';

  if (!projectId) {
    throw new Error('BigQuery project ID is required');
  }
  if (!row.database_name?.trim()) {
    throw new Error('BigQuery dataset is required');
  }
  const datasetProjectId =
    bigQueryMeta?.datasetProjectId?.trim() ||
    row.bigquery_dataset_project_id?.trim() ||
    projectId;

  const refreshTokenSecretId = bigQueryMeta?.oauth?.refreshTokenSecretId;
  if (!refreshTokenSecretId) {
    throw new Error('BigQuery Google OAuth is not connected (missing refresh token secret)');
  }
  const refreshToken = await getVaultSecret(refreshTokenSecretId);
  if (!refreshToken) {
    throw new Error('BigQuery Google OAuth refresh token is empty');
  }
  const oauth: {
    refreshToken: string;
    tokenUri?: string;
  } = {
    refreshToken,
    tokenUri: bigQueryMeta?.oauth?.tokenUri,
  };
  return {
    projectId,
    datasetProjectId,
    dataset: row.database_name.trim(),
    location: bigQueryMeta?.location?.trim() || row.bigquery_location?.trim() || undefined,
    authMode,
    oauth,
  };
}

export async function resolveDatasourcePassword(
  row: DatasourceRow
): Promise<string> {
  if (row.use_iam_auth) {
    if (!row.host || !row.port || !row.username) {
      throw new Error('Host, port, and username are required for IAM auth');
    }
    const region = row.aws_region || process.env.AWS_REGION;
    if (!region) {
      throw new Error('AWS region is required for IAM auth');
    }
    return generateIamAuthToken({
      host: row.host,
      port: row.port,
      username: row.username,
      region,
    });
  }
  return getDatasourcePassword(row);
}

async function generateIamAuthToken({
  host,
  port,
  username,
  region,
}: {
  host: string;
  port: number;
  username: string;
  region: string;
}): Promise<string> {
  const signer = new Signer({
    hostname: host,
    port,
    username,
    region,
    credentials: defaultProvider(),
  });
  return signer.getAuthToken();
}

type ConnectionConfig =
  | {
      dialect: 'postgres' | 'clickhouse';
      host: string;
      port: number;
      database_name: string;
      username: string;
      password: string;
      ssl_mode?: string | null;
      use_iam_auth?: boolean | null;
      aws_region?: string | null;
      bigquery_project_id?: never;
      bigquery_location?: never;
      bigquery_credentials?: never;
    }
  | {
      dialect: 'bigquery';
      database_name: string;
      bigquery_project_id: string;
      bigquery_dataset_project_id?: string | null;
      bigquery_location?: string | null;
      bigquery_auth_mode?: BigQueryAuthMode;
      bigquery_oauth_refresh_token?: string | null;
      host?: never;
      port?: never;
      username?: never;
      password?: never;
      ssl_mode?: never;
      use_iam_auth?: never;
      aws_region?: never;
    };

export async function testDatasourceConnection(config: ConnectionConfig): Promise<void> {
  if (config.dialect === 'bigquery') {
    const projectId = config.bigquery_project_id?.trim();

    if (!projectId) {
      throw new Error('BigQuery project ID is required');
    }
    if (!config.database_name?.trim()) {
      throw new Error('BigQuery dataset is required');
    }

    if (!config.bigquery_oauth_refresh_token) {
      throw new Error('BigQuery Google OAuth refresh token is required');
    }
    const { OAuth2Client } = await import('google-auth-library');
    const oauthClient = new OAuth2Client(
      process.env.GOOGLE_OAUTH_CLIENT_ID,
      process.env.GOOGLE_OAUTH_CLIENT_SECRET,
      process.env.GOOGLE_OAUTH_REDIRECT_URI
    );
    oauthClient.setCredentials({
      refresh_token: config.bigquery_oauth_refresh_token,
    });
    const client = new BigQuery({
      projectId,
      authClient: oauthClient,
    });

    await client.createQueryJob({
      query: `SELECT 1 AS n FROM \`${config.bigquery_dataset_project_id?.trim() || projectId}.${config.database_name}.INFORMATION_SCHEMA.TABLES\` LIMIT 1`,
      location: config.bigquery_location?.trim() || undefined,
      dryRun: true,
    });
    return;
  }

  if (config.dialect === 'postgres') {
    if (config.use_iam_auth && !config.aws_region && !process.env.AWS_REGION) {
      throw new Error('AWS region is required for IAM auth');
    }
    const password = config.use_iam_auth
      ? await generateIamAuthToken({
          host: config.host,
          port: config.port,
          username: config.username,
          region: config.aws_region || process.env.AWS_REGION || '',
        })
      : config.password;
    const client = new Client({
      host: config.host,
      port: config.port,
      database: config.database_name,
      user: config.username,
      password,
      ssl: config.ssl_mode === 'disable' ? false : { rejectUnauthorized: false },
    });
    try {
      await client.connect();
      await client.query('SELECT 1');
    } finally {
      await client.end().catch(() => undefined);
    }
    return;
  }

  if (config.use_iam_auth) {
    throw new Error('IAM auth is only supported for Postgres');
  }

  const protocol = config.ssl_mode === 'disable' ? 'http' : 'https';
  const url = `${protocol}://${config.host}:${config.port}/?query=SELECT%201`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'X-ClickHouse-User': config.username,
        'X-ClickHouse-Key': config.password,
      },
      signal: controller.signal,
    });
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(body || 'ClickHouse connection failed');
    }
  } finally {
    clearTimeout(timeout);
  }
}
