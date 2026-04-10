-- Create public keys table for simplified key management
CREATE TABLE IF NOT EXISTS public_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  public_key TEXT NOT NULL,
  key_type TEXT NOT NULL CHECK (key_type IN ('rsa', 'ec', 'ed25519')),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, name)
);

-- Create indexes for efficient lookups
CREATE INDEX IF NOT EXISTS idx_public_keys_user_id ON public_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_public_keys_is_active ON public_keys(is_active);
CREATE INDEX IF NOT EXISTS idx_public_keys_key_type ON public_keys(key_type);

-- Enable RLS
ALTER TABLE public_keys ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for public_keys
CREATE POLICY "Users can view their own public keys" ON public_keys
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own public keys" ON public_keys
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own public keys" ON public_keys
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own public keys" ON public_keys
  FOR DELETE USING (auth.uid() = user_id);
