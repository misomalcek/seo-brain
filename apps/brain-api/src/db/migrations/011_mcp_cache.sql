-- MCP Result Cache: store results to avoid duplicate MCP bridge calls
CREATE TABLE IF NOT EXISTS mcp_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cache_key VARCHAR(512) UNIQUE NOT NULL,
  tool_name VARCHAR(100) NOT NULL,
  params JSONB NOT NULL,
  result JSONB NOT NULL,
  report_filename VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX idx_mcp_cache_key ON mcp_cache(cache_key);
CREATE INDEX idx_mcp_cache_expires ON mcp_cache(expires_at);
