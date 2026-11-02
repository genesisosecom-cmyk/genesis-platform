-- Las contraseñas temporales ya no vencen: valen hasta que el usuario las cambia
-- en su primer ingreso (sigue siendo obligatorio). Se quita la tarea que las anulaba
-- a los 10 minutos. La columna temp_password_expires_at queda sin uso.
select cron.unschedule('expire-temp-passwords');
drop function private.expire_temp_passwords();
update public.profiles set temp_password_expires_at = null where temp_password_expires_at is not null;
