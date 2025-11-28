-- Add avatar_url column to volunteers table
ALTER TABLE volunteers ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- Add RLS policy to allow anyone to update volunteers (for avatar uploads)
CREATE POLICY "Anyone can update volunteers" ON volunteers
  FOR UPDATE USING (true);

-- Create storage bucket for volunteer avatars (run this in Supabase dashboard if needed)
INSERT INTO storage.buckets (id, name, public) VALUES ('avatars', 'avatars', true);

-- Storage policy to allow anyone to upload avatars
CREATE POLICY "Anyone can upload avatars" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'avatars');

-- Storage policy to allow anyone to view avatars
CREATE POLICY "Anyone can view avatars" ON storage.objects
  FOR SELECT USING (bucket_id = 'avatars');
