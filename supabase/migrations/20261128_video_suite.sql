-- TIKORA video suite: remixes and lightweight WebRTC live signaling.
-- Safe additive migration: does not alter existing posts, profiles, messages or storage.

create table if not exists public.video_remixes (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references auth.users(id) on delete cascade,
  source_post_id uuid not null references public.posts(id) on delete cascade,
  remix_post_id uuid not null references public.posts(id) on delete cascade,
  remix_type text not null check (remix_type in ('duet','stitch')),
  created_at timestamptz not null default now(),
  unique (remix_post_id)
);
alter table public.video_remixes enable row level security;
drop policy if exists "Remixes are visible to authenticated users" on public.video_remixes;
create policy "Remixes are visible to authenticated users"
  on public.video_remixes for select to authenticated using (true);
drop policy if exists "Users can create their own remixes" on public.video_remixes;
create policy "Users can create their own remixes"
  on public.video_remixes for insert to authenticated with check (auth.uid() = creator_id);
drop policy if exists "Users can delete their own remixes" on public.video_remixes;
create policy "Users can delete their own remixes"
  on public.video_remixes for delete to authenticated using (auth.uid() = creator_id);

create table if not exists public.live_rooms (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'Canlı yayın',
  status text not null default 'live' check (status in ('live','ended')),
  created_at timestamptz not null default now(),
  ended_at timestamptz
);
alter table public.live_rooms enable row level security;
drop policy if exists "Authenticated users can view live rooms" on public.live_rooms;
create policy "Authenticated users can view live rooms"
  on public.live_rooms for select to authenticated using (true);
drop policy if exists "Users can start their own live rooms" on public.live_rooms;
create policy "Users can start their own live rooms"
  on public.live_rooms for insert to authenticated with check (auth.uid() = host_id);
drop policy if exists "Hosts can update their own live rooms" on public.live_rooms;
create policy "Hosts can update their own live rooms"
  on public.live_rooms for update to authenticated using (auth.uid() = host_id) with check (auth.uid() = host_id);

create table if not exists public.live_participants (
  room_id uuid not null references public.live_rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'viewer' check (role in ('host','viewer')),
  joined_at timestamptz not null default now(),
  primary key (room_id,user_id)
);
alter table public.live_participants enable row level security;
drop policy if exists "Participants can view room participants" on public.live_participants;
create policy "Participants can view room participants"
  on public.live_participants for select to authenticated using (true);
drop policy if exists "Users can join live rooms" on public.live_participants;
create policy "Users can join live rooms"
  on public.live_participants for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "Users can leave live rooms" on public.live_participants;
create policy "Users can leave live rooms"
  on public.live_participants for delete to authenticated using (auth.uid() = user_id);

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
drop policy if exists "Participants can read their live signals" on public.live_signals;
create policy "Participants can read their live signals"
  on public.live_signals for select to authenticated
  using (
    auth.uid() = sender_id
    or auth.uid() = receiver_id
    or exists (
      select 1 from public.live_participants p
      where p.room_id = live_signals.room_id and p.user_id = auth.uid()
    )
  );
drop policy if exists "Participants can send live signals" on public.live_signals;
create policy "Participants can send live signals"
  on public.live_signals for insert to authenticated
  with check (
    auth.uid() = sender_id
    and exists (
      select 1 from public.live_participants p
      where p.room_id = live_signals.room_id and p.user_id = auth.uid()
    )
  );
