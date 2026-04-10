-- Migration: Add reports_limit to plans table and insert default plan data
-- This migration adds a reports_limit field and sets up default plans with 5 reports for free tier

-- 1. Add reports_limit column to plans table
ALTER TABLE plans ADD COLUMN IF NOT EXISTS reports_limit INT NOT NULL DEFAULT 5;

-- 2. Insert default plans if they don't exist
INSERT INTO plans (name, query_limit, widget_limit, reports_limit, price_cents, features) 
VALUES 
  ('Free', 5, 5, 5, 0, '{"reports": 5, "queries_per_day": 5, "widgets": 5}'::jsonb),
  ('Individual', 50, 25, 25, 999, '{"reports": 25, "queries_per_day": 50, "widgets": 25}'::jsonb),
  ('Enterprise', 500, 100, 100, 4999, '{"reports": 100, "queries_per_day": 500, "widgets": 100}'::jsonb)
ON CONFLICT (name) DO UPDATE SET
  query_limit = EXCLUDED.query_limit,
  widget_limit = EXCLUDED.widget_limit,
  reports_limit = EXCLUDED.reports_limit,
  price_cents = EXCLUDED.price_cents,
  features = EXCLUDED.features;

-- 3. Update existing plans to have at least 5 reports if they don't have reports_limit set
UPDATE plans 
SET reports_limit = GREATEST(5, COALESCE(reports_limit, 5))
WHERE reports_limit IS NULL OR reports_limit < 5;

-- 4. Ensure free plan has exactly 5 reports
UPDATE plans 
SET reports_limit = 5
WHERE name = 'Free' AND price_cents = 0;
