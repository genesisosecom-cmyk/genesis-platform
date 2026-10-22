-- Canal de Discord que el alumno indica en el formulario Pre-clase.
alter table public.form_responses add column discord_channel text;
create index form_responses_discord_idx on public.form_responses (lower(discord_channel));
create index clients_discord_idx on public.clients (lower(discord_channel));
