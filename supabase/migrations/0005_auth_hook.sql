-- Sign-in through Supabase Auth.
--
-- Every family member, the owner included, has a hidden Supabase Auth user
-- linked from members.auth_user_id. The big screen signs in as an anonymous
-- Auth user linked from screen_sessions once the host approves it.
--
-- The custom access token hook below adds the claims the row level security
-- policies read: kind, family_id, member_id, member_role (members) or room_id
-- (screens). It never touches the standard "role" claim, which Supabase uses
-- to choose the database role for the request.
--
-- Anyone with no link, a locked member, or an expired screen gets no custom
-- claims at all, and therefore sees nothing.

alter table members add column auth_user_id uuid unique;

create table screen_sessions (
  auth_user_id uuid primary key,
  room_id uuid not null references rooms(id) on delete cascade,
  family_id uuid not null references families(id) on delete cascade,
  approved_by uuid not null references members(id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '12 hours'
);

create index screen_sessions_room_idx on screen_sessions (room_id);

alter table screen_sessions enable row level security;
-- No client policy: written and read only by the server and the hook.

-- ---------------------------------------------------------------------------
-- The owner is a member who plays. Ownership is a claim, not a token kind.
-- ---------------------------------------------------------------------------

create or replace function app.member_role() returns text
language sql stable as $$
  select app.claim('member_role');
$$;

grant execute on function app.member_role() to anon, authenticated, service_role;

drop policy member_skills_read on member_skills;
create policy member_skills_read on member_skills for select
  using (
    app.token_kind() = 'member'
    and (
      member_id = app.member_id()
      or (app.member_role() = 'owner'
          and member_id in (select id from members where family_id = app.family_id()))
    )
  );

-- ---------------------------------------------------------------------------
-- Custom access token hook
-- ---------------------------------------------------------------------------

create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
as $$
declare
  v_user uuid := (event ->> 'user_id')::uuid;
  v_claims jsonb := coalesce(event -> 'claims', '{}'::jsonb);
  m record;
  s record;
begin
  -- Never trust custom claims arriving on the event; rebuild them here.
  v_claims := v_claims - 'kind' - 'family_id' - 'member_id' - 'member_role' - 'room_id';

  select id, family_id, role, locked_until
    into m
    from public.members
   where auth_user_id = v_user;

  if found then
    if m.locked_until is null or m.locked_until <= now() then
      v_claims := v_claims || jsonb_build_object(
        'kind', 'member',
        'family_id', m.family_id,
        'member_id', m.id,
        'member_role', m.role
      );
    end if;
  else
    select room_id, family_id
      into s
      from public.screen_sessions
     where auth_user_id = v_user
       and expires_at > now();

    if found then
      v_claims := v_claims || jsonb_build_object(
        'kind', 'screen',
        'family_id', s.family_id,
        'room_id', s.room_id
      );
    end if;
  end if;

  return jsonb_set(event, '{claims}', v_claims);
end;
$$;

-- Only Supabase Auth may run the hook, and it may read only what the hook needs.
grant usage on schema public to supabase_auth_admin;
-- Every select policy on members is evaluated for the hook's role too, and
-- those policies call the app claim helpers.
grant usage on schema app to supabase_auth_admin;
grant execute on all functions in schema app to supabase_auth_admin;
grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook(jsonb) from authenticated, anon, public;

grant select on public.members to supabase_auth_admin;
grant select on public.screen_sessions to supabase_auth_admin;

create policy members_auth_hook_read on members as permissive for select
  to supabase_auth_admin using (true);
create policy screen_sessions_auth_hook_read on screen_sessions as permissive for select
  to supabase_auth_admin using (true);
