-- Live worldwide mobile previews via a reverse tunnel.
--
-- Unlike preview_sessions (which upload a project bundle to a cloud worker and
-- serve a static build), a preview_tunnel exposes the developer's *running*
-- localhost app to the internet. The desktop holds open an authenticated
-- control WebSocket to the control plane; the control plane reverse-proxies
-- inbound HTTP/WS traffic down that connection back to localhost.
--
-- The public token lives in the share URL (https://.../t/<publicToken>/...), so
-- the viewer does not need an installation credential. The tunnel token is kept
-- private to the owning installation and authenticates the control connection.

-- Installation tenant model used by the standalone preview control plane
-- (services/preview-control-plane). Each CAIDE installation registers once and
-- receives a revocable access token; per-installation limits gate previews.
CREATE TABLE IF NOT EXISTS preview_installations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id uuid NOT NULL,
  display_name text NOT NULL,
  access_token_hash text NOT NULL UNIQUE,
  plan text NOT NULL DEFAULT 'free'
    CHECK (plan IN ('free', 'pro', 'team', 'internal')),
  max_concurrent_sessions integer NOT NULL DEFAULT 1 CHECK (max_concurrent_sessions > 0),
  daily_session_limit integer NOT NULL DEFAULT 10 CHECK (daily_session_limit > 0),
  disabled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS preview_installations_device_idx
  ON preview_installations(device_id);

CREATE TABLE IF NOT EXISTS preview_tunnels (
  id uuid PRIMARY KEY,
  installation_id uuid NOT NULL REFERENCES preview_installations(id) ON DELETE CASCADE,
  app_id integer NOT NULL,
  -- Used to authenticate the desktop's outbound control WebSocket. Kept as a
  -- hash so a DB leak does not expose a credential that can hijack a live URL.
  tunnel_token_hash text NOT NULL UNIQUE,
  -- Used to look up the tunnel from a public share URL (/t/<publicToken>/...).
  public_token_hash text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'offline'
    CHECK (status IN ('offline', 'online', 'expired')),
  -- Server-driven lifetime so a preview never outlives its grant even if the
  -- desktop quits without a clean tear-down.
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  stopped_at timestamptz,
  last_seen_at timestamptz
);

CREATE INDEX IF NOT EXISTS preview_tunnels_installation_status_idx
  ON preview_tunnels(installation_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS preview_tunnels_expiry_idx
  ON preview_tunnels(expires_at, status);
CREATE INDEX IF NOT EXISTS preview_tunnels_public_token_idx
  ON preview_tunnels(public_token_hash);