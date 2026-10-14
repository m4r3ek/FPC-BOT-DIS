import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import {
  getBotStatus,
  listChannels,
  listGuilds,
  runCheckNow,
  saveBotSettings,
  sendRecentSample,
  sendTestOverview,
} from "@/lib/bot.functions";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "FPCSTAT Discord Bot – Odchody z klanov" },
      {
        name: "description",
        content:
          "Discord bot, ktorý každú hodinu sleduje odchody hráčov z klanov na FPCSTAT a posiela novinky do vašej Discord roomky.",
      },
      { property: "og:title", content: "FPCSTAT Discord Bot – Odchody z klanov" },
      {
        property: "og:description",
        content:
          "Automatické upozornenia na nové odchody hráčov z klanov priamo do Discordu.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Index,
});

interface Guild {
  id: string;
  name: string;
}
interface Channel {
  id: string;
  name: string;
}
interface Status {
  settings: {
    channelId: string | null;
    channelName: string | null;
    enabled: boolean;
    updatedAt: string;
  } | null;
  seenCount: number;
  recent: Array<{
    nickname: string;
    clan_abbrev: string | null;
    role: string | null;
    wn8: number | null;
    first_seen_at: string;
  }>;
}

function Index() {
  const fetchGuilds = useServerFn(listGuilds);
  const fetchChannels = useServerFn(listChannels);
  const fetchStatus = useServerFn(getBotStatus);
  const saveSettings = useServerFn(saveBotSettings);
  const runCheck = useServerFn(runCheckNow);
  const sendTest = useServerFn(sendTestOverview);
  const sendSample = useServerFn(sendRecentSample);

  const [guilds, setGuilds] = useState<Guild[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [guildId, setGuildId] = useState("");
  const [channelId, setChannelId] = useState("");
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchGuilds()
      .then(setGuilds)
      .catch((e) => setError(String(e?.message ?? e)));
    fetchStatus()
      .then(setStatus)
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!guildId) {
      setChannels([]);
      return;
    }
    fetchChannels({ data: { guildId } })
      .then(setChannels)
      .catch((e) => setError(String(e?.message ?? e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guildId]);

  async function handleSave() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const channel = channels.find((c) => c.id === channelId);
      await saveSettings({
        data: {
          guildId,
          channelId,
          channelName: channel?.name ?? "",
          enabled: true,
        },
      });
      setNotice("Nastavenie uložené. Bot je aktívny.");
      setStatus(await fetchStatus());
    } catch (e) {
      setError(String((e as Error)?.message ?? e));
    } finally {
      setBusy(false);
    }
  }

  async function handleCheck(force: boolean) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await runCheck({ data: { force } });
      setNotice(
        result.posted
          ? `Hotovo — odoslaných ${result.newCount || "aktuálnych"} odchodov do Discordu.`
          : `Skontrolované (${result.total} hráčov), žiadne nové odchody.`,
      );
      setStatus(await fetchStatus());
    } catch (e) {
      setError(String((e as Error)?.message ?? e));
    } finally {
      setBusy(false);
    }
  }

  async function handleSample() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await sendSample({
        data: { channelId: channelId || undefined, limit: 5 },
      });
      setNotice(
        `Poslaných posledných ${result.sent} hráčov z ${result.total} — ` +
          (result.channelName
            ? `# ${result.channelName}`
            : "vybranej roomky") +
          ". Skontroluj, či majú mená klikateľné odkazy.",
      );
    } catch (e) {
      setError(String((e as Error)?.message ?? e));
    } finally {
      setBusy(false);
    }
  }

  async function handleTest() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const channel = channels.find((c) => c.id === channelId);
      const result = await sendTest({ data: { channelId } });
      setNotice(
        `Testovacia správa odoslaná do # ${channel?.name ?? "roomky"} — ${result.sent} z ${result.total} hráčov. Skontroluj Discord.`,
      );
    } catch (e) {
      setError(String((e as Error)?.message ?? e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-3xl px-4 py-10">
        <header className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight">
            FPCSTAT Discord Bot
          </h1>
          <p className="mt-2 text-muted-foreground">
            Každú hodinu kontroluje odchody hráčov z klanov na{" "}
            <a
              href="https://fpcstat.cz/odchody"
              target="_blank"
              rel="noreferrer"
              className="text-primary underline"
            >
              fpcstat.cz/odchody
            </a>{" "}
            a novinky posiela do vašej Discord roomky.
          </p>
        </header>

        {error && (
          <div className="mb-4 rounded-lg border border-destructive bg-destructive/10 px-4 py-3 text-sm text-destructive-foreground">
            {error}
          </div>
        )}
        {notice && (
          <div className="mb-4 rounded-lg border border-border bg-secondary px-4 py-3 text-sm text-secondary-foreground">
            {notice}
          </div>
        )}

        <section className="mb-6 rounded-xl border border-border bg-card p-6">
          <h2 className="mb-4 text-lg font-semibold text-card-foreground">
            Nastavenie Discord roomky
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-sm text-muted-foreground">
                Server
              </span>
              <select
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={guildId}
                onChange={(e) => {
                  setGuildId(e.target.value);
                  setChannelId("");
                }}
              >
                <option value="">— vyberte server —</option>
                {guilds.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-sm text-muted-foreground">
                Roomka (kanál)
              </span>
              <select
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={channelId}
                onChange={(e) => setChannelId(e.target.value)}
                disabled={!guildId}
              >
                <option value="">— vyberte kanál —</option>
                {channels.map((c) => (
                  <option key={c.id} value={c.id}>
                    # {c.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              onClick={handleSave}
              disabled={busy || !channelId}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
            >
              Uložiť nastavenie
            </button>
            <button
              onClick={() => handleCheck(false)}
              disabled={busy}
              className="rounded-md border border-input bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-accent disabled:opacity-50"
            >
              Skontrolovať teraz
            </button>
            <button
              onClick={() => handleCheck(true)}
              disabled={busy}
              className="rounded-md border border-input bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-accent disabled:opacity-50"
            >
              Poslať aktuálny prehľad
            </button>
            <button
              onClick={handleTest}
              disabled={busy || !channelId}
              className="rounded-md border border-input bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-accent disabled:opacity-50"
            >
              Poslať test do vybranej roomky
            </button>
            <button
              onClick={handleSample}
              disabled={busy}
              className="rounded-md border border-input bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-accent disabled:opacity-50"
            >
              Poslať posledných 5
            </button>
          </div>
          {status?.settings?.channelName && (
            <p className="mt-3 text-sm text-muted-foreground">
              Aktívna roomka: <strong># {status.settings.channelName}</strong>{" "}
              {status.settings.enabled ? "(zapnuté)" : "(vypnuté)"}
            </p>
          )}
        </section>

        <section className="rounded-xl border border-border bg-card p-6">
          <h2 className="mb-1 text-lg font-semibold text-card-foreground">
            Posledné zaznamenané odchody
          </h2>
          <p className="mb-4 text-sm text-muted-foreground">
            Celkovo sledovaných: {status?.seenCount ?? 0} hráčov
          </p>
          <ul className="divide-y divide-border">
            {(status?.recent ?? []).map((r, i) => (
              <li key={i} className="flex items-center justify-between py-2 text-sm">
                <span>
                  <strong>{r.nickname}</strong>{" "}
                  <span className="text-muted-foreground">
                    {r.clan_abbrev ? `[${r.clan_abbrev}]` : "bez klanu"} ·{" "}
                    {r.role ?? "?"}
                  </span>
                </span>
                <span className="text-muted-foreground">
                  WN8 {r.wn8 != null ? Math.round(Number(r.wn8)) : "?"}
                </span>
              </li>
            ))}
            {(status?.recent ?? []).length === 0 && (
              <li className="py-4 text-sm text-muted-foreground">
                Zatiaľ žiadne záznamy — spustite prvú kontrolu.
              </li>
            )}
          </ul>
        </section>
      </div>
    </div>
  );
}
