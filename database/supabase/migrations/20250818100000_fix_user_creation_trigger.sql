-- Fix user creation trigger that was blocking new user signups
-- The issue was that the trigger function couldn't access report_shares due to RLS policies

-- Drop the problematic trigger first
DROP TRIGGER IF EXISTS trigger_update_share_records ON auth.users;

-- Drop the problematic function
DROP FUNCTION IF EXISTS update_share_records_for_new_user();

-- Recreate the function with proper error handling and RLS bypass
CREATE OR REPLACE FUNCTION update_share_records_for_new_user()
RETURNS TRIGGER AS $$
BEGIN
    -- When a new user signs up, update any share records that use their email
    -- Use SECURITY DEFINER to bypass RLS policies
    BEGIN
        UPDATE report_shares 
        SET 
            shared_with = NEW.id,
            shared_with_email = NULL
        WHERE shared_with_email = NEW.email 
        AND shared_with IS NULL;
        
        -- Log successful updates
        IF FOUND THEN
            RAISE NOTICE 'Updated share records for new user % with email %', NEW.id, NEW.email;
        END IF;
    EXCEPTION
        WHEN OTHERS THEN
            -- Log the error but don't fail user creation
            RAISE WARNING 'Failed to update share records for new user %: %', NEW.id, SQLERRM;
            -- Continue with user creation
    END;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recreate the trigger
CREATE TRIGGER trigger_update_share_records
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION update_share_records_for_new_user();

-- Also add a proper UPDATE policy for report_shares to allow the trigger to work
-- This policy allows users to update share records where they are the shared_with user
DROP POLICY IF EXISTS "Users can update shares they received" ON report_shares;
CREATE POLICY "Users can update shares they received" ON report_shares
    FOR UPDATE USING (shared_with = auth.uid());
