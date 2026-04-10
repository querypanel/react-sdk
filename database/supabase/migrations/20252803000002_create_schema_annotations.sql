-- Create schema_annotations table to store user-added business context
create table schema_annotations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  target_identifier text not null,
  content text not null,
  created_by text not null,
  updated_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Create index on organization_id for faster lookups
create index idx_schema_annotations_organization_id on schema_annotations(organization_id);

-- Create index on target_identifier for faster lookups
create index idx_schema_annotations_target_identifier on schema_annotations(target_identifier);

-- Create unique index on organization_id and target_identifier to prevent duplicates
create unique index idx_schema_annotations_org_target on schema_annotations(organization_id, target_identifier);

-- Create function to automatically update updated_at timestamp
create or replace function update_schema_annotations_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- Create trigger to automatically update updated_at
create trigger trigger_update_schema_annotations_updated_at
  before update on schema_annotations
  for each row
  execute function update_schema_annotations_updated_at();
