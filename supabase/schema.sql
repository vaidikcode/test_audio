-- Music compare: prompt (PK) -> providers -> audio_samples
-- Run in Supabase SQL editor after creating a project.

create table if not exists public.prompts (
  prompt_text text primary key,
  created_at timestamptz not null default now()
);

create table if not exists public.providers (
  id uuid primary key default gen_random_uuid(),
  prompt_text text not null references public.prompts (prompt_text) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  unique (prompt_text, name)
);

create table if not exists public.audio_samples (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.providers (id) on delete cascade,
  label text not null default '',
  storage_path text not null,
  created_at timestamptz not null default now()
);

create index if not exists audio_samples_provider_id_idx on public.audio_samples (provider_id);

alter table public.prompts enable row level security;
alter table public.providers enable row level security;
alter table public.audio_samples enable row level security;

-- Development-friendly policies (tighten for production)
drop policy if exists "prompts_all" on public.prompts;
drop policy if exists "providers_all" on public.providers;
drop policy if exists "audio_samples_all" on public.audio_samples;
create policy "prompts_all" on public.prompts for all using (true) with check (true);
create policy "providers_all" on public.providers for all using (true) with check (true);
create policy "audio_samples_all" on public.audio_samples for all using (true) with check (true);

-- Storage: create bucket "music-samples" as public in Dashboard, or:
insert into storage.buckets (id, name, public)
values ('music-samples', 'music-samples', true)
on conflict (id) do nothing;

drop policy if exists "music_samples_select" on storage.objects;
drop policy if exists "music_samples_insert" on storage.objects;
drop policy if exists "music_samples_update" on storage.objects;
drop policy if exists "music_samples_delete" on storage.objects;

create policy "music_samples_select"
on storage.objects for select
using (bucket_id = 'music-samples');

create policy "music_samples_insert"
on storage.objects for insert
with check (bucket_id = 'music-samples');

create policy "music_samples_update"
on storage.objects for update
using (bucket_id = 'music-samples');

create policy "music_samples_delete"
on storage.objects for delete
using (bucket_id = 'music-samples');
