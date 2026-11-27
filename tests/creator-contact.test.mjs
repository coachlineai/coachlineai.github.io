import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeCreatorPhone} from '../creator-contact.js';

test('creator phones normalize US local and explicit international numbers', () => {
  assert.equal(normalizeCreatorPhone('(202) 555-0123'), '+12025550123');
  assert.equal(normalizeCreatorPhone('+44 7700 900123'), '+447700900123');
  assert.equal(normalizeCreatorPhone('1 202 555 0123'), '+12025550123');
  for (const invalid of ['1234', '2025550123 ext 1', '+0123456789']) assert.equal(normalizeCreatorPhone(invalid), null);
});

test('worker registers, checks the provider state, and rejects unknown tickets', async () => {
  const ticket = '00000000-0000-4000-8000-000000000001';
  let handler, job, providerStatus, saved, calls;
  const phone = '+12025550123', line = '+12025550101';
  const original = globalThis.fetch;
  globalThis.Deno = {env:{get:()=>'fixture'},serve: fn => { handler=fn; }};
  try {
    await import('../supabase/functions/register-creator-contact/index.ts');
    globalThis.fetch = async (url, options) => {
      if (url.endsWith('creator_contact_for_worker')) return Response.json(job ? [job] : []);
      if (url.endsWith('finish_creator_contact')) {
        saved=JSON.parse(options.body);
        return new Response(null,{status:204});
      }
      calls.push([url,options.method,options.body]);
      return Response.json({data:{contact:{phone_number:phone,verification_status:providerStatus},line:{phone_number:line}}});
    };
    const run = () => handler(new Request('https://example.invalid',{method:'POST',body:JSON.stringify({ticket})}));
    calls=[];
    assert.equal((await run()).status,403);
    assert.equal(calls.length,0);
    job={phone,status:'queued'}; providerStatus='pending';
    assert.equal((await run()).status,204);
    assert.equal(calls[0][1],'POST');
    assert.deepEqual(JSON.parse(calls[0][2]),{phone_number:phone});
    assert.equal(saved.new_status,'pending');
    assert.equal(saved.line,line);
    job.status='pending'; providerStatus='verified';
    await run();
    assert.equal(calls[1][1],'GET');
    assert.equal(saved.new_status,'verified');
    providerStatus='unexpected';
    await run();
    assert.equal(saved.new_status,null);
    assert.ok(saved.error_code);
  } finally {
    globalThis.fetch=original;
    delete globalThis.Deno;
  }
});
