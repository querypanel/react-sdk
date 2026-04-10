-- Migration: Change envs column in customer_mcps from jsonb to text for encryption
-- Date: 2025-07-15

ALTER TABLE customer_mcps
  ALTER COLUMN envs TYPE text
  USING envs::text; 