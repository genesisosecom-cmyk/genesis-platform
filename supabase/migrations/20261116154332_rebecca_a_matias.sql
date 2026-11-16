-- =====================================================================
-- Baja de Rebecca (SDR): sus leads pasan a matias y se borra su cuenta.
-- Además, matias como SDR no suma comisión.
-- Lo que apuntaba a la cuenta de Rebecca (eventos, tareas) queda sin autor, no se borra;
-- los eventos conservan created_by_name.
-- =====================================================================
do $$
declare
  reb public.sales_reps := (select r from public.sales_reps r where r.name = 'Rebecca');
  mat uuid := (select id from public.sales_reps where name = 'matias');
begin
  if reb.id is null or mat is null then raise exception 'No encontré a Rebecca o a matias'; end if;

  -- matias como SDR no suma comisión.
  update public.sales_reps set cobra_comision = false where id = mat;

  -- Sus leads pasan a matias, con el evento en el historial de cada uno.
  insert into public.lead_events (lead_id, launch_id, kind, summary, data, created_by_name)
  select l.id,
    (select ll.launch_id from public.lead_launches ll where ll.lead_id = l.id order by ll.created_at desc limit 1),
    'sdr', 'Reasignado de Rebecca a matias (se dio de baja la cuenta de Rebecca)',
    jsonb_build_object('sdr_id', mat, 'from_sdr_id', reb.id), 'Admin'
  from public.leads l where l.sdr_id = reb.id;
  update public.leads set sdr_id = mat, updated_at = now() where sdr_id = reb.id;

  -- Se borra su perfil de SDR y su cuenta (lo que apuntaba a ella queda sin autor, no se borra).
  delete from public.sales_reps where id = reb.id;
  if reb.profile_id is not null then
    delete from auth.users where id = reb.profile_id;
  end if;
end $$;
