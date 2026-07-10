import { eq } from "drizzle-orm";
import { db } from "../db"
import { accounts } from "../db/schema"
import nodemailer from "nodemailer"

export async function sendMail(accountId: number, opts: {
  to: string,
  subject: string,
  text: string,
  inReplyTo?: string,
  references?: string
}) {
  const [account] = await db.select().from(accounts)
    .where(eq(accounts.id, accountId));
  if (!account) throw new Error(`no account ${accountId}`)

  const transport = nodemailer.createTransport({
    host: account.smtpHost,
    port: 465,
    secure: true,
    auth: { user: account.user, pass: account.pass },
  })

  return transport.sendMail({
    from: account.email,
    to: opts.to,
    subject: opts.subject,
    text: opts.text,
    inReplyTo: opts.inReplyTo,
    references: opts.references
  })
}
