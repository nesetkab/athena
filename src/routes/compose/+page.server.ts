import { sendMail } from '$lib/server/mail/send.js';
import { fail } from '@sveltejs/kit';


export const actions = {
  default: async ({ request }) => {
    const data = await request.formData();
    const to = String(data.get('to') ?? '');
    const subject = String(data.get('subject') ?? '');
    const body = String(data.get('body') ?? '');
    if (!to || !body) return fail(400, { error: 'missing fields' });

    await sendMail(1, { to, subject, text: body });
    return { sent: true };
  }
}
