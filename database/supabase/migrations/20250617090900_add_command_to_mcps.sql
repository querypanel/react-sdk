-- Add 'command' column to 'customer_mcps'
ALTER TABLE customer_mcps ADD COLUMN command jsonb;

-- Add 'command' column to 'available_mcps'
ALTER TABLE available_mcps ADD COLUMN command jsonb; 