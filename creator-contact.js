export function normalizeCreatorPhone(input) {
  const compact = input.trim().replace(/[\s().-]/g, '');
  if (/^\d{10}$/.test(compact)) return '+1' + compact;
  if (/^1\d{10}$/.test(compact)) return '+' + compact;
  return /^\+[1-9]\d{7,14}$/.test(compact) ? compact : null;
}

export async function showCreatorContact(db, panel) {
  let timer;
  async function refresh() {
    clearTimeout(timer);
    const {data, error} = await db.rpc('my_creator_contact_status');
    if (error) { timer = setTimeout(refresh, 60000); return; }
    const request = data?.[0];
    if (!request) return;
    const message = panel.querySelector('span');
    const link = panel.querySelector('a');
    panel.hidden = false;
    link.hidden = true;
    if (request.status === 'verified') {
      message.textContent = 'Your creator mobile number is verified.';
      return;
    }
    if (request.status === 'pending' && /^\+[1-9]\d{7,14}$/.test(request.assigned_line)) {
      message.textContent = 'Send a text from the mobile number you signed up with to verify creator messaging.';
      link.href = 'sms:' + request.assigned_line;
      link.textContent = 'Text ' + request.assigned_line;
      link.hidden = false;
    } else {
      message.textContent = 'We’re setting up creator messaging. Your verification number will appear here.';
    }
    timer = setTimeout(refresh, 30000);
  }
  await refresh();
}
