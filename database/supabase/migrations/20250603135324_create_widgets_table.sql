-- Create Widgets table for storing AI-generated data visualizations
CREATE TABLE public.widgets (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    original_query TEXT NOT NULL,
    visualization_data JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Add indexes for better performance
CREATE INDEX idx_widgets_user_id ON public.widgets(user_id);
CREATE INDEX idx_widgets_created_at ON public.widgets(created_at DESC);

-- Enable Row Level Security (RLS)
ALTER TABLE public.widgets ENABLE ROW LEVEL SECURITY;

-- Create policy for users to only access their own widgets
CREATE POLICY "Users can view their own widgets" ON public.widgets
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own widgets" ON public.widgets
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own widgets" ON public.widgets
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own widgets" ON public.widgets
    FOR DELETE USING (auth.uid() = user_id);

-- Create trigger to automatically update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_widgets_updated_at 
    BEFORE UPDATE ON public.widgets 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column(); 