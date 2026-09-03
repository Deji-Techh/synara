-- Users table (email-based, no passwords — magic-link only)
CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);

-- Auth tokens (magic link tokens, short-lived)
CREATE TABLE IF NOT EXISTS auth_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  email text NOT NULL,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS auth_tokens_hash_idx ON auth_tokens(token_hash);

-- User sessions (long-lived session tokens)
CREATE TABLE IF NOT EXISTS user_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS user_sessions_hash_idx ON user_sessions(token_hash);

-- Projects (owned by users, linked to shares)
CREATE TABLE IF NOT EXISTS user_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  share_id uuid REFERENCES project_shares(id) ON DELETE SET NULL,
  name text NOT NULL,
  description text,
  preview_url text,
  thumbnail_url text,
  file_count integer NOT NULL DEFAULT 0,
  total_size bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS user_projects_user_idx ON user_projects(user_id);

-- Project files (individual files for browsing)
CREATE TABLE IF NOT EXISTS project_files (
  project_id uuid NOT NULL REFERENCES user_projects(id) ON DELETE CASCADE,
  path text NOT NULL,
  name text NOT NULL,
  extension text,
  content text,
  size bigint NOT NULL DEFAULT 0,
  file_type text NOT NULL DEFAULT 'file' CHECK (file_type IN ('file', 'directory')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, path)
);
CREATE INDEX IF NOT EXISTS project_files_project_idx ON project_files(project_id);
