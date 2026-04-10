-- Function to delete all user data when account is deleted
CREATE OR REPLACE FUNCTION delete_user_account(user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Delete user's widgets
  DELETE FROM widgets WHERE widgets.user_id = delete_user_account.user_id;
  
  -- Delete user's customer MCPs
  DELETE FROM customer_mcps WHERE customer_mcps.user_id = delete_user_account.user_id;
  
  -- Delete user's customer subscriptions
  DELETE FROM customer_subscriptions WHERE customer_subscriptions.user_id = delete_user_account.user_id;
  
  -- Delete user's usage records
  DELETE FROM usage WHERE usage.user_id = delete_user_account.user_id;
  
  -- Delete user's organization memberships
  DELETE FROM organization_members WHERE organization_members.user_id = delete_user_account.user_id;
  
  -- Delete organizations owned by the user (this will cascade to members and subscriptions)
  DELETE FROM organizations WHERE organizations.owner_id = delete_user_account.user_id;
  
  -- Finally, delete the user from auth.users (this is handled by Supabase auth)
  -- Note: This function doesn't delete from auth.users as that's handled by Supabase
  -- The auth.users deletion will cascade to any remaining references
  
  -- Log the deletion for audit purposes
  INSERT INTO audit_logs (action, user_id, details) 
  VALUES ('account_deleted', delete_user_account.user_id, 'User account and all associated data deleted');
  
EXCEPTION
  WHEN OTHERS THEN
    -- Log the error
    INSERT INTO audit_logs (action, user_id, details, error_message) 
    VALUES ('account_deletion_failed', delete_user_account.user_id, 'Failed to delete user account', SQLERRM);
    RAISE;
END;
$$;

-- Create audit_logs table for tracking account deletions
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action TEXT NOT NULL,
  user_id UUID,
  details JSONB,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add index for audit logs
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);

-- Enable RLS on audit_logs
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Only allow authenticated users to view audit logs (for admin purposes)
CREATE POLICY "Authenticated users can view audit logs" ON audit_logs
  FOR SELECT USING (auth.role() = 'authenticated');

-- Allow the function to insert audit logs
CREATE POLICY "Allow function to insert audit logs" ON audit_logs
  FOR INSERT WITH CHECK (true);

-- Grant necessary permissions
GRANT EXECUTE ON FUNCTION delete_user_account(UUID) TO authenticated;
GRANT USAGE ON SCHEMA public TO authenticated; 