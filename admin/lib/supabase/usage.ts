import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database.types';

type PlanRow = Database['public']['Tables']['plans']['Row'];

type UsageRow = Database['public']['Tables']['usage']['Row'];

// Helper function to get user's organization and plan
async function getUserPlan(supabase: SupabaseClient<Database>, user_id: string): Promise<{
  plan: Pick<PlanRow, 'features' | 'query_limit'>;
  org_id: string | null;
  isOrgMember: boolean;
}> {
  // First, check if user is a member of any organization
  const { data: orgMembership } = await supabase
    .from('organization_members')
    .select('organization_id, organizations(id, name)')
    .eq('user_id', user_id)
    .not('joined_at', 'is', null) // Only active members (joined_at is set when they accept)
    .maybeSingle();

  const org_id = orgMembership?.organization_id || null;
  const isOrgMember = !!org_id;

  // Get the appropriate plan (org or individual)
  let plan: Pick<PlanRow, 'features' | 'query_limit'> = { features: null, query_limit: 5 };
  
  if (org_id) {
    // User is in an org, get org plan directly from organizations table
    const { data: organization } = await supabase
      .from('organizations')
      .select('plan_id, plans(features, query_limit)')
      .eq('id', org_id)
      .single();
    
    if (organization?.plans) {
      plan = organization.plans as Pick<PlanRow, 'features' | 'query_limit'>;
    }
  } else {
    // Individual user subscription
    const { data: subscription } = await supabase
      .from('customer_subscriptions')
      .select('plan_id, plans(features, query_limit)')
      .eq('user_id', user_id)
      .eq('status', 'active')
      .maybeSingle();

    if (subscription?.plans) {
      plan = subscription.plans as Pick<PlanRow, 'features' | 'query_limit'>;
    }
  }

  return { plan, org_id, isOrgMember };
}

export async function checkAndIncrementUsage({
  supabase,
  user,
  type, // 'query' or 'widget'
}: {
  supabase: SupabaseClient<Database>;
  user: { id: string };
  type: 'query' | 'widget';
}): Promise<{ allowed: boolean; reason?: string }> {
  const user_id = user.id;
  
  // Get user's organization and plan
  const { plan, org_id, isOrgMember } = await getUserPlan(supabase, user_id);

  // 3. Get usage for this period (day)
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const period_start = today;
  const period_end = today;

  if (type === 'query') {
    // Query usage table for daily query limit
    if (isOrgMember && !org_id) {
      throw new Error('Organization ID is required for organization members');
    }
    
    let idFilterKey: 'organization_id' | 'user_id';
    let idFilterValue: string;
    if (isOrgMember) {
      if (!org_id) {
        throw new Error('Organization ID is required for organization members');
      }
      idFilterKey = 'organization_id';
      idFilterValue = org_id;
    } else {
      idFilterKey = 'user_id';
      idFilterValue = user_id;
    }

    const { data: usageRow } = await supabase
      .from('usage')
      .select('id, count')
      .eq(idFilterKey, idFilterValue)
      .eq('type', type)
      .gte('period_start', period_start)
      .lte('period_end', period_end)
      .maybeSingle();

    const usage = (usageRow as UsageRow | null)?.count || 0;
    const limit = (plan.features as { queries_per_day?: number })?.queries_per_day ?? 5;

    if (usage >= limit) {
      const limitType = isOrgMember ? 'organization' : 'personal';
      return { allowed: false, reason: `You have reached your ${limitType} query limit for today.` };
    }

    // Increment usage (upsert)
    if (usageRow) {
      await supabase
        .from('usage')
        .update({ count: usage + 1 })
        .eq('id', (usageRow as UsageRow).id);
    } else {
      await supabase.from('usage').insert({
        user_id: isOrgMember ? null : user_id,
        organization_id: isOrgMember ? org_id : null,
        type,
        count: 1,
        period_start,
        period_end,
      });
    }

    return { allowed: true };
  } else if (type === 'widget') {
    // Widget limit check disabled for now
    return { allowed: true };
  }
  // Fallback: should not reach here
  return { allowed: false, reason: 'Invalid usage type.' };
} 
