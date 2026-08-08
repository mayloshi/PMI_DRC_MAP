create table if not exists public.pmi_drc_map_clicks (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  email text not null,
  pmi_id text not null,
  status text not null check (status in ('Membre', 'Volontaire', 'Les deux')),
  zone_type text not null check (zone_type in ('Province', 'Continent')),
  zone_name text not null,
  member_count integer not null default 0,
  volunteer_count integer not null default 0
);

create unique index if not exists pmi_drc_map_clicks_email_unique
  on public.pmi_drc_map_clicks (lower(email));

create unique index if not exists pmi_drc_map_clicks_pmi_id_unique
  on public.pmi_drc_map_clicks (upper(regexp_replace(pmi_id, '\s+', '', 'g')));

alter table public.pmi_drc_map_clicks enable row level security;

drop policy if exists "Public read clicks" on public.pmi_drc_map_clicks;
create policy "Public read clicks"
  on public.pmi_drc_map_clicks
  for select
  using (true);

drop policy if exists "Public insert clicks" on public.pmi_drc_map_clicks;
create policy "Public insert clicks"
  on public.pmi_drc_map_clicks
  for insert
  with check (
    email <> ''
    and pmi_id <> ''
    and status in ('Membre', 'Volontaire', 'Les deux')
    and zone_type in ('Province', 'Continent')
    and zone_name <> ''
  );

drop policy if exists "Public delete clicks" on public.pmi_drc_map_clicks;
create policy "Public delete clicks"
  on public.pmi_drc_map_clicks
  for delete
  using (true);

-- Pour une vraie securite admin, les suppressions/remises a zero doivent passer
-- par une Edge Function protegee cote serveur, pas par le mot de passe visible
-- dans la page HTML locale.
