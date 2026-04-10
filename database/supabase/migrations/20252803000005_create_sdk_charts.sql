-- Create sdk_charts table
create table if not exists public.sdk_charts (
  id uuid not null default gen_random_uuid (),
  query_id uuid null references public.sql_logs(id) on delete set null,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  tenant_id text null,
  user_id text null,
  title text not null,
  description text null,
  vega_lite_spec jsonb not null,
  sql text not null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  target_db text null,
  sql_params jsonb not null default '{}'::jsonb,
  constraint sdk_charts_pkey primary key (id)
) tablespace pg_default;

-- Create indexes
create index if not exists idx_sdk_charts_query_id on public.sdk_charts using btree (query_id) tablespace pg_default;

create index if not exists idx_sdk_charts_organization_id on public.sdk_charts using btree (organization_id) tablespace pg_default;

create index if not exists idx_sdk_charts_tenant_id on public.sdk_charts using btree (tenant_id) tablespace pg_default;

create index if not exists idx_sdk_charts_user_id on public.sdk_charts using btree (user_id) tablespace pg_default;

create index if not exists idx_sdk_charts_created_at on public.sdk_charts using btree (created_at desc) tablespace pg_default;

create index if not exists idx_sdk_charts_target_db on public.sdk_charts using btree (target_db) tablespace pg_default;

create index if not exists sdk_charts_sql_params_idx on public.sdk_charts using gin (sql_params) tablespace pg_default;

-- Create trigger to auto-update updated_at column
create or replace function update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger update_sdk_charts_updated_at
  before update on sdk_charts
  for each row
  execute function update_updated_at_column ();
