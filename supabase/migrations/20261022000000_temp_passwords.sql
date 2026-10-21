-- =====================================================================
-- Contraseñas temporales (10 minutos) con cambio obligatorio al ingresar
-- =====================================================================

alter table public.profiles
  add column must_change_password boolean not null default false,
  add column temp_password_expires_at timestamptz;

-- Mientras el usuario no cambie su contraseña temporal, no tiene permisos de admin.
create or replace function private.is_superadmin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'superadmin' and active and not must_change_password
  );
$$;

-- Invalida las contraseñas temporales vencidas: las reemplaza por una aleatoria
-- y cierra las sesiones abiertas con ellas. El admin tiene que generar una nueva.
create or replace function private.expire_temp_passwords()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  expired uuid[];
begin
  select coalesce(array_agg(id), '{}') into expired
  from public.profiles
  where must_change_password and temp_password_expires_at is not null and temp_password_expires_at < now();

  if array_length(expired, 1) is null then
    return;
  end if;

  update auth.users
  set encrypted_password = extensions.crypt(gen_random_uuid()::text, extensions.gen_salt('bf'))
  where id = any (expired);

  update auth.sessions set not_after = now() where user_id = any (expired) and (not_after is null or not_after > now());

  update public.profiles set temp_password_expires_at = null where id = any (expired);
end;
$$;

revoke execute on function private.expire_temp_passwords() from public, anon, authenticated;

create extension if not exists pg_cron;

select cron.schedule('expire-temp-passwords', '* * * * *', 'select private.expire_temp_passwords()');
