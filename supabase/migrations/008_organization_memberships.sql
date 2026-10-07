create table if not exists public.organization_memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id) on delete cascade,
  user_id uuid not null
    references auth.users(id) on delete cascade,
  role text not null default 'member'
    check (role in ('member', 'admin')),
  created_at timestamptz not null default now(),
  unique (organization_id, user_id)
);

create index if not exists idx_organization_memberships_user
  on public.organization_memberships (user_id, organization_id);

alter table public.organization_memberships enable row level security;

drop policy if exists "Users can read their own organization memberships"
  on public.organization_memberships;
create policy "Users can read their own organization memberships"
  on public.organization_memberships
  for select
  to authenticated
  using (user_id = (select auth.uid()));

grant select on public.organization_memberships to authenticated;
revoke insert, update, delete on public.organization_memberships
  from anon, authenticated;
