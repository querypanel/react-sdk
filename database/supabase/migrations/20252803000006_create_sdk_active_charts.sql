-- Create sdk_active_charts table
create table if not exists public.sdk_active_charts (
  id uuid not null default gen_random_uuid (),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  tenant_id text not null,
  user_id text null,
  chart_id uuid not null references public.sdk_charts (id) on delete cascade,
  "order" integer null,
  meta jsonb null,
  created_at timestamp with time zone null default now(),
  updated_at timestamp with time zone null default now(),
  constraint sdk_active_charts_pkey primary key (id),
  constraint sdk_active_charts_organization_id_fkey foreign key (organization_id) references organizations (id) on delete cascade,
  constraint sdk_active_charts_chart_id_fkey foreign key (chart_id) references sdk_charts (id) on delete cascade
) tablespace pg_default;

-- Create indexes
create index if not exists idx_sdk_active_charts_organization_id on public.sdk_active_charts using btree (organization_id) tablespace pg_default;

create index if not exists idx_sdk_active_charts_tenant_id on public.sdk_active_charts using btree (tenant_id) tablespace pg_default;

create index if not exists idx_sdk_active_charts_user_id on public.sdk_active_charts using btree (user_id) tablespace pg_default;

create index if not exists idx_sdk_active_charts_chart_id on public.sdk_active_charts using btree (chart_id) tablespace pg_default;

create index if not exists idx_sdk_active_charts_order on public.sdk_active_charts using btree ("order") tablespace pg_default;

create index if not exists sdk_active_charts_meta_idx on public.sdk_active_charts using gin (meta) tablespace pg_default;

-- Create unique constraint to prevent duplicate active charts per tenant
create unique index if not exists idx_sdk_active_charts_unique_chart_per_tenant on public.sdk_active_charts using btree (organization_id, tenant_id, chart_id) tablespace pg_default;

-- Create trigger to auto-update updated_at column
create trigger update_sdk_active_charts_updated_at
  before update on sdk_active_charts
  for each row
  execute function update_updated_at_column ();
