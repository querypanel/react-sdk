alter table public.datasources
  add column if not exists bigquery_project_id text null,
  add column if not exists bigquery_location text null,
  add column if not exists credentials_secret_id uuid null,
  add column if not exists bigquery_dataset_project_id text null;


alter table public.datasources
  alter column host drop not null,
  alter column port drop not null,
  alter column username drop not null,
  alter column password_secret_id drop not null;

comment on column public.datasources.database_name is 'Logical database name. For BigQuery datasources, this stores the dataset.';
comment on column public.datasources.bigquery_project_id is 'BigQuery project ID used for query execution and INFORMATION_SCHEMA introspection.';
comment on column public.datasources.bigquery_location is 'Optional BigQuery location, for example US or EU.';
comment on column public.datasources.credentials_secret_id is 'Supabase Vault secret ID for non-password datasource credentials such as BigQuery service account JSON.';
comment on column public.datasources.bigquery_dataset_project_id is 'Optional BigQuery project ID that owns the dataset. Defaults to bigquery_project_id when omitted.';
