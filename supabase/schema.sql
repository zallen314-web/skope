-- Skope: weekly / monthly portfolio reports
-- Paste this whole file into Supabase → SQL Editor → New query → Run.
-- Row-level security is ON and there are deliberately NO policies:
-- only the server (service-role key, used by the edge functions and the
-- GitHub report job) can read or write these tables. The browser never can.

create extension if not exists pgcrypto;

create table if not exists public.subscribers (
  id                 uuid primary key default gen_random_uuid(),
  email              text not null,
  frequency          text not null default 'weekly' check (frequency in ('weekly','monthly')),
  benchmark          text not null default 'SPY'    check (benchmark in ('SPY','QQQ','IWM')),
  holdings           jsonb not null,                -- [{"ticker":"AAPL","weight":25.0}, ...] weights in %
  confirmed          boolean not null default false,
  confirm_token      uuid not null default gen_random_uuid(),
  unsubscribe_token  uuid not null default gen_random_uuid(),
  created_at         timestamptz not null default now(),
  confirmed_at       timestamptz,
  last_sent_at       timestamptz
);

create unique index if not exists subscribers_email_key on public.subscribers (lower(email));
create index if not exists subscribers_confirmed_idx on public.subscribers (confirmed);

create table if not exists public.snapshots (
  id             bigint generated always as identity primary key,
  subscriber_id  uuid not null references public.subscribers(id) on delete cascade,
  created_at     timestamptz not null default now(),
  metrics        jsonb not null
);

create index if not exists snapshots_subscriber_idx on public.snapshots (subscriber_id, created_at desc);

alter table public.subscribers enable row level security;
alter table public.snapshots   enable row level security;
