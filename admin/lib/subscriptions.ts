import { createClient } from '@/lib/supabase/client';

const STORAGE_KEY = 'querypanel_subscription_email';

export interface SubscriptionResult {
  success: boolean;
  message: string;
  alreadySubscribed?: boolean;
}

/**
 * Check if user has already subscribed from this browser
 */
export function hasSubscribedLocally(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(STORAGE_KEY);
}

/**
 * Store email in localStorage to prevent duplicate subscriptions
 */
export function storeSubscriptionLocally(email: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, email);
}

/**
 * Subscribe user to early access notifications
 */
export async function subscribeToEarlyAccess(email: string): Promise<SubscriptionResult> {
  try {
    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return {
        success: false,
        message: 'Please enter a valid email address'
      };
    }

    // Check if already subscribed from this browser
    const localEmail = hasSubscribedLocally();
    if (localEmail === email) {
      return {
        success: false,
        message: 'You\'re already subscribed from this browser!',
        alreadySubscribed: true
      };
    }

    const supabase = createClient();

    // Try to insert the subscription
    const { data, error } = await supabase
      .from('subscriptions')
      .insert([
        {
          email: email.toLowerCase().trim(),
          source: 'landing_page'
        }
      ])
      .select()
      .single();

    if (error) {
      console.error('Subscription error details:', {
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint
      });

      // Check if it's a unique constraint violation (email already exists)
      if (error.code === '23505') {
        // Store in localStorage even if already in DB
        storeSubscriptionLocally(email);
        return {
          success: false,
          message: 'This email is already subscribed!',
          alreadySubscribed: true
        };
      }
      
      // RLS policy violation
      if (error.code === '42501') {
        return {
          success: false,
          message: 'Permission error. Please try again or contact support.'
        };
      }
      
      return {
        success: false,
        message: 'Something went wrong. Please try again.'
      };
    }

    // Success! Store in localStorage
    storeSubscriptionLocally(email);
    console.log('Subscription successful:', data);

    return {
      success: true,
      message: 'Thanks! You\'ll be notified when QueryPanel launches.'
    };

  } catch (error) {
    console.error('Unexpected error:', error);
    return {
      success: false,
      message: 'Something went wrong. Please try again.'
    };
  }
}

/**
 * Get subscription count (for admin use)
 */
export async function getSubscriptionCount(): Promise<number> {
  try {
    const supabase = createClient();
    
    const { count, error } = await supabase
      .from('subscriptions')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'active');

    if (error) {
      console.error('Error getting subscription count:', error);
      return 0;
    }

    return count || 0;
  } catch (error) {
    console.error('Unexpected error getting count:', error);
    return 0;
  }
} 