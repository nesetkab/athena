import { pgTable, serial, integer, text, bigint, jsonb, timestamp, boolean, uniqueIndex } from 'drizzle-orm/pg-core';

export const accounts = pgTable('accounts', {
  id: serial("id").primaryKey(),
  label: text("label").notNull(),
  email: text("email").notNull(),
  imapHost: text("imap_host").notNull(),
  smtpHost: text("smtp_host").notNull(),
  user: text('user').notNull(),
  pass: text('pass').notNull()
})

export const imapOps = pgTable('imap_ops', {
  id: serial("id").primaryKey(),
  accountId: integer("account_id").notNull(),
  mailbox: text("mailbox").notNull(),
  uid: integer("uid").notNull(),
  op: text("op").notNull(),
  done: boolean("done").default(false)
})

export const mailboxState = pgTable('mailbox_state', {
  id: serial('id').primaryKey(),
  accountId: integer('account_id').notNull(),
  mailbox: text('mailbox').notNull(),
  uidValidity: bigint('uid_validity', { mode: 'number' }).notNull(),
  highestModseq: bigint('highest_modseq', { mode: 'bigint' }).notNull(),
}, (t) => [
  uniqueIndex('mailbox_state_unique').on(t.accountId, t.mailbox, t.uidValidity)
])

export const messages = pgTable('messages', {

  id: serial("id").primaryKey(),
  accountId: integer('account_id').notNull().references(() => accounts.id),
  mailbox: text("mailbox").notNull(),
  uid: integer("uid").notNull(),
  uidValidity: bigint("uid_validity", { mode: "number" }).notNull(),
  messageId: text("message_id"),
  inReplyTo: text("in_reply_to"),
  refs: text("refs"),
  subject: text("subject"),
  fromAddr: text("from_addr"),
  fromName: text("from_name"),
  toAddrs: jsonb("to_addrs"),
  date: timestamp("date", { withTimezone: true }),
  snippet: text("snippet"),
  textBody: text("text_body"),
  htmlBody: text("html_body"),
  seen: boolean('seen').notNull().default(false)
}, (t) => [
  uniqueIndex("msg_unique").on(t.accountId, t.mailbox, t.uidValidity, t.uid)
]);

export const task = pgTable('task', {
  id: serial('id').primaryKey(),
  title: text('title').notNull(),
  priority: integer('priority').notNull().default(1)
});

