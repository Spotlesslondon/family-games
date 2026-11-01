-- Schema fingerprint. Run it on the live database (Supabase SQL editor) and
-- compare with the lines npm run db:test prints from a fresh build of the
-- migrations. Matching hashes mean the live database is exactly what the code
-- says. (pgcrypto functions are left out: locally they sit in public, on
-- Supabase in the extensions schema.)
with
cols as (select string_agg(table_name||'.'||column_name||':'||data_type||':'||is_nullable||':'||coalesce(column_default,''), '|' order by table_name, column_name) s
         from information_schema.columns where table_schema = 'public'),
pols as (select string_agg(tablename||'.'||policyname||':'||cmd||':'||permissive||':'||array_to_string(roles,','), '|' order by tablename, policyname) s
         from pg_policies where schemaname = 'public'),
idx as (select string_agg(indexname, '|' order by indexname) s from pg_indexes where schemaname = 'public'),
grants as (select string_agg(table_name||'.'||column_name||':'||grantee||':'||privilege_type, '|' order by table_name, column_name, grantee, privilege_type) s
           from information_schema.column_privileges where table_schema = 'public' and grantee in ('anon','authenticated')),
rls as (select string_agg(c.relname||':'||c.relrowsecurity, '|' order by c.relname) s
        from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r'),
ruletext as (select string_agg(tablename||'.'||policyname||':'||coalesce(qual,'')||':'||coalesce(with_check,''), '|' order by tablename, policyname) s from pg_policies where schemaname = 'public'),
ours as (select string_agg(n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||'):'||md5(p.prosrc)||':'||coalesce(array_to_string(p.proconfig,','),''), '|' order by n.nspname, p.proname, 1) s
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where (n.nspname = 'app') or (n.nspname = 'public' and p.prolang <> 13 and p.proname not like 'pgp\_%'
        and p.proname not in ('armor','dearmor','crypt','gen_salt','digest','hmac','encrypt','decrypt','encrypt_iv','decrypt_iv','gen_random_bytes','gen_random_uuid'))),
phonefn as (select count(*) n from pg_proc p join pg_namespace n on n.oid = p.pronamespace cross join pg_roles r
            where n.nspname = 'public' and r.rolname in ('anon','authenticated') and has_function_privilege(r.oid, p.oid, 'execute')
              and p.proname not like 'pgp\_%'
              and p.proname not in ('armor','dearmor','crypt','gen_salt','digest','hmac','encrypt','decrypt','encrypt_iv','decrypt_iv','gen_random_bytes','gen_random_uuid'))
select 'columns' as part, left(md5(cols.s), 12) as hash from cols
union all select 'policies', left(md5(pols.s), 12) from pols
union all select 'indexes', left(md5(idx.s), 12) from idx
union all select 'phone column grants', left(md5(grants.s), 12) from grants
union all select 'row level security', left(md5(rls.s), 12) from rls
union all select 'rule text', left(md5(ruletext.s), 12) from ruletext
union all select 'our functions', left(md5(ours.s), 12) from ours
union all select 'phone-callable functions', n::text from phonefn;
