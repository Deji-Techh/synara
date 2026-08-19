# Add file storage and media safely

Use provider-managed object storage unless the app has a documented reason to
operate its own storage service. Keep buckets private by default.

## Upload architecture

1. Authenticate the user and authorize the target tenant/resource before
   issuing an upload.
2. Generate a short-lived signed upload URL or use the provider's authenticated
   client. Never expose service-role credentials in the app.
3. Generate storage keys on the server from trusted user/tenant identifiers and
   random IDs. Never use an untrusted filename as a path.
4. Validate allowed MIME type, extension, size, and image dimensions on the
   client for fast feedback and again at the trusted server/storage boundary.
5. Store file metadata separately: owner, tenant, object key, original display
   name, MIME type, size, checksum, status, and timestamps.
6. Mark uploads pending until validation or processing finishes. Delete
   abandoned partial uploads with a bounded cleanup job.

## Delivery and processing

- Serve private objects with short-lived signed download URLs after an
  authorization check.
- Use immutable cache keys for transformed public media and avoid leaking
  private source URLs through image proxies.
- Process thumbnails, compression, metadata stripping, transcoding, and malware
  checks asynchronously. Treat processors as untrusted parsers with resource
  limits and timeouts.
- Preserve orientation and accessibility metadata deliberately. Strip GPS/EXIF
  data unless the feature requires it and the user understands the disclosure.
- Show upload progress, cancellation, retry, offline failure, and a recoverable
  error state.

## Verification

Test unauthenticated upload, cross-tenant access, oversized and disguised files,
duplicate/retried uploads, interrupted transfer, signed-URL expiry, deletion,
and cleanup. Confirm private objects cannot be fetched by guessing their path.
