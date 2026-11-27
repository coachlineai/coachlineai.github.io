import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {test} from 'node:test';

const script = readFileSync(new URL('../payment.js',import.meta.url),'utf8');
const ticket='11111111-1111-4111-8111-111111111111';
function checkout(hash,reply) {
  const elements=new Map(), requests=[];
  function element(id) {
    if(!elements.has(id)) elements.set(id,{hidden:true,append(){},replaceChildren(){}});
    return elements.get(id);
  }
  runInNewContext(script,{
    location:{hash},URLSearchParams,Intl,
    document:{getElementById:element,createElement:()=>({append(){}})},
    sessionStorage:{getItem:()=>null},
    fetch:async (url,options)=>{
      requests.push({url,body:JSON.parse(options.body)});
      return {ok:true,json:async()=>({line:reply})};
    }
  });
  return {element,requests};
}
test('a personal simulation needs opt-in, uses its invite, and opens the creator line',async()=>{
  const {element,requests}=checkout('#preview=once&intake='+ticket,'+12025550199');
  const action=element('action'),consent=element('consent');
  await action.onclick();
  assert.equal(requests.length,0);
  consent.checked=true;consent.onchange();
  await action.onclick();
  assert.deepEqual(requests[0].body,{action:'intake-simulate',ticket,consent:true});
  assert.equal(element('sms').href,'sms:+12025550199');
  assert.equal(element('sms').hidden,false);
});
test('anonymous checkout never activates coaching and an expired invite never shows success',async()=>{
  const demo=checkout('#preview=once',null);
  await demo.element('action').onclick();
  assert.equal(demo.requests.length,0);
  const expired=checkout('#preview=year&intake='+ticket,null);
  expired.element('consent').checked=true;expired.element('consent').onchange();
  await expired.element('action').onclick();
  assert.equal(expired.element('sms').hidden,true);
  assert.match(expired.element('message').textContent,/fresh personal link/);
});
