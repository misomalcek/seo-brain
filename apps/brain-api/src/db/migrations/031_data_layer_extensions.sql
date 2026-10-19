-- 031_data_layer_extensions.sql
-- TimescaleDB is the server edition. The desktop database has no chunking.
-- vectorscale was declared and never used (no diskann index). It is not installed.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'timescaledb') THEN
    CREATE EXTENSION IF NOT EXISTS timescaledb;
  END IF;
END $$;
