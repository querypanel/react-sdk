-- Fix share records to use user IDs instead of emails for better RLS policy support
-- This migration updates existing email-based shares to use user IDs where possible

-- First, let's see what share records exist
-- This will help us understand the current state
DO $$
DECLARE
    share_record RECORD;
    user_record RECORD;
BEGIN
    -- Loop through all share records that use email-based sharing
    FOR share_record IN 
        SELECT * FROM report_shares 
        WHERE shared_with_email IS NOT NULL 
        AND shared_with IS NULL
    LOOP
        -- Try to find a user with this email
        SELECT * INTO user_record 
        FROM auth.users 
        WHERE email = share_record.shared_with_email;
        
        -- If we found a user, update the share record to use the user ID
        IF user_record.id IS NOT NULL THEN
            UPDATE report_shares 
            SET 
                shared_with = user_record.id,
                shared_with_email = NULL
            WHERE id = share_record.id;
            
            RAISE NOTICE 'Updated share record % to use user ID % instead of email %', 
                share_record.id, user_record.id, share_record.shared_with_email;
        ELSE
            RAISE NOTICE 'No user found for email %, keeping email-based share', 
                share_record.shared_with_email;
        END IF;
    END LOOP;
END $$;

-- Now let's also add a trigger to automatically handle this in the future
-- Create a function to automatically update share records when users sign up
CREATE OR REPLACE FUNCTION update_share_records_for_new_user()
RETURNS TRIGGER AS $$
BEGIN
    -- When a new user signs up, update any share records that use their email
    UPDATE report_shares 
    SET 
        shared_with = NEW.id,
        shared_with_email = NULL
    WHERE shared_with_email = NEW.email 
    AND shared_with IS NULL;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create the trigger
DROP TRIGGER IF EXISTS trigger_update_share_records ON auth.users;
CREATE TRIGGER trigger_update_share_records
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION update_share_records_for_new_user();
