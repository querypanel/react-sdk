create table public.leads (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null,
  email text not null,
  org_name text,
  description text,
  source text default 'landing_page'
);

-- Enable RLS
alter table public.leads enable row level security;

-- Allow anonymous inserts (for the public landing page form)
create policy "Allow anonymous inserts"
on public.leads
for insert
to anon, authenticated
with check (true);

-- Only allow admins/service role to view leads (optional, but good practice)
create policy "Allow internal view"
on public.leads
for select
to service_role, authenticated
using (true);
