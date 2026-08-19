#!/usr/bin/env bash
# OpenCode DB maintenance sweep.
#
# Why: massive `summary.diffs` arrays (full file diffs embedded in compaction
# summary messages) make the desktop renderer hang with "renderer unresponsive"
# (O(n^2) diff dedupe in constructMessageRows). This script clears those blobs
# BEFORE you open big sessions in the desktop app.
#
# The data is display metadata only: code, chat content and tool-call parts live
# in `part` rows / on disk / in git, so clearing diffs loses nothing real.
#
# Usage: scripts/opencode-db-sweep.sh [DB] [THRESHOLD]
#   DB        path to the opencode sqlite db (default: ~/.local/share/opencode/opencode.db)
#   THRESHOLD diffs above this get cleared to [] (default: 500)
set -euo pipefail

DB="${1:-$HOME/.local/share/opencode/opencode.db}"
THRESHOLD="${2:-500}"

[ -f "$DB" ] || { echo "error: db not found: $DB" >&2; exit 1; }

echo "== db: $DB (journal_mode=$(sqlite3 "$DB" 'PRAGMA journal_mode;'))"

OFFENDERS=$(sqlite3 "$DB" \
  "SELECT count(*) FROM message WHERE json_type(json_extract(data,'$.summary.diffs'))='array' AND json_array_length(json_extract(data,'$.summary.diffs'))>$THRESHOLD;")

if [ "$OFFENDERS" = "0" ]; then
  echo "== no messages with summary.diffs > $THRESHOLD — nothing to do"
else
  STAMP=$(date +%Y%m%d-%H%M%S)
  BACKUP="$HOME/Downloads/opencode-sweep-backup-$STAMP.sql"
  echo "== clearing $OFFENDERS offender(s); exact pre-clear copy -> $BACKUP"
  sqlite3 "$DB" ".mode insert" ".output $BACKUP" \
    "SELECT * FROM message WHERE json_type(json_extract(data,'$.summary.diffs'))='array' AND json_array_length(json_extract(data,'$.summary.diffs'))>$THRESHOLD;" \
    ".output stdout"
  ROWS=$(sqlite3 "$DB" \
    "UPDATE message SET data=json_set(data,'$.summary.diffs',json('[]')) WHERE json_type(json_extract(data,'$.summary.diffs'))='array' AND json_array_length(json_extract(data,'$.summary.diffs'))>$THRESHOLD; SELECT changes();")
  echo "== cleared: $ROWS row(s)"
fi

echo "== freed-file: $(du -h "$DB" | cut -f1)"

echo "== largest 10 sessions (message+part bytes):"
sqlite3 -column -header "$DB" \
  "SELECT session_id, printf('%.1f MB', (m.s+p.s)/1048576.0) AS size_mb, m.m msgs, p.p parts
   FROM (SELECT session_id, sum(length(data)) s, count(*) m FROM message GROUP BY session_id) m
   JOIN (SELECT session_id, sum(length(data)) s, count(*) p FROM part GROUP BY session_id) p USING(session_id)
   ORDER BY (m.s+p.s) DESC LIMIT 10;"

FREE=$(df -P --output=avail -B1 "$HOME" | tail -n1)
if [ "$(echo "$FREE / 1073741824" | bc)" -lt 5 ]; then
  echo "== WARNING: < 5 GB free on $(df -P . | tail -n1 | awk '{print $6}'); run 'VACUUM' at the app's next idle to reclaim freed pages:"
  echo "   sqlite3 \"$DB\" 'VACUUM;'"
fi