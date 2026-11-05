import type { EffectiveAccessResponse } from './types';
import { normalizeAccessResponse } from '../commercial/normalizeAccess';
const API_BASE=process.env.NEXT_PUBLIC_API_URL?.replace(/\/+$/,'')??'';
function token():string|null {
  if(typeof window==='undefined')return null;
  return localStorage.getItem('eleeveon_access_token')??localStorage.getItem('access_token')??localStorage.getItem('token');
}
async function request(path:string,method='GET'):Promise<EffectiveAccessResponse> {
  const auth=token();
  const response=await fetch(`${API_BASE}${path}`,{method,headers:{Accept:'application/json','Content-Type':'application/json',...(auth?{Authorization:`Bearer ${auth}`}:{})},cache:'no-store'});
  if(!response.ok){let message=`Request failed with status ${response.status}.`;try{const b=await response.json() as {message?:string|string[]};message=Array.isArray(b.message)?b.message.join('; '):b.message??message;}catch{}throw new Error(message);}
  return normalizeAccessResponse(await response.json());
}
export const fetchCurrentAccess=()=>request('/entitlements/current');
/** Rebuild is a privileged write and must be server-guarded. Do not call
 * automatically on page load or offline fallback. */
export const rebuildCurrentAccess=()=>request('/entitlements/rebuild','POST');
