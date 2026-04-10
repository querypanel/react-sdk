import { createClient } from '@/lib/supabase/client';
import type { Database } from '@/types/database.types';

type Organization = Database['public']['Tables']['organizations']['Row'];

export async function fetchOrganizationsForCurrentUser(): Promise<Organization[]> {
  const supabase = createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const [{ data: memberOrgs }, { data: ownerOrgs }] = await Promise.all([
    supabase
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', user.id)
      .not('joined_at', 'is', null),
    supabase
      .from('organizations')
      .select('id')
      .eq('owner_id', user.id),
  ]);

  const orgIds = [
    ...(memberOrgs?.map(m => m.organization_id) || []),
    ...(ownerOrgs?.map(o => o.id) || []),
  ].filter(Boolean) as string[];

  if (orgIds.length === 0) return [];

  const { data: orgs } = await supabase
    .from('organizations')
    .select('id, name, owner_id, created_at, plan_id')
    .in('id', orgIds);

  return orgs || [];
}


