-- Add BlockNote support to reports table
-- This migration adds a new column for BlockNote content while maintaining backward compatibility

-- Add editor_type column to distinguish between grid-based and BlockNote reports
ALTER TABLE reports 
ADD COLUMN editor_type TEXT CHECK (editor_type IN ('grid', 'blocknote')) DEFAULT 'grid';

-- Add blocknote_content column to store BlockNote JSON
ALTER TABLE reports 
ADD COLUMN blocknote_content JSONB;

-- Add index for BlockNote content searches
CREATE INDEX idx_reports_blocknote_content ON reports USING GIN(blocknote_content);

-- Add comment to explain the new columns
COMMENT ON COLUMN reports.editor_type IS 'Type of editor used: grid (legacy) or blocknote (new)';
COMMENT ON COLUMN reports.blocknote_content IS 'BlockNote JSON content for blocknote editor type';

-- Create function to migrate grid report to BlockNote format
CREATE OR REPLACE FUNCTION migrate_report_to_blocknote(report_uuid UUID)
RETURNS JSONB AS $$
DECLARE
  blocknote_blocks JSONB := '[]'::jsonb;
  node_record RECORD;
BEGIN
  -- Convert each report_node to BlockNote block format
  FOR node_record IN 
    SELECT * FROM report_nodes 
    WHERE report_id = report_uuid 
    ORDER BY sort_order ASC
  LOOP
    CASE node_record.node_type
      WHEN 'heading' THEN
        blocknote_blocks := blocknote_blocks || jsonb_build_array(
          jsonb_build_object(
            'type', 'heading',
            'props', jsonb_build_object(
              'level', COALESCE((node_record.content->>'level')::int, 1)
            ),
            'content', jsonb_build_array(
              jsonb_build_object(
                'type', 'text',
                'text', COALESCE(node_record.content->>'heading', ''),
                'styles', '{}'::jsonb
              )
            )
          )
        );
      WHEN 'text' THEN
        blocknote_blocks := blocknote_blocks || jsonb_build_array(
          jsonb_build_object(
            'type', 'paragraph',
            'content', jsonb_build_array(
              jsonb_build_object(
                'type', 'text',
                'text', COALESCE(node_record.content->>'text', ''),
                'styles', '{}'::jsonb
              )
            )
          )
        );
      WHEN 'note' THEN
        blocknote_blocks := blocknote_blocks || jsonb_build_array(
          jsonb_build_object(
            'type', 'alert',
            'props', jsonb_build_object(
              'type', COALESCE(node_record.content->>'noteType', 'info')
            ),
            'content', jsonb_build_array(
              jsonb_build_object(
                'type', 'text',
                'text', COALESCE(node_record.content->>'note', ''),
                'styles', '{}'::jsonb
              )
            )
          )
        );
      WHEN 'widget' THEN
        blocknote_blocks := blocknote_blocks || jsonb_build_array(
          jsonb_build_object(
            'type', 'widget',
            'props', jsonb_build_object(
              'widgetId', node_record.content->>'widgetId',
              'widgetTitle', COALESCE(node_record.content->>'title', 'Widget')
            )
          )
        );
      ELSE
        -- Default to paragraph for unknown types
        blocknote_blocks := blocknote_blocks || jsonb_build_array(
          jsonb_build_object(
            'type', 'paragraph',
            'content', jsonb_build_array(
              jsonb_build_object(
                'type', 'text',
                'text', 'Unsupported content type: ' || node_record.node_type,
                'styles', '{}'::jsonb
              )
            )
          )
        );
    END CASE;
  END LOOP;

  -- Return the BlockNote blocks array
  RETURN blocknote_blocks;
END;
$$ LANGUAGE plpgsql;

-- Create function to convert report from grid to BlockNote
CREATE OR REPLACE FUNCTION convert_report_to_blocknote(report_uuid UUID)
RETURNS BOOLEAN AS $$
DECLARE
  report_exists BOOLEAN;
BEGIN
  -- Check if report exists and is grid type
  SELECT EXISTS(
    SELECT 1 FROM reports 
    WHERE id = report_uuid 
    AND editor_type = 'grid'
  ) INTO report_exists;

  IF NOT report_exists THEN
    RETURN FALSE;
  END IF;

  -- Convert nodes to BlockNote format and update report
  UPDATE reports 
  SET 
    editor_type = 'blocknote',
    blocknote_content = migrate_report_to_blocknote(report_uuid),
    updated_at = NOW()
  WHERE id = report_uuid;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- Create function to create BlockNote report
CREATE OR REPLACE FUNCTION create_blocknote_report(
  p_user_id UUID,
  p_title TEXT,
  p_description TEXT DEFAULT NULL,
  p_type TEXT DEFAULT 'custom',
  p_is_public BOOLEAN DEFAULT false,
  p_content JSONB DEFAULT '[]'::jsonb
)
RETURNS UUID AS $$
DECLARE
  new_report_id UUID;
BEGIN
  INSERT INTO reports (
    user_id,
    title,
    description,
    type,
    is_public,
    editor_type,
    blocknote_content
  ) VALUES (
    p_user_id,
    p_title,
    p_description,
    p_type,
    p_is_public,
    'blocknote',
    p_content
  ) RETURNING id INTO new_report_id;

  RETURN new_report_id;
END;
$$ LANGUAGE plpgsql;

-- Create function to update BlockNote report content
CREATE OR REPLACE FUNCTION update_blocknote_content(
  report_uuid UUID,
  new_content JSONB
)
RETURNS BOOLEAN AS $$
DECLARE
  report_exists BOOLEAN;
BEGIN
  -- Check if report exists and is BlockNote type
  SELECT EXISTS(
    SELECT 1 FROM reports 
    WHERE id = report_uuid 
    AND editor_type = 'blocknote'
  ) INTO report_exists;

  IF NOT report_exists THEN
    RETURN FALSE;
  END IF;

  -- Update the BlockNote content
  UPDATE reports 
  SET 
    blocknote_content = new_content,
    updated_at = NOW()
  WHERE id = report_uuid;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- Update RLS policies to handle both editor types
-- (The existing policies will continue to work for the reports table)

-- Add helpful views for different editor types
CREATE OR REPLACE VIEW v_grid_reports AS
SELECT * FROM reports WHERE editor_type = 'grid';

CREATE OR REPLACE VIEW v_blocknote_reports AS
SELECT * FROM reports WHERE editor_type = 'blocknote';

-- Comments for documentation
COMMENT ON FUNCTION migrate_report_to_blocknote(UUID) IS 'Converts grid-based report nodes to BlockNote JSON format';
COMMENT ON FUNCTION convert_report_to_blocknote(UUID) IS 'Converts a grid report to BlockNote format and updates the database';
COMMENT ON FUNCTION create_blocknote_report IS 'Creates a new report with BlockNote editor type';
COMMENT ON FUNCTION update_blocknote_content IS 'Updates BlockNote content for a report';
COMMENT ON VIEW v_grid_reports IS 'View of reports using grid editor (legacy)';
COMMENT ON VIEW v_blocknote_reports IS 'View of reports using BlockNote editor (new)';
