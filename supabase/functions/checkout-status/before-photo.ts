// The database grants a single send lease across Stripe retries and incoming texts.
export async function requestBeforePhoto(db:any,creator:string,phone:string,line:string) {
  if (!phone || !line) return;
  const claim=await db.rpc('claim_before_photo_request',{owner_id:creator,sender:phone});
  if(claim.error)throw claim.error;
  if(!claim.data)return;
  const row=()=>db.from('coach_client_intake');
  const response=await fetch('https://api.sendblue.co/api/send-message',{
    method:'POST',headers:{'Content-Type':'application/json','sb-api-key-id':Deno.env.get('SENDBLUE_API_KEY_ID')!,
      'sb-api-secret-key':Deno.env.get('SENDBLUE_API_SECRET_KEY')!},signal:AbortSignal.timeout(10000),
    body:JSON.stringify({number:phone,from_number:line,content:'You’re in! Want a starting photo to look back on? Send a fully clothed photo with BEFORE in the caption and I’ll save it for your trainer. You can also reply SKIP and we’ll get straight to coaching.'})
  });
  if(!response.ok || !(await response.json()).message_handle)throw Error('Photo invitation delivery unconfirmed');
  const saved=await row().update({photo_requested_at:new Date().toISOString()}).eq('creator_id',creator).eq('phone',phone);
  if(saved.error)throw saved.error;
}
