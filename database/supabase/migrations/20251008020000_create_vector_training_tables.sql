-- Create vector training sessions table
CREATE TABLE IF NOT EXISTS vector_training_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed', 'paused')),
  training_type TEXT NOT NULL CHECK (training_type IN ('ddl', 'question-sql', 'domain-context')),
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  error_message TEXT,
  model_path TEXT, -- Path to the trained model file
  UNIQUE(user_id, name)
);

-- Create indexes for efficient lookups
CREATE INDEX IF NOT EXISTS idx_vector_training_sessions_user_id ON vector_training_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_vector_training_sessions_status ON vector_training_sessions(status);
CREATE INDEX IF NOT EXISTS idx_vector_training_sessions_training_type ON vector_training_sessions(training_type);

-- Enable RLS
ALTER TABLE vector_training_sessions ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for vector_training_sessions
CREATE POLICY "Users can view their own training sessions" ON vector_training_sessions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own training sessions" ON vector_training_sessions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own training sessions" ON vector_training_sessions
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own training sessions" ON vector_training_sessions
  FOR DELETE USING (auth.uid() = user_id);