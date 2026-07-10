import { sql } from "$lib/server/db";

export async function GET() {
  let unlisten: (() => void) | undefined;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: string) => controller.enqueue(`data: ${data}\n\n`);

      send('connected');
      const { unlisten: stop } = await sql.listen('new_mail', (payload) => send(payload));
      unlisten = stop;
    },
    cancel() {
      unlisten?.();
    }
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    }
  })
}
