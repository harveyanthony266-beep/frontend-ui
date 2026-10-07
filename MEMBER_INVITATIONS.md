# Adding an invited organization member

Use this process each time someone needs access. Do not ask the person to enter
an organization ID or grant membership from the browser.

## One-time setup

Apply `supabase/migrations/008_organization_memberships.sql` in the correct
Supabase project's SQL Editor. It creates the membership table used to control
which organizations signed-in users may access. The backend's
`public.organizations` table and its `id` column must already exist.

## Add a member

1. In Supabase, open **Authentication → Users** and invite the person by email
   (or create their account there). They should use that email to sign in to the
   frontend.
2. Find the organization's UUID in the `public.organizations` table. Use the
   `id` column, not the organization's display name.
3. In the Supabase SQL Editor for the same project, run this query after
   replacing both placeholders. It finds the user's Auth ID by email and
   grants access only to the specified organization:

   ```sql
   insert into public.organization_memberships (organization_id, user_id, role)
   select
     '<organization-uuid>'::uuid,
     users.id,
     'member'
   from auth.users as users
   where lower(users.email) = lower('<member-email>')
   on conflict (organization_id, user_id) do nothing
   returning organization_id, user_id, role;
   ```

4. Confirm the query returned a row. If it returned no rows, check that the
   Auth user exists and the email and organization UUID are correct.
5. Ask the member to sign in again. Their organization should appear in the
   workspace selector after the frontend is deployed with its required
   server-side environment variables.

To grant the same user access to another organization, repeat the query with
that organization's UUID. A user can have a separate membership row for each
organization they are authorized to access.

## Remove access

Replace the placeholders and run this query to revoke one user's membership
from one organization:

```sql
delete from public.organization_memberships
where organization_id = '<organization-uuid>'::uuid
  and user_id = (
    select id
    from auth.users
    where lower(email) = lower('<member-email>')
  );
```

Membership provisioning and revocation are administrative actions. Do not
grant users direct insert, update, or delete access to this table.
