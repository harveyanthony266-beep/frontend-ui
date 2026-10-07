# Frontend workspace setup

## Configure Supabase and the backend

1. Apply the backend schema migrations documented in the backend deployment
   runbook. Then apply this frontend repository's
   `supabase/migrations/008_organization_memberships.sql` migration.
2. Create or invite each user in Supabase Authentication. Copy that user's
   Auth UUID from the dashboard.
3. Add an organization membership in the Supabase SQL editor, replacing both
   UUID placeholders with the existing organization ID and the Auth user ID:

   ```sql
   insert into public.organization_memberships (organization_id, user_id, role)
   values ('<organization-uuid>'::uuid, '<auth-user-uuid>'::uuid, 'member')
   on conflict (organization_id, user_id) do nothing;
   ```

   Membership writes are intentionally not available to browser clients.
   Provision and remove memberships only through a trusted administrator.
4. Copy `.env.example` to `.env.local` for local development and configure
   each value. Set the same variables in the frontend hosting environment:
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
   `SUPABASE_SERVICE_ROLE_KEY`, `BACKEND_API_URL`, and
   `BACKEND_ORG_API_KEYS`.
5. `BACKEND_ORG_API_KEYS` must be valid JSON mapping each organization UUID
   to its backend API key. This value and `SUPABASE_SERVICE_ROLE_KEY` are
   server-only secrets: do not add a `NEXT_PUBLIC_` prefix, put them in
   browser code, or commit real values.
6. Deploy/restart the frontend and verify the backend's authenticated `GET
   /me` endpoint is available. A user can upload or view data only after the
   selected organization has membership and backend verification succeeds.

The upload endpoint accepts one or more multipart entries named `file` (up to
10 files per request). The browser posts only to the same-origin BFF; it never
receives or sends an organization API key.
