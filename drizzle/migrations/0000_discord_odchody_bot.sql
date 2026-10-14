CREATE TABLE public.bot_settings (
  id integer PRIMARY KEY DEFAULT 1,
  guild_id text,
  channel_id text,
  channel_name text,
  enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT single_row CHECK (id = 1)
);

CREATE TABLE public.seen_departures (
  account_id bigint PRIMARY KEY,
  nickname text NOT NULL,
  clan_abbrev text,
  clan_name text,
  role text,
  wn8 numeric,
  first_seen_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.bot_settings TO service_role;
GRANT ALL ON public.seen_departures TO service_role;

ALTER TABLE public.bot_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seen_departures ENABLE ROW LEVEL SECURITY;