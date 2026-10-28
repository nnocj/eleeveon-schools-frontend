"use client";
/** Authenticated Eleeveon support API. Never copy encrypted support content into school SyncRecord. */
import { getApiBaseUrl, getAuthToken } from "../sync/syncConfig";
import type { PublicSupportDevice } from "./supportCrypto";

export type SupportAttachment = { name: string; mimeType: string; sizeBytes: number; kind: "image"|"video"|"audio"|"document"; url: string|null; encrypted?: boolean };
export type SupportMessage = { id:string; feedbackId:string; authorType:string; authorUserId?:string|null; body:string; attachments?:SupportAttachment[]; internal:boolean; createdAt:string; deletedForEveryone?:boolean };
export type SupportConversation = {id:string; accountId?:string|null; subject:string; description:string;displayTitle?:string|null;type:string;status:string;priority?:string;organizationName?:string;createdAt:string;updatedAt:string;metadata?:Record<string,unknown>|null;submittedByUserId?:string|null; unreadCount?:number;lastMessage?:{body:string;createdAt:string;authorType:string}|null};
export type SupportUnread = { total:number; conversations:Array<{id:string;unreadCount:number}> };
async function request<T>(path:string,init:RequestInit={}):Promise<T>{
 const base=getApiBaseUrl(),token=getAuthToken();
 if(!base)throw new Error("The Eleeveon API address is not configured.");
 if(!token)throw new Error("Your session is unavailable. Please sign in again.");
 const response=await fetch(`${base}${path}`,{...init,headers:{Authorization:`Bearer ${token}`,...(!(init.body instanceof FormData)?{"Content-Type":"application/json"}:{}),...init.headers},cache:"no-store"});
 const raw=await response.text();let parsed:any=null;
 try{parsed=raw?JSON.parse(raw):null;}catch{parsed={message:raw};}
 if(!response.ok){const message=parsed?.message||parsed?.error||`Support request failed (${response.status}).`;throw new Error(Array.isArray(message)?message.join("; "):String(message));}
 return parsed as T;
}
export type SurveyQuestion={id:string;label:string;type:"text"|"long_text"|"single"|"multiple"|"yes_no"|"rating";required:boolean;options?:string[]};
export type EleeveonSurvey={id:string;title:string;description?:string|null;questions:SurveyQuestion[];targeting?:Record<string,unknown>|null;status:string;completedAt?:string|null;createdAt:string};
export type SupportPresence={online:boolean;people:{userId:string;activity:string;updatedAt:string}[]};
export type SupportCallSignal={id:string;feedbackId:string;fromUserId:string;sessionId:string;kind:string;payload:any;createdAt:string};
export type SupportDirectory={accounts:{id:string;name:string;email?:string|null}[];users:{id:string;fullName:string;email:string}[];memberships:{userId:string;role:string;schoolId?:string|null;branchId?:string|null}[]};
const enc=(value:string)=>encodeURIComponent(value);
export const supportApi={
 beginDirectUpload:(id:string,messageId:string,sizeBytes:number)=>request<{uploadId:string;signedUrl:string;maxBytes:number}>(`/support/conversations/${enc(id)}/direct-uploads`,{method:"POST",body:JSON.stringify({messageId,sizeBytes})}),
 directory:(accountId?:string)=>request<SupportDirectory>(`/support/directory${accountId?`?accountId=${enc(accountId)}`:""}`),
 invite:(data:{accountId:string;scope:"account"|"user"|"role";userId?:string;role?:string;schoolId?:string;branchId?:string})=>request<{conversation:SupportConversation}>("/support/invitations",{method:"POST",body:JSON.stringify(data)}),
 heartbeat:(id:string,activity:"online"|"typing"|"recording")=>request(`/support/conversations/${enc(id)}/presence`,{method:"POST",body:JSON.stringify({activity})}),
 presence:(id:string)=>request<SupportPresence>(`/support/conversations/${enc(id)}/presence`),
 callConfig:()=>request<{iceServers:RTCIceServer[];turnConfigured:boolean}>("/support/calls/config"),
 sendSignal:(id:string,kind:string,sessionId:string,payload:any)=>request(`/support/conversations/${enc(id)}/call-signals`,{method:"POST",body:JSON.stringify({kind,sessionId,payload})}),
 signals:(id:string,since:number)=>request<{signals:SupportCallSignal[]}>(`/support/conversations/${enc(id)}/call-signals?since=${enc(String(since))}`),
 surveys:()=>request<{surveys:EleeveonSurvey[];platform:boolean}>("/support/surveys"),
 createSurvey:(data:{title:string;description:string;questions:SurveyQuestion[];status:string;targeting:Record<string,unknown>;closesAt:string|null})=>request<{survey:EleeveonSurvey}>("/support/surveys",{method:"POST",body:JSON.stringify(data)}),
 submitSurvey:(id:string,answers:Record<string,string|string[]>)=>request<{response:{id:string}}>(`/support/surveys/${enc(id)}/responses`,{method:"POST",body:JSON.stringify({answers})}),
 surveyResults:(id:string)=>request<{survey:EleeveonSurvey;count:number;responses:{accountId:string;answers:Record<string,string|string[]>}[]}>(`/support/surveys/${enc(id)}/results`),
 surveyStatus:(id:string,status:string)=>request(`/support/surveys/${enc(id)}/status`,{method:"PATCH",body:JSON.stringify({status})}),
 keys:(conversationId?:string)=>request<{devices:(PublicSupportDevice & {revoked?:boolean})[]}>(`/support/keys${conversationId?`?conversationId=${enc(conversationId)}`:""}`),
 registerKey:(data:{id:string;encryptionPublicJwk:JsonWebKey;signingPublicJwk:JsonWebKey})=>request<{device:PublicSupportDevice}>("/support/keys",{method:"POST",body:JSON.stringify(data)}),
 list:()=>request<{conversations:SupportConversation[];unreadTotal?:number}>("/support/conversations"),
 open:(id:string)=>request<{conversation:SupportConversation;messages:SupportMessage[]}>(`/support/conversations/${enc(id)}`),
 create:(data:{subject:string;body:string;type:string;schoolId?:string;branchId?:string;membershipId?:string;name?:string;encrypted?:boolean;conversationId?:string;pending?:boolean})=>request<{conversation:SupportConversation}>("/support/conversations",{method:"POST",body:JSON.stringify(data)}),
 send:(id:string,body:string,file?:File,clientId?:string,encrypted=false,uploadId?:string)=>{const form=new FormData();form.append("body",body);if(encrypted)form.append("encrypted","true");if(file)form.append("file",file,file.name);if(clientId)form.append("clientId",clientId);if(uploadId)form.append("uploadId",uploadId);return request<{message:SupportMessage}>(`/support/conversations/${enc(id)}/messages`,{method:"POST",body:form});},
 renameConversation:(id:string,title:string)=>request<{ok:boolean;displayTitle:string}>(`/support/conversations/${enc(id)}/title`,{method:'PATCH',body:JSON.stringify({title})}),
 removeConversation:(id:string)=>request<{ok:boolean;feedbackId:string}>(`/support/conversations/${enc(id)}`,{method:'DELETE'}),
 status:(id:string,status:string)=>request<{conversation:SupportConversation}>(`/support/conversations/${enc(id)}/status`,{method:"PATCH",body:JSON.stringify({status})}),
 unread:()=>request<SupportUnread>("/support/unread"),
 markRead:(id:string)=>request<{ok:boolean;feedbackId:string;readAt:string}>(`/support/conversations/${enc(id)}/read`,{method:"POST"}),
 deleteMessage:(id:string,messageId:string,scope:"me"|"everyone")=>request<{ok:boolean;messageId:string;scope:string}>(`/support/conversations/${enc(id)}/messages/${enc(messageId)}?scope=${scope}`,{method:"DELETE"}),
 devices:()=>request<{devices:Array<{id:string;fingerprint:string;registeredAt:string;linkedAt:string|null;revokedAt:string|null;linkedByDeviceId?:string|null;deviceName?:string|null;status:'pending'|'linked'|'revoked'}>}>('/support/devices'),
 linkStart:(targetDeviceId:string,deviceName?:string)=>request<{id:string;code:string;expiresAt:string;qrPayload:string;targetDeviceId:string;targetFingerprint:string}>('/support/device-links',{method:'POST',body:JSON.stringify({targetDeviceId,deviceName})}),
 linkLookup:(code:string)=>request<{id:string;targetDeviceId:string;targetFingerprint:string;deviceName:string;challenge:string;expiresAt:string}>('/support/device-links/lookup',{method:'POST',body:JSON.stringify({code})}),
 linkApprove:(id:string,data:{code:string;sourceDeviceId:string;signature:string})=>request<{status:string;targetDeviceId:string;sourceDeviceId:string}>(`/support/device-links/${enc(id)}/approve`,{method:'POST',body:JSON.stringify(data)}),
 linkStatus:(id:string)=>request<{id:string;status:'pending'|'approved'|'completed'|'expired'|'cancelled';targetDeviceId:string;approvedByDeviceId?:string|null;expiresAt:string}>(`/support/device-links/${enc(id)}`),
 linkCancel:(id:string)=>request<{status:string}>(`/support/device-links/${enc(id)}`,{method:'DELETE'}),
 linkHistory:(id:string,sourceDeviceId:string,items:Array<{conversationId:string;messageId:string;wrappedKey:unknown;signature:string}>)=>request<{accepted:number;duplicates:number}>(`/support/device-links/${enc(id)}/history-keys`,{method:'POST',body:JSON.stringify({sourceDeviceId,items})}),
 linkComplete:(id:string,sourceDeviceId:string,signature:string)=>request<{status:string}>(`/support/device-links/${enc(id)}/complete`,{method:'POST',body:JSON.stringify({sourceDeviceId,signature})}),
 revokeDevice:(deviceId:string,sourceDeviceId:string,signature:string)=>request<{revoked:boolean}>(`/support/devices/${enc(deviceId)}/revoke`,{method:'POST',body:JSON.stringify({sourceDeviceId,signature})}),
 conversationPage:(before?:string,limit=50)=>request<{conversations:SupportConversation[];hasMore:boolean;nextCursor:string|null}>(`/support/conversations/history-pages?limit=${limit}${before?`&before=${enc(before)}`:''}`),
 messagePage:(id:string,before?:string,limit=75,deviceId?:string)=>request<{messages:SupportMessage[];historyKeys:Array<import('./supportCrypto').SupportHistoryKeyRecord>;openingHistoryKey:import('./supportCrypto').SupportHistoryKeyRecord|null;hasMore:boolean;nextCursor:string|null}>(`/support/conversations/${enc(id)}/messages?limit=${limit}${before?`&before=${enc(before)}`:''}${deviceId?`&deviceId=${enc(deviceId)}`:''}`),
 backgrounds:()=>request<{selected:{kind:'default'|'builtin'|'personal';key:string|null};uploads:Array<{id:string;name:string;mimeType:string;sizeBytes:number;url:string|null}>}>('/support/backgrounds'),
 backgroundUpload:(file:File)=>{const form=new FormData();form.append('file',file,file.name);return request<{background:{id:string;name:string;mimeType:string;sizeBytes:number;url:string|null}}>('/support/backgrounds',{method:'POST',body:form});},
 backgroundSelect:(kind:'default'|'builtin'|'personal',key?:string)=>request<{selected:{kind:string;key:string|null}}>('/support/backgrounds/selection',{method:'PATCH',body:JSON.stringify({kind,key})}),
 backgroundRemove:(id:string)=>request<{removed:boolean}>(`/support/backgrounds/${enc(id)}`,{method:'DELETE'}),
};
