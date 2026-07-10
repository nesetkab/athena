import { error, json } from "@sveltejs/kit";
import { eq } from "drizzle-orm";
import { db } from "$lib/server/db";
import { imapOps, messages } from "$lib/server/db/schema";

export async function POST({ params }) {
  const [msg] = await db.select().from(messages).where(eq(messages.id, Number(params.id)));
  if (!msg) error(404, 'msg not found :(')

  if (!msg.seen) {
    await db.update(messages).set({ seen: true }).where(eq(messages.id, msg.id));
    await db.insert(imapOps).values({
      accountId: msg.accountId,
      mailbox: msg.mailbox,
      uid: msg.uid,
      op: 'add_seen'
    });
    msg.seen = true;
  }
  return json({ ok: true });
}
