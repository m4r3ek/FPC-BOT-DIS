// Server-only helpers for the FPCSTAT departures Discord bot.
// Never import this file from client code.

export interface DeparturePlayer {
  account_id: number;
  nickname: string;
  abbreviation: string | null;
  name: string | null;
  role: string | null;
  wn8: number | null;
}

const FPCSTAT_URL = "https://fpcstat.cz/api/odchody/players";
// Only players with WN8 above this threshold are posted to Discord.
export const MIN_WN8 = 1100;
export const passesWn8Filter = (p: DeparturePlayer): boolean =>
  p.wn8 != null && p.wn8 > MIN_WN8;
const GATEWAY_URL = "https://connector-gateway.lovable.dev/discord";

const FPCSTAT_HEADERS = {
  Accept: "application/json",
  // Cloudflare in front of FPCSTAT answers 520 to requests that carry no
  // User-Agent, which is what the edge runtime sends by default.
  "User-Agent": "FPCSTAT-Discord-Bot/1.0 (+https://fpcstat-discord-buddy.lovable.app)",
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function fetchDepartures(): Promise<DeparturePlayer[]> {
  let lastError = "FPCSTAT API unreachable";
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(FPCSTAT_URL, { headers: FPCSTAT_HEADERS });
      if (res.ok) {
        const data = (await res.json()) as DeparturePlayer[];
        return Array.isArray(data) ? data : [];
      }
      lastError = `FPCSTAT API failed: ${res.status}`;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
    if (attempt < 3) await sleep(1500 * attempt);
  }
  throw new Error(lastError);
}

export async function postDiscordMessage(
  channelId: string,
  content: string,
): Promise<void> {
  const LOVABLE_API_KEY = process.env["LOVABLE_API_KEY"];
  const DISCORD_API_KEY = process.env["DISCORD_API_KEY"];
  if (!LOVABLE_API_KEY || !DISCORD_API_KEY) {
    throw new Error("Discord connection is not configured");
  }
  const res = await fetch(`${GATEWAY_URL}/channels/${channelId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "X-Connection-Api-Key": DISCORD_API_KEY,
      "Content-Type": "application/json",
    },
    // flags 4 = SUPPRESS_EMBEDS: Discord must not render link previews of the
    // tomato.gg profile pages, only the clickable names in the message text.
    body: JSON.stringify({ content: content.slice(0, 2000), flags: 4 }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Discord message failed: ${res.status} ${body}`);
  }
}

export function formatDeparture(p: DeparturePlayer): string {
  const clan = p.abbreviation ? `[${p.abbreviation}] ${p.name ?? ""}`.trim() : "bez klanu";
  const wn8 = p.wn8 != null ? Math.round(p.wn8) : "?";
  const tomatoUrl = `https://tomato.gg/stats/EU/${encodeURIComponent(p.nickname)}=${p.account_id}`;
  return `• **[${p.nickname}](${tomatoUrl})** — ${clan} (${p.role ?? "?"}, WN8: ${wn8})`;
}

export interface CheckResult {
  total: number;
  newCount: number;
  posted: boolean;
  message?: string | undefined;
}

export async function runDepartureCheck(opts: {
  force?: boolean;
  hourlyStatus?: boolean;
}): Promise<CheckResult> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: settings } = await supabaseAdmin
    .from("bot_settings")
    .select("*")
    .eq("id", 1)
    .maybeSingle();

  const players = await fetchDepartures();

  const { data: seenRows } = await supabaseAdmin
    .from("seen_departures")
    .select("account_id");
  const seen = new Set((seenRows ?? []).map((r) => Number(r.account_id)));

  const fresh = players.filter((p) => !seen.has(p.account_id));

  if (fresh.length === 0 && !opts.force) {
    if (opts.hourlyStatus && settings?.enabled && settings.channel_id) {
      await postDiscordMessage(
        settings.channel_id,
        `✅ **Kontrola odchodov (FPCSTAT)** — žiadne nové odchody. Sleduje sa ${players.length} hráčov.`,
      );
      return { total: players.length, newCount: 0, posted: true };
    }
    return { total: players.length, newCount: 0, posted: false };
  }

  const toPost = (opts.force && fresh.length === 0 ? players : fresh).filter(
    passesWn8Filter,
  );

  let posted = false;
  let message: string | undefined;

  if (settings?.enabled && settings.channel_id && toPost.length > 0) {
    const header = opts.force
      ? `📋 **Aktuálne odchody z klanov (FPCSTAT)** — celkovo ${players.length} hráčov:`
      : `🚨 **Nové odchody z klanov (FPCSTAT)** — ${toPost.length} nových hráčov:`;
    // Split into chunks that fit Discord's 2000 char limit
    let chunk = header;
    for (const p of toPost) {
      const line = "\n" + formatDeparture(p);
      if (chunk.length + line.length > 1900) {
        await postDiscordMessage(settings.channel_id, chunk);
        chunk = "…pokračovanie:" + line;
      } else {
        chunk += line;
      }
    }
    await postDiscordMessage(settings.channel_id, chunk);
    posted = true;
    message = chunk;
  }

  if (fresh.length > 0) {
    await supabaseAdmin.from("seen_departures").upsert(
      fresh.map((p) => ({
        account_id: p.account_id,
        nickname: p.nickname,
        clan_abbrev: p.abbreviation,
        clan_name: p.name,
        role: p.role,
        wn8: p.wn8,
      })),
      { onConflict: "account_id" },
    );
  }

  return { total: players.length, newCount: fresh.length, posted, message };
}
