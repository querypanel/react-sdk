import { createClient } from '@/lib/supabase/server';
import OnboardingManager from '@/components/onboarding/OnboardingManager';

async function getCurrentOrganization() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: memberOrgs, error: memberError } = await supabase
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', user.id)
    .not('joined_at', 'is', null);

  if (memberError) {
    console.error('Error fetching member orgs:', memberError);
  }

  let orgId = memberOrgs?.[0]?.organization_id as string | undefined;
  if (!orgId) {
    const { data: owned, error: ownedError } = await supabase
      .from('organizations')
      .select('id')
      .eq('owner_id', user.id);

    if (ownedError) {
      console.error('Error fetching owned orgs:', ownedError);
    }

    orgId = owned?.[0]?.id as string | undefined;
  }
  if (!orgId) return null;

  const { data: org, error: orgError } = await supabase
    .from('organizations')
    .select('id, name')
    .eq('id', orgId)
    .single();

  if (orgError) {
    console.error('Error fetching organization:', orgError);
  }

  return org || null;
}

export default async function HomePage() {
  const org = await getCurrentOrganization();

  return <OnboardingManager initialOrganization={org} />;
}
