-- Migration: Change envs column in customer_mcps from text back to jsonb
-- Date: 2025-07-15

ALTER TABLE customer_mcps
  ALTER COLUMN envs TYPE jsonb
  USING envs::jsonb; 