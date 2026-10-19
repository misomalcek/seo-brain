-- 034_bronze_agent_runs.sql
-- Bronze expansion — per-request agent metrics hypertable
-- Complement to tool_calls_log (per-tool-call): agent_runs is per-chat-request roll-up
-- Per LIP: extends p2-data-layer-medallion-bronze (was active, now broadens)
-- Depends on: 031 (TimescaleDB), 032 (Bronze pattern established)

BEGIN;

CREATE TABLE agent_runs (
  ran_at                       timestamptz NOT NULL DEFAULT now(),
  id                           bigserial   NOT NULL,
  request_id                   uuid,
  conversation_id              uuid,
  user_id                      uuid,
  agent_id                     text,
  model_used                   text,
  mode                         text,
  persona_id                   text,
  tools_loaded                 integer,
  tool_calls_count             integer,
  iterations                   integer,
  input_tokens                 integer,
  output_tokens                integer,
  cache_creation_input_tokens  integer,
  cache_read_input_tokens      integer,
  estimated_context_tokens     integer,
  total_duration_ms            integer,
  success                      boolean     NOT NULL DEFAULT true,
  error_code                   text,
  error_message                text,
  PRIMARY KEY (ran_at, id)
);

-- Convert to hypertable on the server edition. The desktop keeps the plain table.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'timescaledb') THEN
    PERFORM create_hypertable('agent_runs', 'ran_at', chunk_time_interval => INTERVAL '7 days');
  END IF;
END $$;

-- Indexes for common query patterns
CREATE INDEX idx_ar_agent_time      ON agent_runs (agent_id, ran_at DESC) WHERE agent_id IS NOT NULL;
CREATE INDEX idx_ar_user_time       ON agent_runs (user_id, ran_at DESC) WHERE user_id IS NOT NULL;
CREATE INDEX idx_ar_conv_time       ON agent_runs (conversation_id, ran_at DESC) WHERE conversation_id IS NOT NULL;
CREATE INDEX idx_ar_request_lookup  ON agent_runs (request_id) WHERE request_id IS NOT NULL;
CREATE INDEX idx_ar_failures        ON agent_runs (ran_at DESC) WHERE success = false;
CREATE INDEX idx_ar_model_time      ON agent_runs (model_used, ran_at DESC) WHERE model_used IS NOT NULL;

-- Compression policy — server edition only
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'timescaledb') THEN
    EXECUTE 'ALTER TABLE agent_runs SET (
      timescaledb.compress,
      timescaledb.compress_segmentby = ''agent_id, model_used'',
      timescaledb.compress_orderby = ''ran_at DESC, id DESC''
    )';
    PERFORM add_compression_policy('agent_runs', INTERVAL '14 days');
  END IF;
END $$;

COMMIT;

-- Continuous aggregate — server edition only
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'timescaledb') THEN
    EXECUTE $view$
      CREATE MATERIALIZED VIEW agent_runs_hourly
      WITH (timescaledb.continuous) AS
      SELECT
        time_bucket('1 hour', ran_at)                         AS bucket,
        agent_id,
        model_used,
        mode,
        count(*)                                              AS total_runs,
        count(*) FILTER (WHERE success = true)                AS success_runs,
        count(*) FILTER (WHERE success = false)               AS failure_runs,
        avg(total_duration_ms)::integer                       AS avg_duration_ms,
        percentile_cont(0.95) WITHIN GROUP (ORDER BY total_duration_ms)::integer AS p95_duration_ms,
        sum(input_tokens)::bigint                             AS total_input_tokens,
        sum(output_tokens)::bigint                            AS total_output_tokens,
        sum(cache_read_input_tokens)::bigint                  AS total_cache_read_tokens,
        avg(tool_calls_count)::numeric(6,2)                   AS avg_tool_calls,
        avg(iterations)::numeric(6,2)                         AS avg_iterations
      FROM agent_runs
      GROUP BY bucket, agent_id, model_used, mode
      WITH NO DATA
    $view$;
    PERFORM add_continuous_aggregate_policy('agent_runs_hourly',
      start_offset => INTERVAL '30 days',
      end_offset => INTERVAL '1 hour',
      schedule_interval => INTERVAL '1 hour');
  END IF;
END $$;
