import { error } from "@sveltejs/kit";
import { eq } from "drizzle-orm";
import { db } from "$lib/server/db";
import { imapOps, messages } from "$lib/server/db/schema";

export async function load({ params }) {
  const [msg] = await db.select().from(messages).where(eq(messages.id, Number(params.id)));
  if (!msg) error(404, 'msg not found :(')


  return { msg }
}
