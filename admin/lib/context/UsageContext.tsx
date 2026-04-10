'use client';

import type React from 'react';
import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useOrganizationContext } from '@/lib/context/OrganizationContext';
import { useAuth } from '@/lib/context/AuthContext';

interface UsageData {
  queryLimit: number;
  queryUsed: number;
  queryRemaining: number;
  loading: boolean;
}

interface UsageContextType extends UsageData {
  refreshUsage: () => Promise<void>;
}

const UsageContext = createContext<UsageContextType | undefined>(undefined);

function UsageProviderInner({ children }: { children: React.ReactNode }) {
  const [usageData, setUsageData] = useState<UsageData>({
    queryLimit: 5,
    queryUsed: 0,
    queryRemaining: 5,
    loading: true
  });

  const { currentOrganizationId } = useOrganizationContext();
  const { user, isLoading: authLoading } = useAuth();

  const fetchUsage = useCallback(async () => {
    if (authLoading) return;

    if (!user) {
      setUsageData(prev => ({ ...prev, loading: false }));
      return;
    }

    const supabase = createClient();

    try {
      let queryLimit = 5;
      const orgId = currentOrganizationId;

      // Get the appropriate plan (org or individual)
      if (orgId) {
        // Org-scoped plan (based on currently selected organization)
        const { data: organization } = await supabase
          .from('organizations')
          .select('plan_id, plans(features, query_limit)')
          .eq('id', orgId)
          .single();
        
        if (organization?.plans) {
          const plan = Array.isArray(organization.plans) 
            ? organization.plans[0] 
            : organization.plans;
          if (plan) {
            const queriesPerDay = plan.features?.queries_per_day;
            queryLimit = queriesPerDay ?? (plan as { query_limit?: number }).query_limit ?? 5;
          }
        }
      } else {
        // Individual user subscription
        const { data: subscription } = await supabase
          .from('customer_subscriptions')
          .select('plan_id, plans(features, query_limit)')
          .eq('user_id', user.id)
          .eq('status', 'active')
          .maybeSingle();

        if (subscription?.plans && Array.isArray(subscription.plans) && subscription.plans.length > 0) {
          const plan = subscription.plans[0];
          const queriesPerDay = plan.features?.queries_per_day;
          queryLimit = queriesPerDay ?? (plan as { query_limit?: number }).query_limit ?? 5;
        }
      }

      // Get today's query usage - check org or individual usage
      const today = new Date().toISOString().slice(0, 10);
      let queryUsage: { count: number } | null = null;
      
      if (orgId) {
        // Organization usage
        const { data } = await supabase
          .from('usage')
          .select('count')
          .eq('organization_id', orgId)
          .eq('type', 'query')
          .gte('period_start', today)
          .lte('period_end', today)
          .maybeSingle();
        queryUsage = data;
      } else {
        // Individual usage
        const { data } = await supabase
          .from('usage')
          .select('count')
          .eq('user_id', user.id)
          .eq('type', 'query')
          .gte('period_start', today)
          .lte('period_end', today)
          .maybeSingle();
        queryUsage = data;
      }

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
  }, [currentOrganizationId, user, authLoading]);

  const refreshUsage = useCallback(async () => {
    setUsageData(prev => ({ ...prev, loading: true }));
    await fetchUsage();
  }, [fetchUsage]);

  useEffect(() => {
    fetchUsage();
  }, [fetchUsage]);

  return (
    <UsageContext.Provider value={{
      ...usageData,
      refreshUsage
    }}>
      {children}
    </UsageContext.Provider>
  );
}

export function UsageProvider({ children }: { children: React.ReactNode }) {
  return (
    <UsageProviderInner>
      {children}
    </UsageProviderInner>
  );
}

export function useUsageContext() {
  const context = useContext(UsageContext);
  if (context === undefined) {
    throw new Error('useUsageContext must be used within a UsageProvider');
  }
  return context;
}
