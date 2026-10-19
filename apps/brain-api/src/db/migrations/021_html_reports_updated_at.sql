-- Migration 021: Add updated_at to html_reports for refresh tracking
ALTER TABLE html_reports ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;
