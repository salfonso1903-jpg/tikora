-- TIKORA video suite: hashtags, trends, remixes and WebRTC live rooms.
-- Additive only; existing tables and policies are not modified.
create table if not exists public.video_hashtags (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  tag text not null check (tag ~ '^[a-zA-Z0-9_]{1,40}$'),
  created_at timestamptz not null default now(),
  unique(post_id,tag)
);
create index if not exists video_hashtags_tag_idx on public.video_hashtags(lower(tag));
create index if not exists video_hashtags_created_idx on public.video_hashtags(created_at desc);
alter table public.video_hashtags enable row level security;
drop policy if exists "Hashtags readable by authenticated" on public.video_hashtags;
create policy "Hashtags readable by authenticated" on public.video_hashtags for select to authenticated using (true);
drop policy if exists "Authors manage hashtags on own posts" on public.video_hashtags;
create policy "Authors manage hashtags on own posts" on public.video_hashtags for all to authenticated
using (exists(select 1 from public.posts p where p.id=post_id and p.user_id=auth.uid()))
with check (exists(select 1 from public.posts p where p.id=post_id and p.user_id=auth.uid()));

create table if not exists public.video_remixes (
 id uuid primary key default gen_random_uuid(),
 creator_id uuid not null references auth.users(id) on delete cascade,
 source_post_id uuid not null references public.posts(id) on delete cascade,
 remix_post_id uuid not null references public.posts(id) on delete cascade,
 remix_type text not null check(remix_type in ('duet','stitch')),
 created_at timestamptz not null default now(),
 unique(remix_post_id)
);
alter table public.video_remixes enable row level security;
drop policy if exists "Remixes visible to authenticated" on public.video_remixes;
create policy "Remixes visible to authenticated" on public.video_remixes for select to authenticated using(true);
drop policy if exists "Users create own remixes" on public.video_remixes;
create policy "Users create own remixes" on public.video_remixes for insert to authenticated with check(auth.uid()=creator_id);
drop policy if exists "Users delete own remixes" on public.video_remixes;
create policy "Users delete own remixes" on public.video_remixes for delete to authenticated using(auth.uid()=creator_id);

create table if not exists public.live_rooms (
 id uuid primary key default gen_random_uuid(),
 host_id uuid not null references auth.users(id) on delete cascade,
 title text not null default 'Canlı yayın',
 status text not null default 'live' check(status in ('live','ended')),
 created_at timestamptz not null default now(),
 ended_at timestamptz
);
alter table public.live_rooms enable row level security;
drop policy if exists "Live rooms readable by authenticated" on public.live_rooms;
create policy "Live rooms readable by authenticated" on public.live_rooms for select to authenticated using(true);
drop policy if exists "Hosts create own rooms" on public.live_rooms;
create policy "Hosts create own rooms" on public.live_rooms for insert to authenticated with check(auth.uid()=host_id);
drop policy if exists "Hosts update own rooms" on public.live_rooms;
create policy "Hosts update own rooms" on public.live_rooms for update to authenticated using(auth.uid()=host_id) with check(auth.uid()=host_id);

create table if not exists public.live_participants (
 room_id uuid not null references public.live_rooms(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 role text not null default 'viewer' check(role in ('host','viewer')),
 joined_at timestamptz not null default now(),
 primary key(room_id,user_id)
);
alter table public.live_participants enable row level security;
drop policy if exists "Live participants readable" on public.live_participants;
create policy "Live participants readable" on public.live_participants for select to authenticated using(true);
drop policy if exists "Users join live rooms" on public.live_participants;
create policy "Users join live rooms" on public.live_participants for insert to authenticated with check(auth.uid()=user_id);
drop policy if exists "Users leave live rooms" on public.live_participants;
create policy "Users leave live rooms" on public.live_participants for delete to authenticated using(auth.uid()=user_id);

create table if not exists public.live_signals (
 id bigint generated always as identity primary key,
 room_id uuid not null references public.live_rooms(id) on delete cascade,
 sender_id uuid not null references auth.users(id) on delete cascade,
 receiver_id uuid references auth.users(id) on delete cascade,
 signal jsonb not null,
 created_at timestamptz not null default now()
);
create index if not exists live_signals_room_created_idx on public.live_signals(room_id,created_at);
alter table public.live_signals enable row level security;
drop policy if exists "Participants read live signals" on public.live_signals;
create policy "Participants read live signals" on public.live_signals for select to authenticated using (
 auth.uid()=sender_id or auth.uid()=receiver_id or exists(select 1 from public.live_participants p where p.room_id=live_signals.room_id and p.user_id=auth.uid())
);
drop policy if exists "Participants send live signals" on public.live_signals;
create policy "Participants send live signals" on public.live_signals for insert to authenticated with check (
 auth.uid()=sender_id and exists(select 1 from public.live_participants p where p.room_id=live_signals.room_id and p.user_id=auth.uid())
);
