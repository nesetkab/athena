import { db } from "$lib/server/db";
import { messages } from "$lib/server/db/schema";
import { desc } from "drizzle-orm";

export async function load() {
  return { inbox: await db.select().from(messages).orderBy(desc(messages.date)).limit(50) }
}
