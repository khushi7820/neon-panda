-- =========================================
-- Migration: Fix Row Level Security (RLS) Policies
-- =========================================

-- Enable RLS on all tables (it might already be enabled in Supabase by default)
ALTER TABLE phone_document_mapping ENABLE ROW LEVEL SECURITY;
ALTER TABLE rag_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE rag_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- 1. phone_document_mapping: Allow full access for anon/service_role
-- Note: In production, you might want more restrictive policies.
CREATE POLICY "Allow all access to phone_document_mapping" 
ON public.phone_document_mapping 
FOR ALL 
USING (true) 
WITH CHECK (true);

-- 2. rag_files: Allow read/insert access
CREATE POLICY "Allow all access to rag_files" 
ON public.rag_files 
FOR ALL 
USING (true) 
WITH CHECK (true);

-- 3. rag_chunks: Allow read/insert access
CREATE POLICY "Allow all access to rag_chunks" 
ON public.rag_chunks 
FOR ALL 
USING (true) 
WITH CHECK (true);

-- 4. whatsapp_messages: Allow read/insert access
CREATE POLICY "Allow all access to whatsapp_messages" 
ON public.whatsapp_messages 
FOR ALL 
USING (true) 
WITH CHECK (true);

-- 5. messages (web chat): Allow read/insert access
CREATE POLICY "Allow all access to messages" 
ON public.messages 
FOR ALL 
USING (true) 
WITH CHECK (true);

-- =========================================
-- Migration Complete
-- =========================================
