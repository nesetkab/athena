import "dotenv/config";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { and, eq, max } from "drizzle-orm";
import { db, sql } from "../db";
import { accounts, imapOps, mailboxState, messages } from "../db/schema"
import { parse } from "path";

type Account = typeof accounts.$inferSelect;
const clients = new Map<number, ImapFlow>();

async function fetchNew(client: ImapFlow, account: Account, uidValidity: number) {
  const [row] = await db.select({ last: max(messages.uid) }).from(messages)
    .where(and(
      eq(messages.accountId, account.id),
      eq(messages.mailbox, 'INBOX'),
      eq(messages.uidValidity, uidValidity)
    ));
  const lastUid = row?.last ?? 0;

  for await (const msg of client.fetch(`${lastUid + 1}:*`, { uid: true, source: true, flags: true }, { uid: true })) {
    if (msg.uid <= lastUid || !msg.source) continue;
    const parsed = await simpleParser(msg.source);

    await db.insert(messages).values({
      accountId: account.id,
      mailbox: "INBOX",
      uid: msg.uid,
      uidValidity,
      messageId: parsed.messageId ?? null,
      inReplyTo: parsed.inReplyTo ?? null,
      refs: Array.isArray(parsed.references) ? parsed.references.join(' ') : parsed.references ?? null,
      subject: parsed.subject ?? '(no subject)',
      fromAddr: parsed.from?.value?.[0]?.address ?? null,
      fromName: parsed.from?.value?.[0]?.name ?? null,
      toAddrs: parsed.to && !Array.isArray(parsed.to) ? parsed.to.value : [],
      date: parsed.date ?? new Date(),
      snippet: (parsed.text ?? '').slice(0, 160),
      textBody: parsed.text ?? null,
      htmlBody: typeof parsed.html === "string" ? parsed.html : null,
      seen: msg.flags?.has('\\Seen') ?? false

    }).onConflictDoNothing();
    await sql.notify('new_mail', String(account.id));
    console.log(`[${account.label}] stored uid ${msg.uid} - ${parsed.subject}`)
  }
}

async function runAccount(account: Account) {
  const conf = {
    host: account.imapHost, port: 993, secure: true,
    auth: { user: account.user, pass: account.pass },
    logger: false as const,
  };
  const idleClient = new ImapFlow(conf);
  const workClient = new ImapFlow(conf);

  await Promise.all([idleClient.connect(), workClient.connect()])
  const mbox = await idleClient.mailboxOpen('INBOX');
  await workClient.mailboxOpen('INBOX');
  const uidValidity = Number(mbox.uidValidity);

  clients.set(account.id, workClient);

  idleClient.on('exists', () => {
    console.log(`[${account.label}] exists event ${new Date().toISOString()}`);
    run('fetchNew', () => fetchNew(workClient, account, uidValidity));
  });

  let queue: Promise<void> = Promise.resolve();
  const pending = new Set<string>();
  const run = (name: string, fn: () => Promise<void>) => {
    if (pending.has(name)) return queue;   // that task is already queued or running
    pending.add(name);
    queue = queue
      .then(async () => {
        const t0 = Date.now();
        console.log(`[${account.label}] ${name} start`);
        await fn();
        console.log(`[${account.label}] ${name} done in ${Date.now() - t0}ms`);
      })
      .catch((e) => console.error(`[${account.label}] ${name} failed`, e))
      .finally(() => pending.delete(name));
    return queue;
  };

  await run('backfill', () => fetchNew(workClient, account, uidValidity));

  idleClient.on('exists', () => run('fetchNew', () => fetchNew(workClient, account, uidValidity)));
  idleClient.on('flags', () => run('reconcile', () => reconcileFlags(workClient, account, uidValidity)));
  setInterval(() => run('reconcile', () => reconcileFlags(workClient, account, uidValidity)), 60_000);
  setInterval(() => run('deletions', () => reconcileDeletions(workClient, account, uidValidity)), 5 * 60_000);
  console.log(`[${account.label}] synced, idling :3`);
}


const all = await db.select().from(accounts);
await Promise.all(all.map(runAccount));
setInterval(processOps, 2000);

