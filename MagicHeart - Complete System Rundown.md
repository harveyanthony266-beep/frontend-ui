# MagicHeart Nexus — Complete System Rundown

> [!summary] At a glance
> MagicHeart Nexus is a multi-organization document-processing application.
> Users sign in through Supabase Auth, are authorized for one or more
> organizations, upload business documents through a Next.js server-side
> backend-for-frontend (BFF), and receive extracted, reviewable records from a
> NestJS API. The NestJS API uses Gemini for extraction and Supabase for
> organization-scoped records and optional private original-file storage.

## 1. System components

| Component | Responsibility | Current location / host |
| --- | --- | --- |
| Next.js frontend | Sign-in, invitation acceptance, organization selection, upload, archive, review, export | Frontend repository; intended for Netlify deployment |
| Next.js BFF | Authenticates each browser session, checks organization membership, selects that organization's backend key, and proxies allowlisted API calls | Runs as server-side Next.js routes/functions with the frontend |
| NestJS document API | API-key authentication, file upload and type detection, Gemini extraction, review workflow, jobs, and document APIs | Backend repository; deployed backend URL currently configured as `https://ghost-business.onrender.com` |
| Supabase Auth | User accounts, invitation emails, sessions, and password setup | Supabase project |
| Supabase Postgres | Organizations, membership records, invoices/documents, job/idempotency data, and related metadata | Supabase project |
| Gemini | Extracts normalized document data from supported file content | Called by the NestJS API using a server-side API key |
| Supabase Storage | Optional private storage for source originals | Private `document-originals` bucket; backend setting controls retention |

The BFF is an important part of the security design. The browser does not call
the NestJS API directly and never receives an organization API key or
Supabase service-role key.

## 2. Authentication and invitation lifecycle

1. An administrator invites a person in Supabase **Authentication → Users**.
   The website does not have public self-registration.
2. Supabase sends an invitation email. Supabase **Authentication → URL
   Configuration** must have the live frontend as its Site URL and allow the
   frontend redirect URL, for example:
   `https://magicheartinvoice.netlify.app/**`.
3. The frontend middleware recognizes Supabase invitation callback parameters
   and routes the request through `/auth/callback`.
4. The callback exchanges the invitation authorization code (or verifies an
   invite token hash) with Supabase and writes the authenticated session into
   secure cookies.
5. The invitee is sent to `/set-password`, where they choose and confirm a
   password. The server requires a valid Supabase user session before calling
   Supabase Auth to set that password.
6. After password setup, the invitee continues to the app. Later sign-ins use
   the email/password form at `/login`.

If an invitation opens `localhost`, the Supabase Site URL or the specific
invitation redirect was set to a local address. Correct the URL configuration
and send a fresh invite; previously sent links keep their original redirect.
The invitation callback and password-setup routes must be deployed before
sending invitations.

## 3. Organization membership and tenant access

Organizations are records in `public.organizations`. Each has an organization
UUID (`id`) and a display name. The backend uses organization API keys to
identify the tenant for each API request.

The frontend migration
[`supabase/migrations/008_organization_memberships.sql`](./supabase/migrations/008_organization_memberships.sql)
creates `public.organization_memberships`, which associates a Supabase Auth
user UUID with an organization UUID. It enables row-level security and allows
authenticated users to read only their own membership rows. Browser users
cannot insert, update, or delete membership records.

An administrator provisions memberships in the Supabase SQL Editor or another
trusted admin tool. Users cannot choose an arbitrary organization ID in the
browser to obtain access. One person may have multiple membership rows, one
per organization.

### Request authorization chain

For a protected organization request:

1. The BFF reads the user's session and validates it with Supabase Auth.
2. It takes the selected organization ID as a request hint, not as proof of
   access.
3. On the server, it verifies that the authenticated user has a membership
   row for that organization.
4. It looks up the matching key in the server-only
   `BACKEND_ORG_API_KEYS` JSON map.
5. It forwards the request to the NestJS API with that key in the
   `x-api-key` header.
6. The NestJS API hashes the key, resolves the owning organization from
   Supabase, and applies that organization context to the query or operation.

The backend checks organization scope on reads and writes. The frontend's
organization name verification (`GET /me`) confirms that the backend key
selected for a membership resolves to the expected organization.

## 4. Upload and document processing

