create extension if not exists pgcrypto;

create table if not exists public.pmi_drc_map_profiles (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  email text not null,
  pmi_id text not null,
  gender text check (gender in ('M', 'F') or gender is null),
  occupation_status text check (occupation_status in ('Etudiant', 'Professionnel') or occupation_status is null),
  member_active boolean not null default false,
  member_zone_name text,
  member_zone_type text check (member_zone_type in ('Province', 'Continent') or member_zone_type is null),
  member_updated_at timestamptz,
  volunteer_active boolean not null default false,
  volunteer_zone_name text,
  volunteer_zone_type text check (volunteer_zone_type in ('Province', 'Continent') or volunteer_zone_type is null),
  volunteer_updated_at timestamptz
);

create unique index if not exists pmi_drc_map_profiles_email_unique
  on public.pmi_drc_map_profiles (email);

create unique index if not exists pmi_drc_map_profiles_pmi_id_unique
  on public.pmi_drc_map_profiles (pmi_id);

create table if not exists public.pmi_drc_map_satisfaction (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  email text not null,
  pmi_id text not null,
  period text not null,
  rating integer not null check (rating between 1 and 5),
  comment text
);

create unique index if not exists pmi_drc_map_satisfaction_email_period_unique
  on public.pmi_drc_map_satisfaction (email, period);

create table if not exists public.pmi_drc_map_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  action text not null,
  email text,
  pmi_id text,
  details text,
  browser_location text,
  page text
);

alter table public.pmi_drc_map_profiles enable row level security;
alter table public.pmi_drc_map_satisfaction enable row level security;
alter table public.pmi_drc_map_logs enable row level security;

drop policy if exists "Public read profiles" on public.pmi_drc_map_profiles;
create policy "Public read profiles"
  on public.pmi_drc_map_profiles
  for select
  using (true);

drop policy if exists "Public insert profiles" on public.pmi_drc_map_profiles;
create policy "Public insert profiles"
  on public.pmi_drc_map_profiles
  for insert
  with check (email <> '' and pmi_id <> '');

drop policy if exists "Public update profiles" on public.pmi_drc_map_profiles;
create policy "Public update profiles"
  on public.pmi_drc_map_profiles
  for update
  using (true)
  with check (email <> '' and pmi_id <> '');

drop policy if exists "Public delete profiles" on public.pmi_drc_map_profiles;
create policy "Public delete profiles"
  on public.pmi_drc_map_profiles
  for delete
  using (true);

drop policy if exists "Public read satisfaction" on public.pmi_drc_map_satisfaction;
create policy "Public read satisfaction"
  on public.pmi_drc_map_satisfaction
  for select
  using (true);

drop policy if exists "Public insert satisfaction" on public.pmi_drc_map_satisfaction;
create policy "Public insert satisfaction"
  on public.pmi_drc_map_satisfaction
  for insert
  with check (email <> '' and pmi_id <> '' and rating between 1 and 5);

drop policy if exists "Public update satisfaction" on public.pmi_drc_map_satisfaction;
create policy "Public update satisfaction"
  on public.pmi_drc_map_satisfaction
  for update
  using (true)
  with check (email <> '' and pmi_id <> '' and rating between 1 and 5);

drop policy if exists "Public delete satisfaction" on public.pmi_drc_map_satisfaction;
create policy "Public delete satisfaction"
  on public.pmi_drc_map_satisfaction
  for delete
  using (true);

drop policy if exists "Public read logs" on public.pmi_drc_map_logs;
create policy "Public read logs"
  on public.pmi_drc_map_logs
  for select
  using (true);

drop policy if exists "Public insert logs" on public.pmi_drc_map_logs;
create policy "Public insert logs"
  on public.pmi_drc_map_logs
  for insert
  with check (action <> '');

-- Ces politiques sont ouvertes pour permettre au prototype statique GitHub Pages
-- de lire/ecrire/supprimer via la cle anon. Pour une version publique durable,
-- remplacer les actions admin par une Edge Function protegee cote serveur.
