---
name: backend-production
triggers: ["backend", "api", "database", "security", "schema", "auth"]
companions: ["product-flow"]
---

# Backend Production & Security Skill Pack

## Production Backend Standards
1. **Schema Validation**: All inbound network payloads must be validated at runtime (e.g. Zod or Effect Schema).
2. **Security**: Never hardcode API keys, secrets, or bearer tokens in client artifacts.
3. **Data Model Integrity**: Foreign keys, unique constraints, and indices on query lookups.
4. **Resilience**: Timeout policies, exponential backoff on transient calls, idempotent mutation endpoints.
