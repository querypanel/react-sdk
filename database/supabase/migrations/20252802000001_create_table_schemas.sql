-- Create table_schemas table to store raw schema data
create table table_schemas (
  id uuid primary key default gen_random_uuid(),
  schema jsonb not null,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Create index on organization_id for faster lookups
create index idx_table_schemas_organization_id on table_schemas(organization_id);

-- Create unique index on organization_id and hash to prevent duplicate schemas
create unique index idx_table_schemas_org_hash on table_schemas(organization_id, hash);

-- Create function to automatically update updated_at timestamp
create or replace function update_table_schemas_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- Create trigger to automatically update updated_at
create trigger trigger_update_table_schemas_updated_at
  before update on table_schemas
  for each row
  execute function update_table_schemas_updated_at();