async function processOps() {
  const ops = await db.select().from(imapOps)
    .where(eq(imapOps.done, false)).orderBy(imapOps.id);

  for (const op of ops) {
    const client = clients.get(op.accountId);
    if (!client) continue;
    try {
      const flag = op.op.endsWith('seen') ? '\\Seen' : '\\Flagged';
      if (op.op.startsWith('add')) {
        await client.messageFlagsAdd(String(op.uid), [flag], { uid: true });
      } else {
        await client.messageFlagsRemove(String(op.uid), [flag], { uid: true })
      }
      await db.update(imapOps).set({ done: true }).where(eq(imapOps.id, op.id))
    } catch (e) {
      console.error("op ${op.id} failed :(", e)
    }
  }
}

async function reconcileFlags(client: ImapFlow, account: Account, uidValidity: number) {
  const condstore = client.capabilities.has('CONDSTORE');
  const since = condstore ? await getModseq(account.id, 'INBOX', uidValidity) : null;

  if (since === null) {
    await fullFlagScan(client, account, uidValidity);
  } else {
    for await (const msg of client.fetch(`1:*`, { uid: true, flags: true }, { uid: true, changedSince: since })) {
      const seen = msg.flags?.has('\\Seen') ?? false;
      await db.update(messages).set({ seen }).where(and(
        eq(messages.accountId, account.id),
        eq(messages.mailbox, 'INBOX'),
        eq(messages.uidValidity, uidValidity),
        eq(messages.uid, msg.uid)
      ));
    }
  }
  const mbox = client.mailbox;
  if (condstore && typeof mbox === 'object' && mbox.highestModseq) {
    await setModseq(account.id, 'INBOX', uidValidity, mbox.highestModseq);
  }
}

async function fullFlagScan(client: ImapFlow, account: Account, uidValidity: number) {
  const rows = await db.select({ id: messages.id, uid: messages.uid, seen: messages.seen })
    .from(messages)
    .where(and(
      eq(messages.accountId, account.id),
      eq(messages.mailbox, "INBOX"),
      eq(messages.uidValidity, uidValidity)
    ));
  const byUid = new Map(rows.map(r => [r.uid, r]));
  const onServer = new Set<number>();

  for await (const msg of client.fetch(`1:*`, { uid: true, flags: true }, { uid: true })) {
    onServer.add(msg.uid);
    const row = byUid.get(msg.uid);
    if (!row) continue;
    const seen = msg.flags?.has(`\\Seen`) ?? false;
    if (seen !== row.seen) {
      await db.update(messages).set({ seen }).where(eq(messages.id, row.id));
    }
  }

  for (const row of rows) {
    if (!onServer.has(row.uid)) {
      await db.delete(messages).where(eq(messages.id, row.id));
    }
  }

}


async function reconcileDeletions(client: ImapFlow, account: Account, uidValidity: number) {
  const uids = (await client.search({ all: true }, { uid: true })) || [];
  const onServer = new Set(uids);
  const rows = await db.select({ id: messages.id, uid: messages.uid }).from(messages)
    .where(and(
      eq(messages.accountId, account.id),
      eq(messages.mailbox, "INBOX"),
      eq(messages.uidValidity, uidValidity)
    ));
  for (const row of rows) {
    if (!onServer.has(row.uid)) {
      await db.delete(messages).where(eq(messages.id, row.id))
    }
  }
}

async function getModseq(accountId: number, mailbox: string, uidValidity: number) {
  const [row] = await db.select().from(mailboxState).where(and(
    eq(mailboxState.accountId, accountId),
    eq(mailboxState.mailbox, mailbox),
    eq(mailboxState.uidValidity, uidValidity)
  ));
  return row?.highestModseq ?? null;
}

async function setModseq(accountId: number, mailbox: string, uidValidity: number, modseq: bigint) {
  await db.insert(mailboxState)
    .values({ accountId, mailbox, uidValidity, highestModseq: modseq })
    .onConflictDoUpdate({
      target: [mailboxState.accountId, mailboxState.mailbox, mailboxState.uidValidity],
      set: { highestModseq: modseq }
    })
}
