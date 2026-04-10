-- Simplify reports system to use BlockNote only
-- Drop the old report_nodes system and complex migration functions

-- Drop the complex functions we don't need
DROP FUNCTION IF EXISTS migrate_report_to_blocknote(UUID);
DROP FUNCTION IF EXISTS convert_report_to_blocknote(UUID);
DROP FUNCTION IF EXISTS create_blocknote_report;
DROP FUNCTION IF EXISTS update_blocknote_content;

-- Drop the views we don't need
DROP VIEW IF EXISTS v_grid_reports;
DROP VIEW IF EXISTS v_blocknote_reports;

-- Drop the old report_nodes table since we're using BlockNote only
DROP TABLE IF EXISTS report_nodes CASCADE;

-- Update the reports table to be BlockNote-only
ALTER TABLE reports DROP COLUMN IF EXISTS editor_type;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS content JSONB DEFAULT '[]'::JSONB;

-- Create index for content search
CREATE INDEX IF NOT EXISTS idx_reports_content ON reports USING GIN(content);

-- Update RLS policies to work with the simplified schema
-- (Existing policies should continue to work)

-- Add a simple function to update report content
CREATE OR REPLACE FUNCTION update_report_content(
  report_id UUID,
  new_content JSONB
)
RETURNS BOOLEAN AS $$
BEGIN
  UPDATE reports 
  SET 
    content = new_content,
    updated_at = NOW()
  WHERE id = report_id;
  
  RETURN FOUND;
END;
$$ LANGUAGE plpgsql;

-- Comments
COMMENT ON COLUMN reports.content IS 'BlockNote JSON content for the report';
COMMENT ON FUNCTION update_report_content IS 'Updates the BlockNote content for a report';
