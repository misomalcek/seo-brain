-- Content Calendar: add attachments JSONB column
ALTER TABLE content_items ADD COLUMN IF NOT EXISTS attachments JSONB DEFAULT '[]'::jsonb;
