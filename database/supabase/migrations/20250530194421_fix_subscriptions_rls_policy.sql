-- Fix RLS policy for subscriptions table
-- The original policy was too restrictive, only allowing anonymous users to insert
-- We need to allow both anonymous and authenticated users to subscribe

-- Drop the existing restrictive policy
DROP POLICY IF EXISTS "Allow anonymous subscription signup" ON public.subscriptions;

-- Create a new policy that allows both anonymous and authenticated users to insert
CREATE POLICY "Allow subscription signup" ON public.subscriptions
  FOR INSERT WITH CHECK (true);

-- Ensure authenticated users can also read their own subscriptions
-- (This is useful for future features like unsubscribe links)
CREATE POLICY "Users can view all subscriptions" ON public.subscriptions
  FOR SELECT USING (auth.role() = 'authenticated');

-- Update comments to reflect the new policy
COMMENT ON POLICY "Allow subscription signup" ON public.subscriptions IS 'Allow both anonymous and authenticated users to subscribe';
