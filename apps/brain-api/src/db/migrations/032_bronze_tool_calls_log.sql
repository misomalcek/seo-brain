-- 032_bronze_tool_calls_log.sql
-- Phase 1 Bronze — first hypertable in Brain data layer
-- Audit trail for every tool invocation by agents (Ahrefs, vector_search, query_marketing_data, etc.)
-- Applied 2026-04-27 20:30 UTC manually via sudo -u postgres psql.
-- Depends on: 031_data_layer_extensions.sql (TimescaleDB extension)
BEGIN;

-- 1. Schema design (hypertable-aware: PK includes time column)
CREATE TABLE tool_calls_log (
  called_at         timestamptz NOT NULL DEFAULT now(),
  id                bigserial   NOT NULL,
  tool_name         text        NOT NULL,
  agent_id          text,
  user_id           uuid,
  conversation_id   uuid,
  request_id        uuid,
  model_used        text,
  input_args        jsonb,
  output_summary    text,
  output_size_bytes integer,
  duration_ms       integer,
  success           boolean     NOT NULL DEFAULT true,
  error_code        text,
  error_message     text,
  PRIMARY KEY (called_at, id)
);

-- 2. Convert to hypertable on the server edition. A plain table is enough on the desktop.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'timescaledb') THEN
    PERFORM create_hypertable('tool_calls_log', 'called_at', chunk_time_interval => INTERVAL '7 days');
  END IF;
END $$;

-- 3. Indexes for common query patterns
CREATE INDEX idx_tcl_tool_time  ON tool_calls_log (tool_name, called_at DESC);
CREATE INDEX idx_tcl_agent_time ON tool_calls_log (agent_id, called_at DESC) WHERE agent_id IS NOT NULL;
CREATE INDEX idx_tcl_user_time  ON tool_calls_log (user_id, called_at DESC) WHERE user_id IS NOT NULL;
CREATE INDEX idx_tcl_conv_time  ON tool_calls_log (conversation_id, called_at DESC) WHERE conversation_id IS NOT NULL;
CREATE INDEX idx_tcl_failures   ON tool_calls_log (called_at DESC) WHERE success = false;

-- 4. Compression policy — server edition only
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'timescaledb') THEN
    EXECUTE 'ALTER TABLE tool_calls_log SET (
      timescaledb.compress,
      timescaledb.compress_segmentby = ''tool_name, agent_id'',
      timescaledb.compress_orderby = ''called_at DESC, id DESC''
    )';
    PERFORM add_compression_policy('tool_calls_log', INTERVAL '14 days');
  END IF;
END $$;

COMMIT;

-- 5. Continuous aggregate — server edition only, and outside the transaction above.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'timescaledb') THEN
    EXECUTE $view$
      CREATE MATERIALIZED VIEW tool_calls_hourly
      WITH (timescaledb.continuous) AS
      SELECT
        time_bucket('1 hour', called_at) AS bucket,
        tool_name,
        agent_id,
        count(*)                                                              AS total_calls,
        count(*) FILTER (WHERE success = true)                                AS success_calls,
        count(*) FILTER (WHERE success = false)                               AS failure_calls,
        avg(duration_ms)::integer                                             AS avg_duration_ms,
        percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_ms)::integer    AS p95_duration_ms,
        sum(output_size_bytes)::bigint                                        AS total_output_bytes
      FROM tool_calls_log
      GROUP BY bucket, tool_name, agent_id
      WITH NO DATA
    $view$;
    PERFORM add_continuous_aggregate_policy('tool_calls_hourly',
      start_offset => INTERVAL '30 days',
      end_offset => INTERVAL '1 hour',
      schedule_interval => INTERVAL '1 hour');
  END IF;
END $$;
