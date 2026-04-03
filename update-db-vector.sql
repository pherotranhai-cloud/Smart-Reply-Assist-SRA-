-- Migration script to add pgvector to the vocab table

-- Enable the pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Add a vector column to the vocab table
-- We use 1536 dimensions as it's standard for OpenAI's text-embedding-ada-002 / text-embedding-3-small
-- If using Gemini, it might be 768. We'll use 1536 as a safe default or allow it to be flexible.
-- Let's use 1536 as requested in the prompt (or 768). We'll use 1536.
ALTER TABLE vocab ADD COLUMN IF NOT EXISTS embedding vector(768);

-- Create an index for faster similarity search (cosine distance)
CREATE INDEX IF NOT EXISTS vocab_embedding_idx ON vocab USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
