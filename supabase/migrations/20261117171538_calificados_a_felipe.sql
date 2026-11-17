-- =====================================================================
-- Todos los leads calificados pasan a Felipe Molina (closer y SDR), con el evento en el
-- historial de cada uno. Las calls ya agendadas conservan la SDR que las agendó.
-- =====================================================================
do $$
declare
  fel uuid := (select id from public.sales_reps where name = 'Felipe Molina');
begin
  if fel is null then raise exception 'No encontré a Felipe Molina'; end if;

  -- Felipe es closer y SDR.
  update public.sales_reps set sdr_status = 'activo', closer_status = 'activo' where id = fel;

  insert into public.lead_events (lead_id, launch_id, kind, summary, data, created_by_name)
  select l.id,
    (select ll.launch_id from public.lead_launches ll where ll.lead_id = l.id and ll.califica order by ll.created_at desc limit 1),
    'sdr',
    case when r.id is null then 'Asignado a Felipe Molina (leads calificados)'
         else 'Reasignado de ' || r.name || ' a Felipe Molina (leads calificados)' end,
    jsonb_build_object('sdr_id', fel, 'from_sdr_id', l.sdr_id), 'Admin'
  from public.leads l left join public.sales_reps r on r.id = l.sdr_id
  where l.sdr_id is distinct from fel
    and exists (select 1 from public.lead_launches ll where ll.lead_id = l.id and ll.califica);

  update public.leads l set sdr_id = fel, updated_at = now()
  where l.sdr_id is distinct from fel
    and exists (select 1 from public.lead_launches ll where ll.lead_id = l.id and ll.califica);
end $$;
