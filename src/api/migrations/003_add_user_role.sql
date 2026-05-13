-- Migration 003: Add role column to users table
-- Required by auth.middleware.js requireAdmin fix (Fix D4).
-- Default is 'user'; set role = 'admin' manually in the DB for admin accounts.

ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(50) NOT NULL DEFAULT 'user';

CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);