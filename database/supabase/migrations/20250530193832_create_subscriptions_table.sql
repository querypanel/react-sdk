-- Create subscriptions table for early access signups
CREATE TABLE public.subscriptions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  -- Optional fields for future enhancement
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'unsubscribed')),
  source TEXT DEFAULT 'landing_page' -- track where the subscription came from
);

-- Add index for faster email lookups
CREATE INDEX idx_subscriptions_email ON public.subscriptions(email);
CREATE INDEX idx_subscriptions_created_at ON public.subscriptions(created_at);

-- Enable Row Level Security
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

-- RLS Policies - Allow anonymous inserts but restrict selects/updates
CREATE POLICY "Allow anonymous subscription signup" ON public.subscriptions
  FOR INSERT TO anon WITH CHECK (true);

-- Only authenticated users (admin) can view subscriptions
CREATE POLICY "Only authenticated users can view subscriptions" ON public.subscriptions
  FOR SELECT USING (auth.role() = 'authenticated');

-- Only authenticated users can update subscriptions (for unsubscribe functionality)
CREATE POLICY "Only authenticated users can update subscriptions" ON public.subscriptions
  FOR UPDATE USING (auth.role() = 'authenticated');

-- Add some helpful comments
COMMENT ON TABLE public.subscriptions IS 'Early access email subscriptions from landing page';
COMMENT ON COLUMN public.subscriptions.email IS 'Subscriber email address';
COMMENT ON COLUMN public.subscriptions.status IS 'Subscription status: active or unsubscribed';
COMMENT ON COLUMN public.subscriptions.source IS 'Source of subscription (landing_page, etc.)';
