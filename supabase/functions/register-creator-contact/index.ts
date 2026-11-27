// The database issues a short-lived random ticket only for a confirmed creator signup.
const uuid = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
const phonePattern = /^\+[1-9]\d{7,14}$/;
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
async function rpc(name: string, args: Record<string, unknown>) {
  const response = await fetch(Deno.env.get('SUPABASE_URL') + '/rest/v1/rpc/' + name, {
    method: 'POST',
    headers: {apikey: serviceKey, Authorization: 'Bearer ' + serviceKey, 'Content-Type': 'application/json'},
    body: JSON.stringify(args), signal: AbortSignal.timeout(4000)
  });
  if (!response.ok) throw new Error('Storage unavailable');
  const body = await response.text();
  return body ? JSON.parse(body) : null;
}
Deno.serve(async request => {
  if (request.method !== 'POST') return new Response(null, {status:405});
  const payload = await request.json().catch(() => null);
  if (typeof payload?.ticket !== 'string' || !uuid.test(payload.ticket)) return new Response(null,{status:403});
  const work_ticket = payload.ticket;
  const [job] = await rpc('creator_contact_for_worker',{work_ticket});
  if (!job) return new Response(null,{status:403});
  let error_code = null, new_status = null, line = null;
  try {
    const url = 'https://api.sendblue.co/v3/verified-contacts';
    const lookup = job.status === 'pending';
    const response = await fetch(lookup ? url + '/' + encodeURIComponent(job.phone) : url, {
      method: lookup ? 'GET' : 'POST',
      headers: {'Content-Type':'application/json','sb-api-key-id':Deno.env.get('SENDBLUE_API_KEY_ID')!,
        'sb-api-secret-key':Deno.env.get('SENDBLUE_API_SECRET_KEY')!},
      body: lookup ? undefined : JSON.stringify({phone_number:job.phone}),
      signal: AbortSignal.timeout(8000)
    });
    if (!response.ok) {
      error_code = 'sendblue_' + response.status;
      if (lookup && response.status === 404) new_status = 'queued';
    } else {
      const data = (await response.json()).data;
      if (data?.contact?.phone_number !== job.phone || !['verified','pending'].includes(data.contact.verification_status)
          || !phonePattern.test(data.line?.phone_number)) throw new Error('Unexpected provider response');
      new_status = data.contact.verification_status;
      line = data.line.phone_number;
    }
  } catch { error_code = 'provider_unavailable'; }
  await rpc('finish_creator_contact',{work_ticket,new_status,line,error_code});
  return new Response(null,{status:204});
});
