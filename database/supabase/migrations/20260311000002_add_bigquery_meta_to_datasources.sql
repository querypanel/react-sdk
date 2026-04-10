alter table public.datasources
  add column if not exists bigquery_meta jsonb null;

comment on column public.datasources.bigquery_meta is
  'BigQuery config blob (authMode, project/location metadata, oauth metadata). Secrets stay in Vault; DB stores only secret IDs and non-sensitive metadata.';

update public.datasources d
set bigquery_meta = jsonb_strip_nulls(
  coalesce(d.bigquery_meta, '{}'::jsonb) ||
  jsonb_build_object(
    'authMode', case when d.credentials_secret_id is not null then 'service_account_json' else null end,
    'projectId', d.bigquery_project_id,
    'datasetProjectId', coalesce(d.bigquery_dataset_project_id, d.bigquery_project_id),
    'location', d.bigquery_location,
    'credentialsSecretId', d.credentials_secret_id::text
  )
)
where d.dialect = 'bigquery';

alter table public.datasources
  add constraint datasources_bigquery_meta_is_object_chk
  check (
    bigquery_meta is null or jsonb_typeof(bigquery_meta) = 'object'
  );

alter table public.datasources
  add constraint datasources_bigquery_auth_mode_chk
  check (
    bigquery_meta is null
    or not (bigquery_meta ? 'authMode')
    or (bigquery_meta->>'authMode') in ('service_account_json', 'google_oauth')
  );

alter table public.datasources
  add constraint datasources_bigquery_oauth_object_chk
  check (
    bigquery_meta is null
    or (bigquery_meta->>'authMode') <> 'google_oauth'
    or (
      bigquery_meta ? 'oauth'
      and jsonb_typeof(bigquery_meta->'oauth') = 'object'
    )
  );

create index if not exists idx_datasources_bigquery_auth_mode
  on public.datasources ((bigquery_meta->>'authMode'))
  where dialect = 'bigquery';
