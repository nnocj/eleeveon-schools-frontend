'use client';
/** Explicit user-initiated encrypted history transfer, from an already approved source device. */
import { supportApi } from './supportApi';
import { ensureOwnDevice, encryptedEnvelope, makeHistoricalKeyTransfer, type PublicSupportDevice } from './supportCrypto';
export type HistoryTransferProgress={conversations:number;processed:number;transferred:number;skipped:number;done:boolean};
export async function transferAllHubHistory(accountId:string,userId:string,linkId:string,target:PublicSupportDevice,
  onProgress:(p:HistoryTransferProgress)=>void,shouldCancel:()=>boolean=()=>false):Promise<HistoryTransferProgress>{
  const source=await ensureOwnDevice(accountId,userId);
  if(source.id===target.id)throw new Error('A device cannot transfer history to itself.');
  let state:HistoryTransferProgress={conversations:0,processed:0,transferred:0,skipped:0,done:false};
  const update=(delta:Partial<HistoryTransferProgress>)=>{state={...state,...delta};onProgress({...state});};
  let cursor:string|undefined;const visited=new Set<string>();
  // No artificial 300-conversation/700-message cap. Pagination stops at server hasMore=false.
  do{
    if(shouldCancel())throw new Error('History transfer cancelled; already transferred keys remain usable.');
    const page=await supportApi.conversationPage(cursor,50);
    for(const conversation of page.conversations){
      if(visited.has(conversation.id))continue;visited.add(conversation.id);
      if(shouldCancel())throw new Error('History transfer cancelled.');
      const known=await supportApi.keys(conversation.id).then(x=>x.devices);
      const newDevice=known.find(x=>x.id===target.id);
      if(!newDevice || newDevice.fingerprint!==target.fingerprint)throw new Error('The newly linked device key changed. Restart verification.');
      const pending:Array<{conversationId:string;messageId:string;wrappedKey:unknown;signature:string}>=[];
      const flush=async()=>{if(!pending.length)return;const chunk=pending.splice(0,pending.length);
        const result=await supportApi.linkHistory(linkId,source.id,chunk);
        update({transferred:state.transferred+result.accepted+result.duplicates});};
      const handle=async(messageId:string,body:string)=>{
        if(!encryptedEnvelope(body))return;
        update({processed:state.processed+1});
        try{
          const signed=await makeHistoricalKeyTransfer(accountId,userId,linkId,conversation.id,messageId,body,known,newDevice);
          pending.push(signed);if(pending.length>=70)await flush();
        }catch{update({skipped:state.skipped+1});}
      };
      if(conversation.description)await handle(`${conversation.id}-opening`,conversation.description);
      let before:string|undefined;const seenMessages=new Set<string>();
      do{
        if(shouldCancel())throw new Error('History transfer cancelled.');
        const messages=await supportApi.messagePage(conversation.id,before,100);
        for(const message of messages.messages){if(seenMessages.has(message.id))continue;seenMessages.add(message.id);
          if(!message.deletedForEveryone)await handle(message.id,message.body);}
        if(!messages.hasMore||!messages.nextCursor)break;
        if(messages.nextCursor===before)throw new Error('History pagination did not advance.');
        before=messages.nextCursor;
      }while(true);
      await flush();update({conversations:state.conversations+1});
    }
    if(!page.hasMore||!page.nextCursor)break;
    if(page.nextCursor===cursor)throw new Error('Conversation pagination did not advance.');
    cursor=page.nextCursor;
  }while(true);
  update({done:true});return state;
}
