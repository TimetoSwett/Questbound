import { auth } from '@/auth';
import { getUserRole } from '@/lib/campaign-helpers';
import { shouldDeliver, subscribe, type RealtimeEvent } from '@/lib/realtime';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const HEARTBEAT_MS = Number(process.env.REALTIME_HEARTBEAT_MS) || 25_000;

type Context = { params: Promise<{ id: string }> };

// GET /api/campaigns/:id/events — Server-Sent Events stream of invalidations
// for one campaign. Payload is only {topic, version?}; clients refetch through
// the filtered REST routes, so nothing hidden ever travels on this stream.
// gmOnly events (e.g. secret rolls) go to DM connections only; events with
// userIds (one player's Bestiary unlocks) go to those players and the DM.
export async function GET(request: Request, context: Context) {
  const { id: campaignId } = await context.params;
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  let role = await getUserRole(userId, campaignId);
  if (!role) return Response.json({ error: 'Not a member' }, { status: 403 });
  const sessionExpires = session.expires ? Date.parse(session.expires) : NaN;

  const enc = new TextEncoder();
  let cleanup = () => {};
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const send = (chunk: string) => {
        if (closed) return;
        try { controller.enqueue(enc.encode(chunk)); } catch { close(); }
      };
      const close = (reason?: string) => {
        if (closed) return;
        if (reason) send(`event: bye\ndata: ${JSON.stringify({ reason })}\n\n`);
        closed = true;
        clearInterval(hb);
        unsub();
        request.signal.removeEventListener('abort', onAbort);
        try { controller.close(); } catch { /* already closed */ }
      };
      const onAbort = () => close();

      const unsub = subscribe(campaignId, (evt: RealtimeEvent) => {
        if (!shouldDeliver(evt, userId, role ?? '')) return;
        const data: { topic: string; version?: number } = { topic: evt.topic };
        if (evt.version !== undefined) data.version = evt.version;
        send(`event: update\ndata: ${JSON.stringify(data)}\n\n`);
      });

      // Heartbeat: keeps Cloudflare/proxies from idling the connection out,
      // and re-validates the session and membership so removed players or
      // expired sessions stop receiving events.
      const hb = setInterval(async () => {
        if (closed) return;
        try {
          if (Number.isFinite(sessionExpires) && Date.now() >= sessionExpires) return close('session-expired');
          const current = await getUserRole(userId, campaignId);
          if (!current) return close('not-a-member');
          role = current;
          send(`: hb ${Date.now()}\n\n`);
        } catch {
          send(`: hb\n\n`); // transient DB error: keep the stream, try again next beat
        }
      }, HEARTBEAT_MS);

      request.signal.addEventListener('abort', onAbort);
      cleanup = () => close();
      send(`retry: 5000\nevent: ready\ndata: ${JSON.stringify({ role: role === 'dm' ? 'dm' : 'player' })}\n\n`);
    },
    cancel() { cleanup(); },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-store, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
