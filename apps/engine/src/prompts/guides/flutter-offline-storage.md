<flutter-only>
## Offline Storage (Flutter)

How to persist data locally in a Flutter app. Choose the lightest option that
solves the actual problem; do not add a database before the product needs one.

### Decision ladder

1. **`shared_preferences`** — small key/value settings: theme mode, onboarding
   flags, last-selected tab. Not for structured or growing data.
2. **`hive` / `hive_ce`** — lightweight boxes of typed objects with fast reads.
   Good for caches and simple collections without relational queries. Prefer
   the community-maintained `hive_ce` fork for new code.
3. **`drift`** — full SQLite with typed queries, migrations, joins, and
   reactive streams (`watch()`). Use when data is relational, filtered/sorted
   in queries, or needs transactional integrity.
4. **Files via `path_provider`** — documents, exports, media blobs. Never dump
   JSON blobs into shared_preferences.

### Wiring rules

- Wrap storage behind a service/repository class; widgets never call the
  storage package directly. This keeps UI testable and lets you swap engines.
- Initialize async storage before `runApp` when the first frame depends on it:
  `WidgetsFlutterBinding.ensureInitialized();` then await the container/DB open,
  or surface an explicit loading state instead.
- With drift, define tables in Dart, bump a `schemaVersion` for every schema
  change, and write migrations — never delete user data on upgrade.
- Model explicit domain objects at the boundary; do not leak box entries or
  drift row classes into widget layers.

### Sync patterns

- Optimistic UI: apply local changes immediately, reconcile with the server
  afterwards; queue failed mutations for retry.
- Keep a per-record sync status (synced/pending/failed) so the UI can show
  honest state; never silently drop queued writes.
- Conflict policy: prefer server-wins for mutable shared records,
  last-write-wins only for single-user preferences.

### Pitfalls

- Do not store secrets in shared_preferences or unencrypted Hive — use
  `flutter_secure_storage`.
- Dispose/close boxes and DB connections owned by a scope; drift databases are
  usually app-lifetime singletons — open once, close never (except tests).
- In tests use in-memory instances (`NativeDatabase.memory()` for drift) rather
  than temp files.
  </flutter-only>
