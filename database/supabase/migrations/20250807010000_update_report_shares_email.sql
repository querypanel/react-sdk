-- Add email column to report_shares table for easier sharing
ALTER TABLE report_shares ADD COLUMN IF NOT EXISTS shared_with_email TEXT;

-- Make shared_with nullable since we might only have email
ALTER TABLE report_shares ALTER COLUMN shared_with DROP NOT NULL;

-- Create index for email lookups
CREATE INDEX IF NOT EXISTS idx_report_shares_email ON report_shares(shared_with_email);
