-- Canal de Discord de cada cliente.
alter table public.clients add column discord_channel text;

-- Ejemplo de pregunta del formulario Pre-clase adaptado a ecommerce con suscripción.
update public.forms
set settings = jsonb_set(
  settings,
  '{question_example}',
  to_jsonb('Ej: Tengo una tienda de café de especialidad con suscripción mensual. Llevo 320 suscriptores activos con un ticket de $28, pero el churn subió del 6% al 11% en los últimos dos meses, sobre todo en el mes 2. Ya probé ofrecer un 15% de descuento cuando quieren cancelar, pero casi nadie lo toma. ¿Rearmo el onboarding del primer mes para reforzar el valor o paso a planes trimestrales prepagos?'::text)
)
where slug = 'pre-clase';