The browser sends uploads only to the same-origin BFF. The BFF reconstructs
the multipart request and proxies it to `POST /webhooks/process-invoice`.

- Multipart field name: **`file`**
- Up to **10 files per request**
- Default maximum: **25 MB per file**
- Size can be configured on the backend with `MAX_UPLOAD_MB` (legacy alias:
  `MAX_UPLOAD_SIZE_MB`)
- Larger batches may become background processing jobs rather than blocking a
  synchronous request. `MAX_SYNC_UPLOAD_MB` controls the synchronous batch
  threshold (default 8 MB).
- Files are handled in memory during upload/processing. They are not executed
  or written to a public folder.
- If source retention is enabled, originals go to a private Supabase Storage
  bucket, never a public web folder.
- An idempotency key is sent to protect retries from duplicating processing.

### File classification

The backend checks file magic bytes first, then the case-insensitive filename
extension, then a recognized MIME type. Generic or unknown MIME types do not
override useful signature or extension information. Unsupported files get a
clear `422` response; oversized uploads get `413`.

Supported types in the backend currently include:

- PDF
- PNG, JPG/JPEG, WEBP, HEIC
- XLSX, XLS, CSV
- DOCX, TXT
- EML

PDF and image files are sent to the existing Gemini document extraction flow.
Spreadsheets and CSV files are parsed into tabular/text content before
extraction. DOCX and TXT content is extracted as text. EML is also an accepted
backend input format.

The backend logs per-upload details such as filename, received MIME type,
detected type, size, duration, request ID, and result status; it does not log
the file contents.

## 5. Archive and review workflow

After the selected organization is verified, the frontend can:

- Browse that organization's documents with search, status filters, and
  pagination.
- View document records and their extracted fields, amounts, and review
  reasons.
- Upload documents and see per-file results; poll a job when the backend
  processes the batch asynchronously.
- Export filtered documents to XLSX.

The backend exposes endpoints for listing and retrieving documents, updating
editable fields, approving a document, soft-deleting a document, exporting,
and checking asynchronous job status. Database operations are scoped by the
organization resolved from the API key. Backend review logic can mark a
document `needs_review` when fields are uncertain or reconciliation checks
raise concerns.

## 6. Important routes

### Frontend routes

| Route | Purpose |
| --- | --- |
| `/login` | Email/password sign-in |
| `/auth/callback` | Validates the invitation callback and establishes a session |
| `/set-password` | Lets an invited, authenticated user choose a password |
| `/` | Workspace overview |
| `/upload` | Upload one or more documents |
| `/invoices` | Organization document archive and XLSX export |
| `/api/organizations` | Returns the signed-in user and only their authorized organizations |
| `/api/backend/[...segments]` | Authenticated, organization-authorized BFF proxy |

The BFF uses a fixed allowlist for backend paths; it is not an unrestricted
proxy. It allows health, `/me`, invoices/documents/jobs, upload/export,
approve, update, and delete operations supported by the backend.

### Backend routes

| Route | Purpose |
| --- | --- |
| `GET /health` | Public health/database check; does not require an API key |
| `GET /me` | Returns the organization name associated with the API key |
| `POST /webhooks/process-invoice` | Multipart document upload and processing |
| `GET /jobs/:id` | Organization-scoped background job status |
| `GET /documents` | Search/list organization documents |
| `GET /documents/:id` | Fetch document details |
| `PATCH /documents/:id` | Update supported document fields |
| `POST /documents/:id/approve` | Approve a document |
| `DELETE /documents/:id` | Soft-delete a document |
| `POST /documents/export` | Export selected/filtered records |

Protected NestJS routes require the `x-api-key` header. The health endpoint is
excluded from the organization's upload/authentication interceptor. The
frontend's BFF health proxy still requires a valid signed-in session.

## 7. Environment variables and secret handling

### Frontend host (Netlify)

| Variable | Visibility | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Public project URL | Supabase Auth connection |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public anon/publishable key only | Browser-compatible Supabase Auth configuration |
| `SUPABASE_SERVICE_ROLE_KEY` | **Secret; server-side only** | Server admin client reads memberships and organization metadata |
| `BACKEND_API_URL` | Not a credential; server-side setting | Base URL for NestJS API |
| `BACKEND_ORG_API_KEYS` | **Secret; server-side only** | JSON object mapping organization UUIDs to backend API keys |

The JSON key map has this shape (use real values only in the trusted secret
store):

