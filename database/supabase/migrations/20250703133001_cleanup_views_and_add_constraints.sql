-- Clean up unused views and add required constraints
-- 1. Drop the v_mcps_with_customer view since we're now querying tables directly
-- 2. Add unique constraint to customer_mcps for proper upsert functionality

-- Drop the view that's no longer being used
DROP VIEW IF EXISTS v_mcps_with_customer;

-- Add unique constraint on the combination of user_id and mcp_id
-- This ensures each user can only have one configuration per MCP and enables upsert operations
ALTER TABLE customer_mcps 
ADD CONSTRAINT unique_customer_mcp_per_user 
UNIQUE (user_id, mcp_id);

-- Add comment for documentation
COMMENT ON CONSTRAINT unique_customer_mcp_per_user ON customer_mcps 
IS 'Ensures each user can only have one configuration per MCP, enabling proper upsert operations with ON CONFLICT'; 