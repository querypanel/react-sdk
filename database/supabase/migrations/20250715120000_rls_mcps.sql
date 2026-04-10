-- Enable RLS and policies for available_mcps (read-only)
ALTER TABLE available_mcps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow read for all" ON available_mcps
  FOR SELECT
  USING (auth.role() = 'authenticated');

-- Block all modifications (no insert/update/delete for anyone)
REVOKE ALL ON available_mcps FROM anon, authenticated;

-- Enable RLS and policies for customer_mcps (CRUD for own rows)
ALTER TABLE customer_mcps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their own customer_mcps" ON customer_mcps
  FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own customer_mcps" ON customer_mcps
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own customer_mcps" ON customer_mcps
  FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Users can delete their own customer_mcps" ON customer_mcps
  FOR DELETE
  USING (user_id = auth.uid()); 