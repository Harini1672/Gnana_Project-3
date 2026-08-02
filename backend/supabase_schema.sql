-- AI-Powered WhatsApp Chatbot Using RAG
-- Database Schema for Supabase (PostgreSQL)

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create trigger function for updated_at timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 1. Users Table (admin references)
CREATE TABLE IF NOT EXISTS public.users (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT UNIQUE NOT NULL,
    role TEXT NOT NULL DEFAULT 'admin',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Trigger for users
CREATE TRIGGER update_users_updated_at
BEFORE UPDATE ON public.users
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- 2. Documents Table
CREATE TABLE IF NOT EXISTS public.documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    storage_path TEXT NOT NULL, -- Path inside Supabase Storage bucket
    file_type TEXT NOT NULL,    -- pdf, docx, txt, csv
    size BIGINT NOT NULL,       -- Size in bytes
    status TEXT NOT NULL DEFAULT 'uploaded', -- uploaded, processing, indexed, error
    error_message TEXT,
    chunk_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Trigger for documents
CREATE TRIGGER update_documents_updated_at
BEFORE UPDATE ON public.documents
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- 3. Document Chunks Table
CREATE TABLE IF NOT EXISTS public.document_chunks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    document_id UUID REFERENCES public.documents(id) ON DELETE CASCADE NOT NULL,
    content TEXT NOT NULL,
    chunk_index INTEGER NOT NULL,
    vector_id TEXT NOT NULL, -- Reference ID for vectors stored in Pinecone
    metadata JSONB DEFAULT '{}'::jsonb NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 4. Chat Sessions Table (identifies WhatsApp users)
CREATE TABLE IF NOT EXISTS public.chat_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    phone_number TEXT NOT NULL UNIQUE, -- E.g. "+1234567890" or "1234567890@s.whatsapp.net"
    session_id TEXT NOT NULL UNIQUE,   -- Custom session tracker
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Trigger for chat_sessions
CREATE TRIGGER update_chat_sessions_updated_at
BEFORE UPDATE ON public.chat_sessions
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- 5. Messages Table (conversation history)
CREATE TABLE IF NOT EXISTS public.messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID REFERENCES public.chat_sessions(id) ON DELETE CASCADE NOT NULL,
    sender TEXT NOT NULL CHECK (sender IN ('user', 'bot')),
    message_id TEXT, -- WhatsApp unique message ID from webhook
    content TEXT NOT NULL,
    retrieved_chunks JSONB DEFAULT '[]'::jsonb, -- Store retrieved chunks for auditing RAG references
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 6. System Settings Table
CREATE TABLE IF NOT EXISTS public.system_settings (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Trigger for system_settings
CREATE TRIGGER update_system_settings_updated_at
BEFORE UPDATE ON public.system_settings
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- 7. Audit Logs Table
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    action TEXT NOT NULL,
    details TEXT NOT NULL,
    performed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Insert Default Settings
INSERT INTO public.system_settings (key, value) VALUES
('chunk_size', '500'),
('chunk_overlap', '50'),
('top_k', '4'),
('similarity_threshold', '0.7'),
('system_prompt', '"You are a helpful company assistant. Answer only using the provided context. If the answer is not present in the context, clearly say you don''t know. Do not fabricate information."'),
('embedding_provider', '"huggingface"'),
('embedding_model', '"sentence-transformers/all-MiniLM-L6-v2"'),
('llm_model', '"google/gemma-2-2b-it"'),
('embedding_dimension', '384')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

-- Enable Row Level Security (RLS)
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Setup RLS Policies for Admin Access
-- Admins will log in via Supabase Auth.
-- All operations via the Admin Dashboard frontend carry the authenticated user's JWT.
-- Since the FastAPI backend will run administrative tasks and WhatsApp webhook execution,
-- the backend can bypass RLS using the service role key, OR the backend can proxy user tokens.
-- Here we enable public read for tables if necessary, but keep it admin-restricted.

-- Create policies for Users
CREATE POLICY "Admins can view and edit users"
    ON public.users
    FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);

-- Create policies for Documents
CREATE POLICY "Admins can manage documents"
    ON public.documents
    FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);

-- Create policies for Document Chunks
CREATE POLICY "Admins can manage document chunks"
    ON public.document_chunks
    FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);

-- Create policies for Chat Sessions
CREATE POLICY "Admins can manage chat sessions"
    ON public.chat_sessions
    FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);

-- Create policies for Messages
CREATE POLICY "Admins can manage messages"
    ON public.messages
    FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);

-- Create policies for System Settings
CREATE POLICY "Admins can manage system settings"
    ON public.system_settings
    FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);

-- Create policies for Audit Logs
CREATE POLICY "Admins can manage audit logs"
    ON public.audit_logs
    FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);

-- Create an auto-profile creation trigger for when a new user signs up in auth.users
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.users (id, email, role)
    VALUES (new.id, new.email, 'admin')
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Performance Indexes
CREATE INDEX IF NOT EXISTS idx_document_chunks_document_id ON public.document_chunks(document_id);
CREATE INDEX IF NOT EXISTS idx_messages_session_id ON public.messages(session_id);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_phone_number ON public.chat_sessions(phone_number);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs(created_at DESC);
