-- Create or update datasources table with Supabase Vault integration

-- Create datasources table
create table if not exists public.datasources (
  id uuid not null default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  dialect text not null,
  host text not null,
  port integer not null,
  database_name text not null,
  username text not null,
  password_secret_id uuid not null,
  ssl_mode text default 'require',
  use_iam_auth boolean default false,
  aws_region text null,
  aws_role_arn text null,
  created_by text null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint datasources_pkey primary key (id),
  constraint datasources_org_name_unique unique (organization_id, name)
) tablespace pg_default;

-- Drop password_encrypted column if it exists (migration from old approach)
alter table public.datasources
  drop column if exists password_encrypted;

-- Ensure password_secret_id column exists
alter table public.datasources
  add column if not exists password_secret_id uuid;

-- Create indexes
create index if not exists idx_datasources_organization_id
  on public.datasources using btree (organization_id) tablespace pg_default;

create index if not exists idx_datasources_dialect
  on public.datasources using btree (dialect) tablespace pg_default;

-- Create trigger for updated_at
do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'update_datasources_updated_at'
      and tgrelid = 'public.datasources'::regclass
  ) then
    create trigger update_datasources_updated_at
      before update on public.datasources
      for each row
      execute function update_updated_at_column();
  end if;
end $$;

-- Add comments
comment on table public.datasources is 'External database connection configs for dashboard datasources.';
comment on column public.datasources.password_secret_id is 'Supabase Vault secret ID for the datasource password.';

-- Create a wrapper function for vault.create_secret that can be called via RPC
create or replace function public.create_secret(secret text, name text default null, description text default null)
returns uuid
language plpgsql
security definer
as $$
declare
  secret_id uuid;
begin
  select vault.create_secret(secret, name, description) into secret_id;
  return secret_id;
end;
$$;

-- Create a wrapper function for retrieving secrets from vault
create or replace function public.get_secret(secret_id uuid)
returns text
language plpgsql
security definer
as $$
declare
  secret_value text;
begin
  select decrypted_secret into secret_value
  from vault.decrypted_secrets
  where id = secret_id;
  
  return secret_value;
end;
$$;
