-- Datasets: admin-approved structured tables (CSV, XLSX, MD) for batch content planning/generation
CREATE TABLE IF NOT EXISTS datasets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filename VARCHAR(255) NOT NULL,
  original_name VARCHAR(255) NOT NULL,
  file_path TEXT NOT NULL,
  file_type VARCHAR(20) NOT NULL CHECK (file_type IN ('csv', 'xlsx', 'md')),
  description TEXT,
  row_count INTEGER,
  column_names TEXT[],
  size_bytes BIGINT DEFAULT 0,
  is_approved BOOLEAN DEFAULT FALSE,
  uploaded_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_datasets_approved ON datasets(is_approved);
CREATE INDEX idx_datasets_type ON datasets(file_type);
