import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/lib/context/AuthContext';

interface UsageData {
  queryLimit: number;
  queryUsed: number;
  queryRemaining: number;
  loading: boolean;
}

interface UseUsageReturn extends UsageData {
  refreshUsage: () => Promise<void>;
}

export function useUsage(): UseUsageReturn {
  const { user, isLoading: authLoading } = useAuth();
  const [usageData, setUsageData] = useState<UsageData>({
    queryLimit: 5,
    queryUsed: 0,
    queryRemaining: 5,
    loading: true
  });

  const fetchUsage = useCallback(async () => {
    if (authLoading) return;

    if (!user) {
      setUsageData(prev => ({ ...prev, loading: false }));
      return;
    }

    const supabase = createClient();

    try {
      // Get user's plan
      const { data: subscription } = await supabase
        .from('customer_subscriptions')
        .select('plan_id, plans(features, query_limit)')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .maybeSingle();

      let queryLimit = 5;

      if (subscription?.plans && Array.isArray(subscription.plans) && subscription.plans.length > 0) {
        const plan = subscription.plans[0];
          const queriesPerDay = plan.features?.queries_per_day;
        queryLimit = queriesPerDay ?? (plan as { query_limit?: number }).query_limit ?? 5;
      }

      // Get today's query usage
      const today = new Date().toISOString().slice(0, 10);
      const { data: queryUsage } = await supabase
        .from('usage')
        .select('count')
        .eq('user_id', user.id)
        .eq('type', 'query')
        .gte('period_start', today)
        .lte('period_end', today)
        .maybeSingle();

      const queryUsed = queryUsage?.count || 0;

      setUsageData({
        queryLimit,
        queryUsed,
        queryRemaining: Math.max(0, queryLimit - queryUsed),
        loading: false
      });
    } catch (error) {
      console.error('Error fetching usage:', error);
      setUsageData(prev => ({ ...prev, loading: false }));
    }
  }, [user, authLoading]);

  const refreshUsage = useCallback(async () => {
    setUsageData(prev => ({ ...prev, loading: true }));
    await fetchUsage();
  }, [fetchUsage]);

  useEffect(() => {
    fetchUsage();
  }, [fetchUsage]);

  return {
    ...usageData,
    refreshUsage
  };
} 