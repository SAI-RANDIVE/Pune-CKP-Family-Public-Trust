-- 013: family groups, profile pictures, the meetings register, event messages
-- and map links, polls, suggestions and feedback, and the greetings log.
-- Idempotent: safe to run more than once.

-- ---------------------------------------------------------------------------
-- 1. Families. One row per pair of people, written once (person -> relative);
--    the reverse is derived when shown. A link counts only after the relative
--    has confirmed it with a code sent to THEIR e-mail address, or after a
--    trustee has confirmed it at the trust desk.
-- ---------------------------------------------------------------------------
create table if not exists family_links (
  id            uuid primary key default gen_random_uuid(),
  person_id     uuid not null references people(id) on delete cascade,
  relative_id   uuid not null references people(id) on delete cascade,
  relation      text not null check (relation in ('spouse', 'child', 'parent', 'sibling', 'other')),
  status        text not null default 'pending' check (status in ('pending', 'confirmed')),
  code_hash     text,
  code_expires  timestamptz,
  attempts      integer not null default 0,
  confirmed_by  text check (confirmed_by in ('code', 'trust')),
  created_by_admin uuid references admin_users(id) on delete set null,
  created_at    timestamptz not null default now(),
  confirmed_at  timestamptz,
  check (person_id <> relative_id)
);
-- One link per pair, whichever of the two created it.
create unique index if not exists family_links_pair_uidx
  on family_links (least(person_id, relative_id), greatest(person_id, relative_id));
create index if not exists family_links_relative_idx on family_links (relative_id);

-- ---------------------------------------------------------------------------
-- 2. Profile pictures (one per person, replaced on upload).
-- ---------------------------------------------------------------------------
create table if not exists person_photos (
  person_id   uuid primary key references people(id) on delete cascade,
  mime        text not null,
  size_bytes  integer not null,
  content     bytea not null,
  updated_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 3. Meetings register: what was discussed and decided, and who was there.
-- ---------------------------------------------------------------------------
create table if not exists meetings (
  id            uuid primary key default gen_random_uuid(),
  code          text unique,
  kind          text not null default 'trustees' check (kind in ('trustees', 'committee', 'agm', 'general', 'other')),
  title         text not null,
  held_on       date not null,
  fy            text references fiscal_years(label),
  time_text     text,
  venue         text,
  chaired_by    text,
  attendees     text,
  agenda        text,
  minutes       text,
  decisions     text,
  next_meeting_on date,
  created_by    uuid references admin_users(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);
create index if not exists meetings_held_idx on meetings (held_on desc);

-- Things a meeting decided someone should do.
create table if not exists meeting_actions (
  id          uuid primary key default gen_random_uuid(),
  meeting_id  uuid not null references meetings(id) on delete cascade,
  task        text not null,
  owner       text,
  due_on      date,
  done        boolean not null default false,
  done_at     timestamptz,
  sort_order  integer not null default 0
);
create index if not exists meeting_actions_meeting_idx on meeting_actions (meeting_id, sort_order);

-- ---------------------------------------------------------------------------
-- 4. Events: a map link, and messages sent to those who registered.
-- ---------------------------------------------------------------------------
alter table events add column if not exists map_url text;

create table if not exists event_messages (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid not null references events(id) on delete cascade,
  channel     text not null check (channel in ('email', 'whatsapp')),
  subject     text,
  body        text not null,
  recipients  integer not null default 0,
  sent        integer not null default 0,
  failed      integer not null default 0,
  created_by  uuid references admin_users(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists event_messages_event_idx on event_messages (event_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 5. Polls with a closing time; one vote per member.
-- ---------------------------------------------------------------------------
create table if not exists polls (
  id            uuid primary key default gen_random_uuid(),
  code          text unique,
  question      text not null,
  description   text,
  options       jsonb not null,                 -- ["Option one", "Option two", ...]
  opens_at      timestamptz not null default now(),
  closes_at     timestamptz not null,
  is_published  boolean not null default false,
  show_results  text not null default 'after_vote' check (show_results in ('always', 'after_vote', 'after_close')),
  created_by    uuid references admin_users(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);

create table if not exists poll_votes (
  poll_id      uuid not null references polls(id) on delete cascade,
  person_id    uuid not null references people(id) on delete cascade,
  option_index integer not null check (option_index >= 0),
  voted_at     timestamptz not null default now(),
  primary key (poll_id, person_id)
);

-- ---------------------------------------------------------------------------
-- 6. Suggestions and feedback from members and visitors.
-- ---------------------------------------------------------------------------
create table if not exists feedback (
  id          uuid primary key default gen_random_uuid(),
  code        text unique,
  kind        text not null default 'suggestion' check (kind in ('suggestion', 'feedback', 'complaint', 'appreciation')),
  person_id   uuid references people(id) on delete set null,
  name        text,
  contact     text,
  message     text not null,
  status      text not null default 'new' check (status in ('new', 'noted', 'in_progress', 'done')),
  reply       text,
  replied_by  uuid references admin_users(id) on delete set null,
  replied_at  timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists feedback_status_idx on feedback (status, created_at desc);

-- ---------------------------------------------------------------------------
-- 7. Birthday and anniversary greetings: one per person, kind and year, so the
--    daily job can run twice without greeting anyone twice.
-- ---------------------------------------------------------------------------
create table if not exists greeting_log (
  person_id  uuid not null references people(id) on delete cascade,
  kind       text not null check (kind in ('birthday', 'anniversary')),
  year       integer not null,
  status     text not null default 'sent' check (status in ('sent', 'failed')),
  sent_at    timestamptz not null default now(),
  primary key (person_id, kind, year)
);
