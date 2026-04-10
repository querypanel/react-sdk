-- Create reports table
CREATE TABLE reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  type TEXT CHECK (type IN ('standup', 'sprint-review', 'release-readiness', 'team-health', 'custom')) DEFAULT 'custom',
  is_public BOOLEAN DEFAULT false,
  share_token TEXT UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create report_nodes table
CREATE TABLE report_nodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID REFERENCES reports(id) ON DELETE CASCADE,
  node_type TEXT NOT NULL CHECK (node_type IN ('heading', 'text', 'note', 'widget')),
  content JSONB NOT NULL,
  position JSONB NOT NULL,
  sort_order INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create report_shares table
CREATE TABLE report_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID REFERENCES reports(id) ON DELETE CASCADE,
  shared_by UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  shared_with UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  permission TEXT CHECK (permission IN ('view', 'edit', 'admin')) DEFAULT 'view',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX idx_reports_user_id ON reports(user_id);
CREATE INDEX idx_reports_share_token ON reports(share_token);
CREATE INDEX idx_reports_created_at ON reports(created_at);
CREATE INDEX idx_report_nodes_report_id ON report_nodes(report_id);
CREATE INDEX idx_report_nodes_sort_order ON report_nodes(sort_order);
CREATE INDEX idx_report_nodes_content ON report_nodes USING GIN(content);
CREATE INDEX idx_report_shares_report_id ON report_shares(report_id);
CREATE INDEX idx_report_shares_shared_with ON report_shares(shared_with);

-- Create updated_at triggers
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_reports_updated_at BEFORE UPDATE ON reports
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_report_nodes_updated_at BEFORE UPDATE ON report_nodes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Create function to generate share token
CREATE OR REPLACE FUNCTION generate_share_token()
RETURNS TEXT AS $$
BEGIN
  RETURN encode(gen_random_bytes(16), 'hex');
END;
$$ LANGUAGE plpgsql;

-- Row Level Security (RLS) policies
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_shares ENABLE ROW LEVEL SECURITY;

-- Reports policies
CREATE POLICY "Users can view their own reports" ON reports
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can view shared reports" ON reports
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM report_shares 
      WHERE report_id = reports.id 
      AND shared_with = auth.uid()
    )
  );

CREATE POLICY "Users can view public reports" ON reports
  FOR SELECT USING (is_public = true);

CREATE POLICY "Users can insert their own reports" ON reports
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own reports" ON reports
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own reports" ON reports
  FOR DELETE USING (auth.uid() = user_id);

-- Report nodes policies
CREATE POLICY "Users can view nodes of their reports" ON report_nodes
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM reports 
      WHERE reports.id = report_nodes.report_id 
      AND reports.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can view nodes of shared reports" ON report_nodes
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM report_shares 
      WHERE report_id = report_nodes.report_id 
      AND shared_with = auth.uid()
    )
  );

CREATE POLICY "Users can view nodes of public reports" ON report_nodes
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM reports 
      WHERE reports.id = report_nodes.report_id 
      AND reports.is_public = true
    )
  );

CREATE POLICY "Users can insert nodes to their reports" ON report_nodes
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM reports 
      WHERE reports.id = report_nodes.report_id 
      AND reports.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update nodes of their reports" ON report_nodes
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM reports 
      WHERE reports.id = report_nodes.report_id 
      AND reports.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete nodes of their reports" ON report_nodes
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM reports 
      WHERE reports.id = report_nodes.report_id 
      AND reports.user_id = auth.uid()
    )
  );

-- Report shares policies
CREATE POLICY "Users can view shares they created" ON report_shares
  FOR SELECT USING (shared_by = auth.uid());

CREATE POLICY "Users can view shares they received" ON report_shares
  FOR SELECT USING (shared_with = auth.uid());

CREATE POLICY "Users can insert shares for their reports" ON report_shares
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM reports 
      WHERE reports.id = report_shares.report_id 
      AND reports.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update shares they created" ON report_shares
  FOR UPDATE USING (shared_by = auth.uid());

CREATE POLICY "Users can delete shares they created" ON report_shares
  FOR DELETE USING (shared_by = auth.uid()); 