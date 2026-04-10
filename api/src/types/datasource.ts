/**
 * Datasource row shape for the Supabase `datasources` table.
 * Aligns with querypanel-web/types/database.types.ts public.datasources.
 */
export interface BigQueryMeta {
	authMode?: "service_account_json" | "google_oauth";
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
}

export interface DatasourceRow {
	id: string;
	organization_id: string;
	name: string;
	dialect: string;
	host: string | null;
	port: number | null;
	database_name: string;
	username: string | null;
	password_secret_id: string | null;
	credentials_secret_id: string | null;
	ssl_mode: string | null;
	tenant_field_name: string | null;
	tenant_field_type: string | null;
	use_iam_auth: boolean | null;
	aws_region: string | null;
	aws_role_arn: string | null;
	bigquery_project_id: string | null;
	bigquery_dataset_project_id: string | null;
	bigquery_location: string | null;
	bigquery_meta: BigQueryMeta | null;
	created_at: string;
	updated_at: string;
	created_by: string | null;
}
