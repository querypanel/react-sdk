-- Explicitly allow anonymous users to insert subscriptions
-- Clear any existing policies and create a simple, permissive policy for anonymous inserts

-- Drop all existing policies on subscriptions table to avoid conflicts
DROP POLICY IF EXISTS "Allow subscription signup" ON public.subscriptions;
DROP POLICY IF EXISTS "Users can view all subscriptions" ON public.subscriptions;
DROP POLICY IF EXISTS "Only authenticated users can view subscriptions" ON public.subscriptions;
DROP POLICY IF EXISTS "Only authenticated users can update subscriptions" ON public.subscriptions;

-- Create a simple policy that allows anonymous users to insert
CREATE POLICY "Allow anonymous inserts" ON public.subscriptions
  FOR INSERT TO anon WITH CHECK (true);

-- Allow authenticated users (admins) to view all subscriptions
CREATE POLICY "Allow authenticated users to view subscriptions" ON public.subscriptions
  FOR SELECT TO authenticated USING (true);

-- Allow authenticated users (admins) to update subscriptions (for unsubscribe functionality)
CREATE POLICY "Allow authenticated users to update subscriptions" ON public.subscriptions
  FOR UPDATE TO authenticated USING (true);