```json
{
  "<organization-uuid>": "<that-organization-backend-api-key>"
}
```

Never put a service-role or organization API key in a `NEXT_PUBLIC_` variable,
browser code, a public repository, or a screenshot. Do not use a service-role
key as `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Keep service-role and API-key map
variables out of untrusted preview deployments unless deliberately required.

### Backend host (Render)

Common required server-side settings include:

- `GEMINI_API_KEY`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Other settings configure the upload limits, Gemini model/timeout, review
confidence, rate limiting, date locale, allowed frontend origin, and optional
private original retention. See the backend `.env.example` and `README.md` for
the complete backend settings and defaults.

The Supabase URL and backend API URL are addresses, not credentials. They
still belong in their intended configuration variables and should not be
confused with API keys.

## 8. Database migrations

The backend has migrations `001` through `007`; the frontend adds migration
`008` for user-to-organization memberships. Apply migrations only after
checking the live database state and using the backend deployment runbook.

> [!warning] Do not blindly rerun historical migration 001
> The backend runbook says migration 001 contains a historical
> `DROP COLUMN organization_id`. The upgraded installation sequence was
> documented as migrations 002–007 after inspecting the existing schema,
> applying the specified legacy cleanup only after its safety check, and
> preserving organization identity. Follow `DEPLOYMENT.md` in the
> `magicheart-nexus` backend repository for the backend-specific sequence.
> Migration 008 depends on `public.organizations(id)` and `auth.users(id)`
> already existing.

High-level schema responsibilities:

- `002`: invoice extraction fields
- `003`: ingestion jobs and deduplication
- `004`: generalized document fields and metadata
- `005`: organizations and review workflow
- `006`: idempotency and private originals/storage
- `007`: organization API keys
- `008`: frontend organization membership and RLS

Always check the actual live schema before applying SQL. Do not run destructive
cleanup statements unless the backend runbook's preconditions are verified.

## 9. Setup and deployment checklist

- [ ] Confirm backend migrations/schema are applied according to the backend
  deployment runbook.
- [ ] Apply frontend migration `008_organization_memberships.sql` after
  `public.organizations(id)` and Supabase Auth are available.
- [ ] Configure Render with the required backend secrets and verify
  `GET /health`.
- [ ] Configure Netlify's five frontend variables. Mark service-role and
  organization key-map values as secrets; keep those values server-only.
- [ ] In Supabase Auth URL Configuration, set the live Netlify Site URL and
  allow its redirect URL.
- [ ] Confirm Netlify is configured to build the Next.js app and run its server
  routes/functions, not only serve static files.
- [ ] Deploy a frontend build containing `/auth/callback` and `/set-password`
  before sending user invitations.
- [ ] Create/invite a user in Supabase Auth and add their membership row for
  the intended organization.
- [ ] Sign in and confirm only authorized organizations appear.
- [ ] Select an organization and confirm successful `/me` verification before
  trying upload/archive features.

## 10. Current status and caveats

- Frontend code is in the `harveyanthony266-beep-connect-render-backend`
  branch of the `frontend-ui` repository. The authenticated BFF was pushed in
  commit `db3c040`; the invite/password flow was pushed in commit `12d0333`.
- The invite/password code passed the frontend production build, lint, and
  security-boundary tests at the time it was pushed.
- A pushed branch does not by itself prove Netlify deployed it. Confirm the
  Netlify production branch/build log and test the live site after deployment.
- The invitation note in this repository is
  [`MagicHeart - Inviting Organization Members.md`](./MagicHeart%20-%20Inviting%20Organization%20Members.md).
- Memberships are provisioned administratively; there is no organization
  self-service signup or membership-management UI.
- Live Supabase migrations and Netlify environment variables must be applied
  in their dashboards; code pushes do not apply them automatically.
- The app deliberately fails closed if auth, membership, backend-key mapping,
  or organization verification is missing.
- If a service-role key or organization API key is accidentally shared,
  rotate/revoke it in Supabase/backend administration and replace it in the
  relevant host's secret settings. Do not preserve exposed values in notes.
- Do not store real secrets in this rundown or in Obsidian if the vault is
  synced/shared without appropriate protection.

## 11. Useful local commands

From the frontend repository:

```powershell
npm run dev
npm run lint
npm test
npm run build
```

The backend README documents its own install, run, build, and test commands.
