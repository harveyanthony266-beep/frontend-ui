# MagicHeart — Inviting Organization Members

Use this checklist whenever a person needs access to an organization. Access is
invite-only: never ask a person to enter an organization ID or let them grant
themselves access from the website.

## One-time setup

- [ ] In the correct Supabase project, run the SQL from
  `supabase/migrations/008_organization_memberships.sql`.
- [ ] Confirm the backend's `public.organizations` table exists and has an
  `id` column.
- [ ] In **Authentication → URL Configuration**, set **Site URL** to the live
  frontend origin (for example, `https://magicheartinvoice.netlify.app`) and
  add `https://magicheartinvoice.netlify.app/**` to the allowed redirect URLs.
- [ ] Deploy the frontend version that includes the invite callback and
  password setup page before sending invitations.

The migration creates `public.organization_memberships`, which links Supabase
Auth users to the organizations they are allowed to access.

## Invite a member

1. In Supabase, open **Authentication → Users** and invite the person by email.
   The invite link should redirect to the live frontend. They will choose their
   own password on the **Create your password** page; do not send them a
   password.
2. Find the organization's UUID in `public.organizations`. Use its `id` value,
   not its display name.
3. In the SQL Editor for the same Supabase project, run the query below. Replace
   `<organization-uuid>` with the organization's `id` and `<member-email>` with
   the exact email used for their Supabase Auth account.

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

4. Confirm the query returns a row. If it returns no rows, confirm the Auth
   account exists and that the email and organization UUID are correct.
5. Ask the member to sign in. The organization should appear in their workspace
   selector once the frontend is configured and deployed.

If an invite link opens `localhost`, check the Supabase **Site URL** and
allowed redirect URLs above, then send a fresh invitation. Old links retain
their original redirect address.

## Give a member access to another organization

Run the invite query again with that organization's UUID and the same member
email. Each authorized organization requires its own membership row.

## Revoke a member's access to one organization

Replace `<organization-uuid>` and `<member-email>`, then run:

```sql
delete from public.organization_memberships
where organization_id = '<organization-uuid>'::uuid
  and user_id = (
    select id
    from auth.users
    where lower(email) = lower('<member-email>')
  );
```

Membership creation and removal are administrative actions. Do not grant users
direct `INSERT`, `UPDATE`, or `DELETE` access to the membership table.
