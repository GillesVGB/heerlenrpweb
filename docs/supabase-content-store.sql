create table if not exists public.fantasy_roleplay_content (
  singleton smallint primary key check (singleton = 1),
  revision bigint not null,
  body jsonb not null
);

alter table public.fantasy_roleplay_content enable row level security;
grant usage on schema public to service_role;
grant all on table public.fantasy_roleplay_content to service_role;
