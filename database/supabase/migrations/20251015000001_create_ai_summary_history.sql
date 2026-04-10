-- Create AI summary history table
CREATE TABLE IF NOT EXISTS public.ai_summary_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  report_id UUID NOT NULL REFERENCES public.reports(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  summary_type VARCHAR(20) NOT NULL CHECK (summary_type IN ('brief', 'detailed', 'executive')),
  summary_content TEXT NOT NULL,
  query TEXT, -- For future question-answering functionality
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_ai_summary_history_report_id ON public.ai_summary_history(report_id);
CREATE INDEX IF NOT EXISTS idx_ai_summary_history_user_id ON public.ai_summary_history(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_summary_history_created_at ON public.ai_summary_history(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_summary_history_report_user ON public.ai_summary_history(report_id, user_id);

-- Create composite index for getting recent summaries
CREATE INDEX IF NOT EXISTS idx_ai_summary_history_recent ON public.ai_summary_history(report_id, user_id, created_at DESC);

-- Enable RLS (Row Level Security)
ALTER TABLE public.ai_summary_history ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can view their own summary history" ON public.ai_summary_history
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own summary history" ON public.ai_summary_history
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own summary history" ON public.ai_summary_history
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own summary history" ON public.ai_summary_history
  FOR DELETE USING (auth.uid() = user_id);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_ai_summary_history_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for updated_at
CREATE TRIGGER update_ai_summary_history_updated_at
  BEFORE UPDATE ON public.ai_summary_history
  FOR EACH ROW
  EXECUTE FUNCTION update_ai_summary_history_updated_at();
