-- Migration: Paywall, Plans, Organizations, Customer Subscriptions, Usage

-- 1. Plans table
CREATE TABLE plans (
    id SERIAL PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    query_limit INT NOT NULL,
    widget_limit INT NOT NULL,
    price_cents INT NOT NULL DEFAULT 0,
    features JSONB
);

-- 2. Organizations table
CREATE TABLE organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT UNIQUE NOT NULL,
    owner_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 3. Organization Members table
CREATE TABLE organization_members (
    id SERIAL PRIMARY KEY,
    org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'member',
    invited_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    invited_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    joined_at TIMESTAMP WITH TIME ZONE
);

-- 4. Customer Subscriptions table
CREATE TABLE customer_subscriptions (
    id SERIAL PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    plan_id INT REFERENCES plans(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'active',
    start_date TIMESTAMP WITH TIME ZONE DEFAULT now(),
    end_date TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    CONSTRAINT one_subscriber CHECK (
        (user_id IS NOT NULL AND org_id IS NULL) OR (user_id IS NULL AND org_id IS NOT NULL)
    )
);

-- 5. Usage table
CREATE TABLE usage (
    id SERIAL PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('query', 'widget')),
    count INT NOT NULL DEFAULT 0,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    CONSTRAINT one_usage_owner CHECK (
        (user_id IS NOT NULL AND org_id IS NULL) OR (user_id IS NULL AND org_id IS NOT NULL)
    )
);

-- Indexes for performance
CREATE INDEX idx_organization_members_org_id ON organization_members(org_id);
CREATE INDEX idx_organization_members_user_id ON organization_members(user_id);
CREATE INDEX idx_customer_subscriptions_user_id ON customer_subscriptions(user_id);
CREATE INDEX idx_customer_subscriptions_org_id ON customer_subscriptions(org_id);
CREATE INDEX idx_usage_user_id ON usage(user_id);
CREATE INDEX idx_usage_org_id ON usage(org_id);

-- Enable Row Level Security (RLS)
ALTER TABLE plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Plans: globally readable
CREATE POLICY "Plans are globally readable" ON plans FOR SELECT USING (true);

-- Organizations: only members or owner can read
CREATE POLICY "Org members or owner can view org" ON organizations FOR SELECT USING (
  id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid())
  OR owner_id = auth.uid()
);

-- Organization Members: user can see their memberships
CREATE POLICY "User can view their org memberships" ON organization_members FOR SELECT USING (
  user_id = auth.uid()
);

-- Customer Subscriptions: user can see their own or their org's subscriptions
CREATE POLICY "User can view their customer subscriptions" ON customer_subscriptions FOR SELECT USING (
  (user_id = auth.uid()) OR
  (org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid()))
);

-- Usage: user can see their own or their org's usage
CREATE POLICY "User can view their usage" ON usage FOR SELECT USING (
  (user_id = auth.uid()) OR
  (org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid()))
); 