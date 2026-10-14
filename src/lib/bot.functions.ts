import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/discord";

async function discordGet(path: string) {
  const LOVABLE_API_KEY = process.env["LOVABLE_API_KEY"];
  const DISCORD_API_KEY = process.env["DISCORD_API_KEY"];
  if (!LOVABLE_API_KEY || !DISCORD_API_KEY) {
    throw new Error("Discord pripojenie nie je nakonfigurované");
  }
  const res = await fetch(`${GATEWAY_URL}${path}`, {
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "X-Connection-Api-Key": DISCORD_API_KEY,
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Discord API chyba [${res.status}]: ${body}`);
  }
  return res.json();
}

export const listGuilds = createServerFn({ method: "GET" }).handler(async () => {
  const guilds = (await discordGet("/users/@me/guilds?limit=200")) as Array<{
    id: string;
    name: string;
  }>;
  return guilds.map((g) => ({ id: g.id, name: g.name }));
});

export const listChannels = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ guildId: z.string() }).parse(input))
  .handler(async ({ data }) => {
    const channels = (await discordGet(
      `/guilds/${data.guildId}/channels`,
    )) as Array<{ id: string; name: string; type: number }>;
    // type 0 = text channel
    return channels
      .filter((c) => c.type === 0)
      .map((c) => ({ id: c.id, name: c.name }));
  });

export const saveBotSettings = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z
      .object({
        guildId: z.string(),
        channelId: z.string(),
        channelName: z.string(),
        enabled: z.boolean(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("bot_settings").upsert({
      id: 1,
      guild_id: data.guildId,
      channel_id: data.channelId,
      channel_name: data.channelName,
      enabled: data.enabled,
      updated_at: new Date().toISOString(),
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getBotStatus = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: settings } = await supabaseAdmin
    .from("bot_settings")
    .select("*")
    .eq("id", 1)
    .maybeSingle();
  const { count } = await supabaseAdmin
    .from("seen_departures")
    .select("account_id", { count: "exact", head: true });
  const { data: recent } = await supabaseAdmin
    .from("seen_departures")
    .select("nickname, clan_abbrev, role, wn8, first_seen_at")
    .order("first_seen_at", { ascending: false })
    .limit(15);
  return {
    settings: settings
      ? {
          channelId: settings.channel_id,
          channelName: settings.channel_name,
          enabled: settings.enabled,
          updatedAt: settings.updated_at,
        }
      : null,
    seenCount: count ?? 0,
    recent: recent ?? [],
  };
});

export const runCheckNow = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z.object({ force: z.boolean().optional() }).parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    const { runDepartureCheck } = await import("@/lib/odchody.server");
    return runDepartureCheck({ force: data.force ?? false });
  });

export const sendTestOverview = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z.object({ channelId: z.string().min(1) }).parse(input),
  )
  .handler(async ({ data }) => {
    const { fetchDepartures, formatDeparture, postDiscordMessage, passesWn8Filter, MIN_WN8 } =
      await import("@/lib/odchody.server");
    const players = (await fetchDepartures()).filter(passesWn8Filter);
    let chunk = `📋 **Test — aktuálne odchody z klanov (FPCSTAT)** — ${players.length} hráčov s WN8 nad ${MIN_WN8}:`;
    for (const p of players) {
      const line = "\n" + formatDeparture(p);
      if (chunk.length + line.length > 1900) {
        await postDiscordMessage(data.channelId, chunk);
        chunk = "…pokračovanie:" + line;
      } else {
        chunk += line;
      }
    }
    await postDiscordMessage(data.channelId, chunk);
    return { ok: true, total: players.length, sent: players.length };
  });

// Sends only the tail of the FPCSTAT list (default: last 5 players) so the
// tomato.gg profile links can be checked quickly without a full dump.
export const sendRecentSample = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z
      .object({
        channelId: z.string().min(1).optional(),
        limit: z.number().int().min(1).max(50).optional(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    const { data: settings } = await supabaseAdmin
      .from("bot_settings")
      .select("channel_id, channel_name")
      .eq("id", 1)
      .maybeSingle();

    const channelId = data.channelId ?? settings?.channel_id;
    if (!channelId) throw new Error("Nie je vybraná žiadna roomka.");

    const { fetchDepartures, formatDeparture, postDiscordMessage, passesWn8Filter } =
      await import("@/lib/odchody.server");
    const players = (await fetchDepartures()).filter(passesWn8Filter);
    const sample = players.slice(-(data.limit ?? 5));

    let chunk = `🧪 **Test odkazov — posledných ${sample.length} hráčov zo zoznamu (FPCSTAT)**`;
    for (const p of sample) chunk += "\n" + formatDeparture(p);
    await postDiscordMessage(channelId, chunk);

    return {
      ok: true,
      total: players.length,
      sent: sample.length,
      channelName: settings?.channel_name ?? null,
    };
  });
