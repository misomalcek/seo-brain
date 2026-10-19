-- Migration 016: Index on user_deletions_audit for lookup by deleted_user_id
CREATE INDEX IF NOT EXISTS idx_user_deletions_audit_deleted_user_id
  ON user_deletions_audit(deleted_user_id);
