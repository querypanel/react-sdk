-- Add email column to report_shares table for easier sharing
ALTER TABLE report_shares ADD COLUMN IF NOT EXISTS shared_with_email TEXT;

-- Make shared_with nullable since we might only have email
ALTER TABLE report_shares ALTER COLUMN shared_with DROP NOT NULL;

-- Create index for email lookups
CREATE INDEX IF NOT EXISTS idx_report_shares_email ON report_shares(shared_with_email);

-- Note: RLS policies for email-based sharing will be handled in the application layer
-- since we can't easily access auth.users in RLS policies

-- Update the function to be simpler - just check if user exists by email in report_shares
CREATE OR REPLACE FUNCTION find_user_by_email(user_email TEXT)
RETURNS TABLE(id UUID, email TEXT) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- For now, return empty result - we'll handle this differently
  -- This function is kept for compatibility but won't be used
  RETURN;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION find_user_by_email(TEXT) TO authenticated;
