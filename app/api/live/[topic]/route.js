import { LIVE_TOPICS, liveVersion } from '../../../../lib/tms/live';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Hosting platforms end a response after a while; the browser reconnects by itself.
export const maxDuration = 60;

const CHECK_MS = 4000;
const LIFE_MS = 50000;

/**
 * Live updates for open pages (Server-Sent Events).
 *
 * The page opens this address once and keeps the connection; whenever the
 * topic's counter moves (a trustee published an event, added a photo, someone
 * registered) the server sends one small message and the page refreshes its
 * content. This is the "push" half of a websocket, which is all a page that
 * only listens needs, and unlike a websocket it works on serverless hosting
 * and through every proxy. The stream carries a number, never any data.
 */
export async function GET(request, { params }) {
  if (!LIVE_TOPICS.includes(params.topic)) return new Response('Not found', { status: 404 });

  const encoder = new TextEncoder();
  let timer;
  let closed = false;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (text) => { if (!closed) controller.enqueue(encoder.encode(text)); };
      const stop = () => {
        if (closed) return;
        closed = true;
        clearInterval(timer);
        try { controller.close(); } catch { /* already closed by the browser */ }
      };
      request.signal.addEventListener('abort', stop);

      let last = null;
      const started = Date.now();
      const check = async () => {
        try {
          const version = await liveVersion(params.topic);
          if (version !== last) {
            last = version;
            send(`event: version\ndata: ${version}\n\n`);
          } else {
            send(': still here\n\n'); // keeps proxies from closing a quiet connection
          }
        } catch {
          send(': waiting for the database\n\n');
        }
        if (Date.now() - started > LIFE_MS) stop();
      };
      send('retry: 3000\n\n');
      await check();
      timer = setInterval(check, CHECK_MS);
    },
    cancel() {
      closed = true;
      clearInterval(timer);
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
