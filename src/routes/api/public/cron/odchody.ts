import { createFileRoute } from "@tanstack/react-router";

// Hourly cron endpoint: checks FPCSTAT departures and posts new ones to Discord.
// Called by a scheduled database job with the project publishable key as bearer.
export const Route = createFileRoute("/api/public/cron/odchody")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authHeader = request.headers.get("authorization");
        const token = authHeader?.replace("Bearer ", "");
        if (!token) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }

        try {
          const { runDepartureCheck } = await import("@/lib/odchody.server");
          const result = await runDepartureCheck({ hourlyStatus: true });
          return Response.json({ success: true, ...result });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error("Odchody cron failed:", msg);
          return Response.json({ success: false, error: msg }, { status: 500 });
        }
      },
    },
  },
});
