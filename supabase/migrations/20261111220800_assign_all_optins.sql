-- =====================================================================
-- Reparto: todos los optins reciben SDR al registrarse (antes, solo los calificados;
-- el resto esperaba a aplicar). Se sigue usando la ronda entre los SDR activos según
-- su peso: con una sola SDR activa, recibe el 100%.
-- crm_distribute («Repartir los sin asignar» del admin) sigue la misma regla.
-- El resto de ingest_optin no cambia.
-- =====================================================================

create or replace function public.ingest_optin(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  e text := private.norm_email(p ->> 'email');
  ph text := private.norm_phone(p ->> 'telefono');
  nombre text := trim(coalesce(p ->> 'nombre', ''));
  launch text := private.current_launch();
  t jsonb := case when jsonb_typeof(p -> 'tracking') = 'object' then p -> 'tracking' else '{}'::jsonb end;
  inv text := nullif(trim(coalesce(p ->> 'inversion_meta', '')), '');
  cal boolean := private.califica(inv, p ->> 'califica');
  variante text := coalesce(nullif(p ->> 'variant', ''), nullif(t ->> 'ab', ''));
  fuente text := private.lead_source(t);
  v_lead uuid;
  v_existed boolean;
  prev_count int;
begin
  if e is null and ph is null then
    return jsonb_build_object('ok', false, 'error', 'Falta email y teléfono');
  end if;

  select u.lead_id, u.existed into v_lead, v_existed from private.upsert_lead(e, ph, nombre, false) u;
  if v_existed then
    perform private.merge_contact(v_lead, launch, e, ph, 'Optin');
  end if;

  select optin_count into prev_count from public.lead_launches where lead_id = v_lead and launch_id = launch;

  insert into public.lead_launches as ll (lead_id, launch_id, optin_at, optin_count, inversion_meta, califica, variant, tracking, source)
  values (v_lead, launch, now(), 1, inv, cal, variante, t, fuente)
  on conflict (lead_id, launch_id) do update set
    optin_at = coalesce(ll.optin_at, excluded.optin_at),
    optin_count = ll.optin_count + 1,
    inversion_meta = coalesce(excluded.inversion_meta, ll.inversion_meta),
    califica = coalesce(excluded.califica, ll.califica),
    variant = case when ll.optin_at is null then excluded.variant else ll.variant end,
    tracking = case when ll.optin_at is null then excluded.tracking else ll.tracking end,
    source = case when ll.optin_at is null then excluded.source else ll.source end,
    updated_at = now();

  insert into public.lead_events (lead_id, launch_id, kind, summary, data)
  values (
    v_lead, launch,
    case when coalesce(prev_count, 0) > 0 then 'optin_repetido' else 'optin' end,
    case when coalesce(prev_count, 0) > 0 then 'Se registró de nuevo en la landing' else 'Se registró en la landing' end
      || ' · ' || coalesce(inv, 'sin inversión') || ' · ' || case when cal then 'califica' when not cal then 'no califica' else 'califica ?' end
      || ' · versión ' || coalesce(variante, '—') || ' · ' || fuente,
    jsonb_build_object('nombre', nombre, 'email', e, 'telefono', ph, 'inversion_meta', inv, 'califica', cal,
      'califica_enviado', p -> 'califica', 'variant', variante, 'tracking', t, 'source', fuente)
  );

  -- Todos los optins reciben SDR (si ya tenía, assign_sdr lo deja como estaba).
  if private.auto_assign_enabled() then
    perform private.assign_sdr(v_lead, launch, case when cal then 'optin calificado' else 'optin' end);
  end if;

  perform private.apply_pending(v_lead, e, ph);

  return jsonb_build_object('ok', true, 'id', v_lead, 'repetido', v_existed);
end;
$function$;

create or replace function public.crm_distribute(p_launch text, p_from_rep uuid default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_lead uuid;
  n int := 0;
  motivo text := case when p_from_rep is null then 'reparto de leads sin asignar' else 'reparto por baja de SDR' end;
begin
  if not private.is_superadmin() then raise exception 'Solo el admin puede repartir leads'; end if;
  if not exists (select 1 from public.sales_reps where sdr_status = 'activo') then
    raise exception 'No hay SDR activos';
  end if;
  for v_lead in
    select l.id from public.leads l
    where (
      -- Sin SDR: todos los que se registraron o aplicaron en el lanzamiento (menos los «No cuentan»)
      p_from_rep is null and l.sdr_id is null and exists (
        select 1 from public.lead_launches ll where ll.lead_id = l.id and ll.launch_id = p_launch
          and ll.no_cuenta_reason is null
          and (ll.optin_at is not null or (ll.applied_at is not null and ll.route = 'aplicado'))
      )
    ) or (
      p_from_rep is not null and l.sdr_id = p_from_rep and not exists (
        select 1 from public.lead_launches ll where ll.lead_id = l.id
          and ll.post_class_status in ('Cliente · falta onboarding', 'Cliente')
      )
    )
    order by l.created_at
  loop
    if p_from_rep is not null then
      update public.leads set sdr_id = null where id = v_lead;
    end if;
    perform private.assign_sdr(v_lead, coalesce(p_launch, private.current_launch()), motivo);
    n := n + 1;
  end loop;
  return n;
end;
$function$;
