import test from 'node:test';
import assert from 'node:assert/strict';
import {wirePageMessage} from '../page-message.js';

test('public message links carry one page-specific referral and register a lead only on click',async()=>{
  const saved=new Map(), sent=[];
  const originalFetch=globalThis.fetch;
  Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{
    getItem:key=>saved.get(key),setItem:(key,value)=>saved.set(key,value)
  }});
  globalThis.fetch=async(url,options)=>{sent.push(JSON.parse(options.body));};
  try{
    const link=()=>({href:'sms:+12025550101',getAttribute(){return this.href},addEventListener(_,handler){this.click=handler}});
    const [button,number]=[link(),link()];
    wirePageMessage({querySelectorAll:()=>[button,number]},'matthias');
    assert.equal(button.href,number.href);
    assert.equal(sent.length,0);
    button.click();number.click();
    assert.deepEqual(sent[0],sent[1]);
    assert.equal(sent[0].page_slug,'matthias');
    assert.equal(new URL(button.href).searchParams.get('body'),'Start coaching with matthias [ref '+sent[0].click_id+']');
    const repeat=link();wirePageMessage({querySelectorAll:()=>[repeat]},'matthias');
    assert.equal(repeat.href,button.href);
    const another=link();wirePageMessage({querySelectorAll:()=>[another]},'another-creator');another.click();
    assert.notEqual(sent.at(-1).click_id,sent[0].click_id);
  }finally{globalThis.fetch=originalFetch;delete globalThis.localStorage;}
});
