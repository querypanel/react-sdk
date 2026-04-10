-- Add type field to plans table to distinguish between individual and enterprise plans
ALTER TABLE plans 
ADD COLUMN type TEXT NOT NULL DEFAULT 'individual' CHECK (type IN ('individual', 'enterprise'));

-- Add index for faster type-based queries
CREATE INDEX idx_plans_type ON plans(type);

-- Add comment explaining the field
COMMENT ON COLUMN plans.type IS 'Plan type: individual (shown in UI) or enterprise (for organizations)';

-- Update existing plans to have appropriate types (you may need to adjust these based on your current plans)
-- This assumes you have some existing plans that need to be categorized
UPDATE plans SET type = 'individual' WHERE name ILIKE '%free%' OR name ILIKE '%basic%' OR name ILIKE '%pro%';
UPDATE plans SET type = 'enterprise' WHERE name ILIKE '%enterprise%' OR name ILIKE '%custom%' OR name ILIKE '%organization%';
